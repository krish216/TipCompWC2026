import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'
import { buildActualWinners, scoreBracket, BRACKET_MAX, SCORED_SLOTS, type KnockoutFixture } from '@/lib/bracket-scoring'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'   // live results — never serve a cached fetch

// GET /api/bracket/leaderboard?tournament_id= — global bracket leaderboard.
// Public (open challenge); the signed-in user's own row is returned as `me`.
export async function GET(request: NextRequest) {
  const admin = createAdminClient()
  const user  = await getSessionUser().catch(() => null)

  let tournamentId = new URL(request.url).searchParams.get('tournament_id')
  if (!tournamentId) {
    const { data: t } = await (admin.from('tournaments') as any).select('id').eq('is_active', true).maybeSingle()
    tournamentId = (t as any)?.id ?? null
  }
  if (!tournamentId) return NextResponse.json({ entries: [], total_entrants: 0, me: null, max: BRACKET_MAX, scoring_started: false })

  // Actual knockout winners (only matches with a result count).
  const { data: fx } = await (admin.from('fixtures') as any)
    .select('round, kickoff_utc, home, away, home_score, away_score, pen_winner')
    .eq('tournament_id', tournamentId).in('round', ['r32', 'r16', 'qf', 'sf', 'tp', 'f'])
  const actual = buildActualWinners((fx ?? []) as KnockoutFixture[])
  const scoringStarted = Object.keys(actual).length > 0

  // All bracket picks for this tournament (paged past PostgREST's 1000 cap).
  let from = 0
  const rows: any[] = []
  for (;;) {
    const { data } = await (admin.from('bracket_picks') as any)
      .select('user_id, slot_key, team_name').eq('tournament_id', tournamentId).range(from, from + 999)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < 1000) break
    from += 1000
  }

  const byUser: Record<string, Record<string, string | null>> = {}
  for (const r of rows) (byUser[r.user_id] ??= {})[r.slot_key] = r.team_name
  // Entrant = made ≥1 knockout (scored) pick. Excludes abandoned brackets that only
  // have group-stage picks — they can never score and would just sit at 0.
  const userIds = Object.keys(byUser).filter(uid => SCORED_SLOTS.some(s => byUser[uid][s.slot]))
  if (!userIds.length) return NextResponse.json({ entries: [], total_entrants: 0, me: null, max: BRACKET_MAX, scoring_started: scoringStarted })

  const { data: users } = await (admin.from('users') as any).select('id, display_name, avatar_url').in('id', userIds)
  const uMap = Object.fromEntries(((users ?? []) as any[]).map(u => [u.id, u]))

  let scored = userIds.map(uid => {
    const s = scoreBracket(byUser[uid], actual)
    const u = uMap[uid] ?? {}
    return {
      user_id:      uid,
      display_name: u.display_name ?? 'Unknown',
      avatar_url:   u.avatar_url ?? null,
      total:        s.total,
      by_round:     s.byRound,
      correct:      s.correct,
    }
  })
  // Phase 1: rank by total (full tie-break — Final/3rd scores — comes with the entry flow).
  scored.sort((a, b) => b.total - a.total || a.display_name.localeCompare(b.display_name))
  const ranked = scored.map((e, i) => ({ ...e, rank: i + 1 }))

  const me = user ? ranked.find(e => e.user_id === user.id) ?? null : null

  return NextResponse.json({
    entries:         ranked.slice(0, 12),   // top 12
    total_entrants:  ranked.length,
    me,                                     // caller's own row (incl. rank), even if outside top 12
    max:             BRACKET_MAX,
    scoring_started: scoringStarted,
  })
}
