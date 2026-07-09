import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'
import { resolveActiveCampaign } from '@/lib/sponsors/resolver'
import { rankMatchEntries } from '@/lib/match/score'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/challenges/hub?tournament=<slug>
// The Challenges hub for a tournament: its flagship challenge (Table Predictor for a
// league, Bracket for a knockout) plus every match challenge — open and completed.
// Session-aware: each challenge carries an `entered` flag so the hub can show a CTA
// (not entered) or a confirmation (entered). Defaults to the active tournament.
export async function GET(request: NextRequest) {
  const slug = new URL(request.url).searchParams.get('tournament') || ''
  const admin = createAdminClient()
  const user = await getSessionUser().catch(() => null)

  const { data: t } = slug
    ? await (admin.from('tournaments') as any).select('id, name, slug').eq('slug', slug).maybeSingle()
    : await (admin.from('tournaments') as any).select('id, name, slug').eq('is_active', true).maybeSingle()
  if (!t) return NextResponse.json({ tournament: null })

  // Flagship: a league gets the quartered table predictor; a knockout gets the bracket.
  const [{ count: predictorQs }, { data: brackets }, { data: matches }] = await Promise.all([
    (admin.from('standings_quarters') as any).select('id', { count: 'exact', head: true }).eq('tournament_id', t.id),
    (admin.from('challenges') as any).select('id, slug').eq('tournament_id', t.id).eq('type', 'bracket').eq('enabled', true).limit(1),
    (admin.from('challenges') as any).select('id, slug, name, fixture_id, home_image_url, away_image_url').eq('tournament_id', t.id).eq('type', 'match').eq('enabled', true),
  ])
  const rawMatches = (matches ?? []) as any[]
  const bracketId = brackets?.[0]?.id

  // Which challenges the signed-in user has already entered (empty when logged out).
  const enteredMatch = new Set<string>()
  let enteredBracket = false, enteredPredictor = false
  if (user) {
    const [me, be, sp] = await Promise.all([
      rawMatches.length
        ? (admin.from('match_entries') as any).select('challenge_id').eq('user_id', user.id).in('challenge_id', rawMatches.map(m => m.id))
        : Promise.resolve({ data: [] }),
      bracketId
        ? (admin.from('bracket_entries') as any).select('challenge_id').eq('user_id', user.id).eq('challenge_id', bracketId).limit(1)
        : Promise.resolve({ data: [] }),
      (predictorQs ?? 0) > 0
        ? (admin.from('standings_predictions') as any).select('id').eq('user_id', user.id).eq('tournament_id', t.id).limit(1)
        : Promise.resolve({ data: [] }),
    ])
    for (const r of ((me as any).data ?? []) as any[]) if (r.challenge_id) enteredMatch.add(r.challenge_id)
    enteredBracket = (((be as any).data ?? []) as any[]).length > 0
    enteredPredictor = (((sp as any).data ?? []) as any[]).length > 0
  }

  let flagship: any = null
  if ((predictorQs ?? 0) > 0) {
    flagship = { type: 'predictor', href: `/${t.slug}/predictor`, label: 'Table Predictor', blurb: 'Predict the top 5 & bottom 3 at four checkpoints through the season.', entered: enteredPredictor }
  } else if (brackets && brackets.length) {
    flagship = { type: 'bracket', href: '/bracket', label: 'Bracket Challenge', blurb: 'Predict the winner of every knockout match to the final.', entered: enteredBracket }
  }

  // Match challenges. We show open ones (discovery) plus the user's OWN completed
  // entries (so they can see their result) — a completed challenge the user didn't
  // enter is dropped: it's neither actionable nor theirs.
  const fixtureIds = rawMatches.filter(m => m.fixture_id).map(m => m.fixture_id)
  const fxById = new Map<number, any>()
  if (fixtureIds.length) {
    const { data: fxs } = await (admin.from('fixtures') as any)
      .select('id, home, away, home_score, away_score, pen_winner, first_goal_min').in('id', fixtureIds)
    for (const f of (fxs ?? []) as any[]) fxById.set(f.id, f)
  }
  const isDone = (m: any) => !!(m.fixture_id && fxById.get(m.fixture_id)?.home_score != null)

  const matchOut = []
  for (const m of rawMatches) {
    const done = isDone(m)
    const entered = enteredMatch.has(m.id)
    if (done && !entered) continue  // hide finished challenges the user sat out
    const cfg = await resolveActiveCampaign(admin, { challengeType: 'match', challengeId: m.id })
    const result = done ? await matchResult(admin, m.id, fxById.get(m.fixture_id), user!.id) : null
    const fx = m.fixture_id ? fxById.get(m.fixture_id) : null
    matchOut.push({
      slug: m.slug, name: m.name, href: `/match/${m.slug}`,
      sponsor: cfg.enabled ? { name: cfg.sponsor_name, prize: cfg.prize } : null,
      state: done ? 'completed' : 'open',
      entered, result,
      // Custom team visuals (migration 147), with the fixture's teams as flag fallback.
      home_image: m.home_image_url ?? null, away_image: m.away_image_url ?? null,
      home_team: fx?.home ?? null, away_team: fx?.away ?? null,
    })
  }
  // Open first, completed last.
  matchOut.sort((a, b) => (a.state === b.state ? 0 : a.state === 'open' ? -1 : 1))

  return NextResponse.json({ tournament: { slug: t.slug, name: t.name }, flagship, matches: matchOut, logged_in: !!user })
}

// The signed-in user's result for a settled match challenge — final score, their
// pick, points and rank — scored the same way as the challenge's own leaderboard.
async function matchResult(admin: any, challengeId: string, fx: any, userId: string) {
  const { data: rows } = await (admin.from('match_entries') as any)
    .select('user_id, pred_home, pred_away, advances_team, first_goal_min, entered_at').eq('challenge_id', challengeId)
  const f = { home: fx.home, away: fx.away, home_score: fx.home_score, away_score: fx.away_score, pen_winner: fx.pen_winner, first_goal_min: fx.first_goal_min }
  const ranked = rankMatchEntries((rows ?? []).map((e: any) => ({
    user_id: e.user_id, pred_home: e.pred_home, pred_away: e.pred_away,
    advances_team: e.advances_team ?? null, first_goal_min: e.first_goal_min ?? null, entered_at: e.entered_at,
  })), f)
  const idx = ranked.findIndex((e: any) => e.user_id === userId)
  if (idx < 0) return null
  const mine = ranked[idx] as any
  return {
    final: `${fx.home_score}-${fx.away_score}`,
    pred: `${mine.pred_home}-${mine.pred_away}`,
    points: mine.score.points, exact: mine.score.exact,
    rank: idx + 1, total: ranked.length,
  }
}
