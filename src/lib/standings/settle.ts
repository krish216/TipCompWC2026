import { getTeamsAndFixtures } from '@/lib/content/wc'
import { leagueTable, scoreStandingsPrediction, checkpointComplete } from './predictor'

// Settle one predictor quarter: once every game up to its checkpoint is played,
// compute the checkpoint table, score every entry (points per team correctly in the
// top-N / bottom-N bucket), and mark the quarter settled. Idempotent — a settled
// quarter is skipped. Service-role admin client.
export async function settleStandingsQuarter(admin: any, tournamentId: string, quarter: number): Promise<{ settled: boolean; scored: number; reason?: string }> {
  const { data: q } = await (admin.from('standings_quarters') as any)
    .select('*').eq('tournament_id', tournamentId).eq('quarter', quarter).maybeSingle()
  if (!q) return { settled: false, scored: 0, reason: 'quarter not found' }
  if (q.settled_at) return { settled: true, scored: 0, reason: 'already settled' }

  const { teams, fixtures } = await getTeamsAndFixtures(tournamentId)
  if (!checkpointComplete(fixtures, q.checkpoint_round)) return { settled: false, scored: 0, reason: 'checkpoint not complete' }

  const table = leagueTable(teams, fixtures, q.checkpoint_round)
  const { data: preds } = await (admin.from('standings_predictions') as any)
    .select('id, top_teams, bottom_teams').eq('tournament_id', tournamentId).eq('quarter', quarter)

  let scored = 0
  for (const p of ((preds ?? []) as any[])) {
    const s = scoreStandingsPrediction(p.top_teams ?? [], p.bottom_teams ?? [], table, { topN: q.top_n, bottomN: q.bottom_n, pts: q.points_per_correct })
    await (admin.from('standings_predictions') as any).update({ points: s.points }).eq('id', p.id)
    scored++
  }
  await (admin.from('standings_quarters') as any).update({ settled_at: new Date().toISOString() }).eq('id', q.id)
  return { settled: true, scored }
}

// Settle every quarter whose checkpoint is now complete (best-effort; call from a cron
// or admin trigger). Returns how many quarters settled this pass.
export async function settleDueStandings(admin: any, tournamentId: string): Promise<number> {
  const { data: qs } = await (admin.from('standings_quarters') as any)
    .select('quarter').eq('tournament_id', tournamentId).is('settled_at', null).order('quarter')
  let n = 0
  for (const q of ((qs ?? []) as any[])) {
    const r = await settleStandingsQuarter(admin, tournamentId, q.quarter)
    if (r.settled) n++
  }
  return n
}
