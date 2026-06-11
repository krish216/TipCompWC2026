/**
 * match-results.ts — shared logic for applying a match result and its side effects.
 *
 * Both the manual admin path (POST /api/results) and the automated cron
 * (/api/scores/sync) funnel through the same helpers here so the two never
 * diverge: scoring is handled by a DB trigger on the fixtures UPDATE, while
 * score notifications and prize-challenge settlement live in app code.
 */

// ── football-data.org (v4) — match results provider ─────────────────────────────
// Free tier includes the FIFA World Cup (competition code "WC"). Auth: X-Auth-Token.
const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4'
export const FOOTBALL_DATA_COMPETITION = process.env.FOOTBALL_DATA_COMPETITION ?? 'WC'

/** True when a football-data.org API token is configured. */
export function footballDataConfigured(): boolean {
  return !!process.env.FOOTBALL_DATA_TOKEN
}

/** Raw GET against any v4 path — returns the parsed payload + httpStatus. */
export async function footballDataRaw(path: string): Promise<any> {
  const token = process.env.FOOTBALL_DATA_TOKEN
  if (!token) throw new Error('FOOTBALL_DATA_TOKEN not configured')
  const res = await fetch(`${FOOTBALL_DATA_BASE}/${path}`, {
    headers: { 'X-Auth-Token': token },
    cache: 'no-store',
  })
  const json = await res.json().catch(() => ({}))
  return { httpStatus: res.status, ...json }
}

/** All matches for the configured competition (World Cup by default) — one call. */
export async function footballDataMatches(season?: string): Promise<any[]> {
  const s = season ?? process.env.FOOTBALL_DATA_SEASON
  const json = await footballDataRaw(`competitions/${FOOTBALL_DATA_COMPETITION}/matches${s ? `?season=${s}` : ''}`)
  if (json.httpStatus >= 400) {
    throw new Error(`football-data HTTP ${json.httpStatus}: ${json.message ?? json.error ?? ''}`)
  }
  return json.matches ?? []
}

/** Match statuses that mean the game is over and the score is final. */
export const FINISHED_STATUSES = new Set(['FINISHED', 'AWARDED'])

/**
 * Normalise a football-data score node into our model: the LEVEL score (excluding
 * any penalty shootout — football-data folds the shootout into fullTime) plus which
 * side won (which, for a shootout, is the penalty winner). Handles the home/away
 * key variants seen across v4 responses.
 */
export function normaliseScore(score: any): { home: number; away: number; isShootout: boolean; winner: 'HOME' | 'AWAY' | 'DRAW' | null } | null {
  if (!score) return null
  const ft = score.fullTime ?? {}
  let home = ft.home ?? ft.homeTeam
  let away = ft.away ?? ft.awayTeam
  if (home == null || away == null) return null
  const isShootout = score.duration === 'PENALTY_SHOOTOUT'
  if (isShootout) {
    const pens = score.penalties ?? {}
    home -= (pens.home ?? pens.homeTeam ?? 0)   // strip shootout goals → pre-shootout draw
    away -= (pens.away ?? pens.awayTeam ?? 0)
  }
  const winner = score.winner === 'HOME_TEAM' ? 'HOME'
    : score.winner === 'AWAY_TEAM' ? 'AWAY'
    : score.winner === 'DRAW' ? 'DRAW' : null
  return { home, away, isShootout, winner }
}

// ── ESPN (free, unofficial) — live-score source for the World Cup ───────────────
// ESPN's hidden scoreboard API has WC scores the football-data free tier withholds.
// No key. Queried by date(s): YYYYMMDD or YYYYMMDD-YYYYMMDD.
const ESPN_BASE   = 'https://site.api.espn.com/apis/site/v2/sports/soccer'
const ESPN_LEAGUE = process.env.ESPN_LEAGUE ?? 'fifa.world'

export async function espnScoreboard(dates: string): Promise<any[]> {
  const res = await fetch(`${ESPN_BASE}/${ESPN_LEAGUE}/scoreboard?dates=${dates}&limit=300`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`ESPN ${res.status}`)
  const json = await res.json()
  return json.events ?? []
}

export type EspnComp = { canon: string; name: string; score: number | null; shootout: number | null; winner: boolean }
/** Normalise an ESPN event: the two competitors (canon name + score + shootout +
 *  winner flag) and whether the match is completed. */
export function parseEspnEvent(ev: any): { comps: EspnComp[]; completed: boolean; isShootout: boolean } | null {
  const comp = ev?.competitions?.[0]
  if (!comp) return null
  const completed = !!(ev?.status?.type?.completed ?? comp?.status?.type?.completed)
  const comps: EspnComp[] = (comp.competitors ?? []).map((c: any) => ({
    canon:    canonTeam(c.team?.displayName ?? c.team?.shortDisplayName ?? c.team?.name),
    name:     c.team?.displayName ?? c.team?.name ?? '',
    score:    c.score != null && c.score !== '' ? Number(c.score) : null,
    shootout: c.shootoutScore != null && c.shootoutScore !== '' ? Number(c.shootoutScore) : null,
    winner:   !!c.winner,
  }))
  const isShootout = comps.some(c => c.shootout != null)
  return { comps, completed, isShootout }
}

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
  bosniaandherzegovina: 'bosnia', bosniaherzegovina: 'bosnia', bosnia: 'bosnia',
  turkey: 'turkey', turkiye: 'turkey',
  drcongo: 'congo', congodr: 'congo', democraticrepublicofcongo: 'congo',
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
