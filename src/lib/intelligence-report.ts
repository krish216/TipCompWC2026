// Shared builder for the satirical "Weekly Intelligence Report".
// Pure function — safe to import from both server routes and client components.

export interface ReportData {
  comp_name:    string
  member_count: number
  leaders:      { name: string; points: number; correct: number }[]
  laggards:     { name: string; points: number }[]
  ghosts:       { count: number; names: string[] }
  stats:        { total_members: number; scored_count: number; avg_points: number; top_score: number; bonus_team_pct: number }
}

type Member = { user_id: string; name: string }
type LbRow  = { user_id: string; total_points?: number | null; correct_count?: number | null; predictions_made?: number | null }

export function buildIntelligenceReport(name: string, members: Member[], lbRows: LbRow[], favTeamCount: number): ReportData {
  const lbMap: Record<string, LbRow> = {}
  lbRows.forEach(r => { lbMap[r.user_id] = r })

  const standings = members.map(m => {
    const lb = lbMap[m.user_id] ?? {}
    return {
      name:    m.name,
      points:  Number(lb.total_points ?? 0),
      correct: Number(lb.correct_count ?? 0),
      scored:  Number(lb.predictions_made ?? 0),
    }
  })

  const sortedDesc = [...standings].sort((a, b) => b.points - a.points || b.correct - a.correct)
  const leaders    = sortedDesc.filter(s => s.points > 0).slice(0, 4)
  const leaderSet  = new Set(leaders.map(l => l.name))
  const onBoard    = standings.filter(s => s.scored > 0)
  const laggards   = onBoard.filter(s => !leaderSet.has(s.name))
    .sort((a, b) => a.points - b.points || a.correct - b.correct).slice(0, 3)
  const ghosts     = standings.filter(s => s.scored === 0)

  return {
    comp_name:    name,
    member_count: members.length,
    leaders:      leaders.map(l => ({ name: l.name, points: l.points, correct: l.correct })),
    laggards:     laggards.map(l => ({ name: l.name, points: l.points })),
    ghosts:       { count: ghosts.length, names: ghosts.slice(0, 3).map(g => g.name) },
    stats: {
      total_members:  members.length,
      scored_count:   onBoard.length,
      avg_points:     standings.length ? Math.round((standings.reduce((s, x) => s + x.points, 0) / standings.length) * 10) / 10 : 0,
      top_score:      sortedDesc[0]?.points ?? 0,
      bonus_team_pct: members.length ? Math.round((favTeamCount / members.length) * 100) : 0,
    },
  }
}
