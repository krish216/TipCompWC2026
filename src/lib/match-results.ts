/**
 * match-results.ts — shared logic for applying a match result and its side effects.
 *
 * Both the manual admin path (POST /api/results) and the automated cron
 * (/api/scores/sync) funnel through the same helpers here so the two never
 * diverge: scoring is handled by a DB trigger on the fixtures UPDATE, while
 * score notifications and prize-challenge settlement live in app code.
 */

const RAPID_HOST = 'api-football-v1.p.rapidapi.com'

// ── API-Football (via RapidAPI) ────────────────────────────────────────────────
/** Query the v3 /fixtures endpoint. `query` is the raw querystring, e.g. `ids=1-2-3`. */
export async function apiFootballFixtures(query: string, apiKey: string): Promise<any[]> {
  const res = await fetch(`https://${RAPID_HOST}/v3/fixtures?${query}`, {
    headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': RAPID_HOST },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`API-Football ${res.status}`)
  const json = await res.json()
  return json.response ?? []
}

/** Match statuses that mean the game is over and the score is final. */
export const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN'])

// ── Team-name normalisation ─────────────────────────────────────────────────────
// Maps the various spellings of the same nation (our seed vs API-Football) to a
// single canonical token, so name-based matching is robust.
const TEAM_ALIASES: Record<string, string> = {
  southkorea: 'korea', korearepublic: 'korea', korea: 'korea',
  usa: 'usa', unitedstates: 'usa', unitedstatesofamerica: 'usa',
  iran: 'iran', iriran: 'iran',
  cotedivoire: 'ivorycoast', ivorycoast: 'ivorycoast',
  caboverde: 'capeverde', capeverde: 'capeverde', capeverdeislands: 'capeverde',
  curazao: 'curacao', curacao: 'curacao',
  czechia: 'czechrepublic', czechrepublic: 'czechrepublic',
}

/** Canonical, accent/punctuation-insensitive team token used for matching. */
export function canonTeam(name?: string | null): string {
  if (!name) return ''
  const n = name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase().replace(/[^a-z0-9]/g, '')           // strip spaces/punctuation
  return TEAM_ALIASES[n] ?? n
}

/** True when a fixture's team is still an unresolved placeholder (e.g. "TBD R16-1"). */
export function isPlaceholderTeam(name?: string | null): boolean {
  return !name || /tbd|winner|runner|loser|\b[12][a-l]\b/i.test(name)
}

// ── Side effects shared by manual + auto result entry ───────────────────────────
type Admin = any // SupabaseClient (admin/service-role) — typed loosely to match existing code

/**
 * Send "score update" in-app notifications to everyone who tipped this fixture.
 * Assumes the DB scoring trigger has already run (synchronous on the fixtures UPDATE),
 * so predictions carry their points. Fire-and-forget — never throws.
 */
export async function notifyScoreUpdate(admin: Admin, fixtureId: number): Promise<void> {
  try {
    const { createNotifications } = await import('@/lib/notifications')
    const { data: fx } = await admin
      .from('fixtures')
      .select('home, away, home_score, away_score')
      .eq('id', fixtureId)
      .single()
    if (!fx || fx.home_score == null || fx.away_score == null) return

    const { data: preds } = await admin
      .from('predictions')
      .select('user_id, points_earned, home_pred, away_pred')
      .eq('fixture_id', fixtureId)
      .not('points_earned', 'is', null)
    if (!preds?.length) return

    const homeName = fx.home ?? 'Home'
    const awayName = fx.away ?? 'Away'
    await createNotifications((preds as any[]).map((p) => {
      const pts = p.points_earned ?? 0
      return {
        user_id: p.user_id,
        type: 'score_update' as const,
        title: `⚽ ${homeName} ${fx.home_score}–${fx.away_score} ${awayName} — ${pts} pt${pts !== 1 ? 's' : ''} earned`,
        body: `Your tip: ${p.home_pred}–${p.away_pred}`,
        data: { fixture_id: fixtureId, points_earned: pts },
      }
    }))
  } catch { /* notifications are best-effort */ }
}

/**
 * Settle any open prize challenges for a fixture: anyone who predicted the exact
 * score (within the challenge's comp) becomes a winner, then the challenge is closed.
 * Service-role only — safe to call from the cron (no session required).
 */
export async function settleChallengesForFixture(
  admin: Admin,
  fixtureId: number,
): Promise<{ settled: number; winners: number }> {
  const { data: fixture } = await admin
    .from('fixtures')
    .select('id, home, away, home_score, away_score')
    .eq('id', fixtureId)
    .single()
  if (!fixture || fixture.home_score == null) return { settled: 0, winners: 0 }

  const { home_score, away_score } = fixture as any

  const { data: challenges } = await admin
    .from('comp_challenges')
    .select('id, comp_id')
    .eq('fixture_id', fixtureId)
    .eq('settled', false)
  if (!challenges?.length) return { settled: 0, winners: 0 }

  let winners = 0
  for (const challenge of challenges as any[]) {
    const { data: orgMembers } = await admin.from('users').select('id').eq('comp_id', challenge.comp_id)
    const memberIds = (orgMembers ?? []).map((m: any) => m.id)
    if (memberIds.length === 0) continue

    const { data: exactPreds } = await admin
      .from('predictions')
      .select('user_id, home, away')
      .eq('fixture_id', fixtureId)
      .eq('home', home_score)
      .eq('away', away_score)
      .in('user_id', memberIds)

    for (const pred of (exactPreds ?? []) as any[]) {
      await admin.from('challenge_winners').upsert({
        challenge_id: challenge.id,
        user_id: pred.user_id,
        prediction: `${pred.home}–${pred.away}`,
      })
      winners++
    }

    await admin.from('comp_challenges').update({ settled: true }).eq('id', challenge.id)
  }

  return { settled: challenges.length, winners }
}
