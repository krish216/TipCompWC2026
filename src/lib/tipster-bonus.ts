// Tipster Pro — Bonus Team card. How your bonus (favourite) team pick compares to
// the field / your comp / your tribe, plus ROI and current status. "Who picked the
// same" counts only GENUINE pickers (favourite_team_auto = false), excludes mock
// accounts, and includes you. All from user_tournaments + leaderboard + fixtures.

export interface BonusPop { samePct: number; total: number; topTeam: string; topPct: number }
export interface BonusStats {
  team: string
  teamRank: number | null
  isAuto: boolean
  bonusPoints: number
  roiBetterThanPct: number | null     // your bonus points beat this % of the field
  fieldBackers: number                // genuine pickers in the tournament on your team
  fieldPickers: number                // total genuine pickers in the tournament
  contrarian: boolean
  tournament: BonusPop | null
  comp: BonusPop | null
  tribe: BonusPop | null
  multiTribe: boolean
  status: { group: string; rank: number; points: number; played: number; label: string } | null
}

export type BonusResult =
  | { ok: true; bonus: BonusStats }
  | { ok: false; reason: 'no_team' }

async function fetchAllUT(admin: any, tournamentId: string): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; from < 50000; from += 1000) {
    const { data } = await (admin.from('user_tournaments') as any)
      .select('user_id, favourite_team, favourite_team_auto')
      .eq('tournament_id', tournamentId).order('user_id').range(from, from + 999)
    const rows = (data ?? []) as any[]
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

// Distribution of bonus picks among a set of (genuine-picker) user ids.
function popFor(map: Map<string, string>, memberIds: string[], myTeam: string): BonusPop | null {
  const counts = new Map<string, number>()
  let total = 0
  for (const id of memberIds) {
    const team = map.get(id)
    if (!team) continue
    counts.set(team, (counts.get(team) ?? 0) + 1)
    total++
  }
  if (!total) return null
  let topTeam = myTeam, topN = 0
  for (const [team, n] of counts) if (n > topN) { topN = n; topTeam = team }
  return {
    samePct: Math.round(((counts.get(myTeam) ?? 0) / total) * 100),
    total,
    topTeam,
    topPct: Math.round((topN / total) * 100),
  }
}

export async function computeBonusStats(
  admin: any,
  userId: string,
  tournamentId: string,
  compId: string | null,
  tribeId: string | null,
): Promise<BonusResult> {
  const [meRes, teamsRes, mockRes, allUT, lbRes, gsRes, compMembersRes, tribeMembersRes, tribesRes] = await Promise.all([
    (admin.from('user_tournaments') as any).select('favourite_team, favourite_team_auto')
      .eq('user_id', userId).eq('tournament_id', tournamentId).maybeSingle(),
    (admin.from('tournament_teams') as any).select('name, fifa_rank').eq('tournament_id', tournamentId),
    (admin.from('users') as any).select('id').like('email', '%@tribepicks.dev'),
    fetchAllUT(admin, tournamentId),
    (admin.from('leaderboard') as any).select('total_bonus_points')
      .eq('user_id', userId).eq('tournament_id', tournamentId).maybeSingle(),
    (admin.from('fixtures') as any).select('grp, home, away, home_score, away_score')
      .eq('tournament_id', tournamentId).in('round', ['gs1', 'gs2', 'gs3']),
    compId ? (admin.from('user_comps') as any).select('user_id').eq('comp_id', compId) : Promise.resolve({ data: [] }),
    tribeId ? (admin.from('tribe_members') as any).select('user_id').eq('tribe_id', tribeId) : Promise.resolve({ data: [] }),
    compId ? (admin.from('tribes') as any).select('id').eq('comp_id', compId) : Promise.resolve({ data: [] }),
  ])

  const team = (meRes.data as any)?.favourite_team ?? null
  if (!team) return { ok: false, reason: 'no_team' }
  const isAuto = !!(meRes.data as any)?.favourite_team_auto

  const rankByTeam = new Map<string, number | null>()
  for (const t of (teamsRes.data ?? []) as any[]) rankByTeam.set(t.name, t.fifa_rank ?? null)
  const mockSet = new Set(((mockRes.data ?? []) as any[]).map(u => u.id))

  // Genuine-picker map: user_id → team (auto-assigned + mock excluded).
  const pickerTeam = new Map<string, string>()
  for (const r of allUT) {
    if (r.favourite_team && !r.favourite_team_auto && !mockSet.has(r.user_id)) pickerTeam.set(r.user_id, r.favourite_team)
  }
  const allPickerIds = [...pickerTeam.keys()]
  const compIds  = ((compMembersRes.data  ?? []) as any[]).map(r => r.user_id)
  const tribeIds = ((tribeMembersRes.data ?? []) as any[]).map(r => r.user_id)

  const tournament = popFor(pickerTeam, allPickerIds, team)
  const comp  = compId  ? popFor(pickerTeam, compIds,  team) : null
  const tribe = tribeId ? popFor(pickerTeam, tribeIds, team) : null

  const fieldBackers = allPickerIds.filter(id => pickerTeam.get(id) === team).length
  const fieldPickers = allPickerIds.length
  const contrarian = tournament != null && tournament.samePct <= 3

  // ROI percentile — your bonus points vs the whole field.
  const bonusPoints = (lbRes.data as any)?.total_bonus_points ?? 0
  const [{ count: lbTotal }, { count: lbBelow }] = await Promise.all([
    (admin.from('leaderboard') as any).select('user_id', { count: 'exact', head: true }).eq('tournament_id', tournamentId),
    (admin.from('leaderboard') as any).select('user_id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId).lt('total_bonus_points', bonusPoints),
  ])
  const roiBetterThanPct = bonusPoints > 0 && lbTotal ? Math.round(((lbBelow ?? 0) / lbTotal) * 100) : null

  // Current group standing for the bonus team (provisional — GS3 may be unplayed).
  const status = groupStatus((gsRes.data ?? []) as any[], team)

  const multiTribe = ((tribesRes.data ?? []) as any[]).length > 1
  return {
    ok: true,
    bonus: { team, teamRank: rankByTeam.get(team) ?? null, isAuto, bonusPoints, roiBetterThanPct,
      fieldBackers, fieldPickers, contrarian, tournament, comp, tribe, multiTribe, status },
  }
}

// Compute the bonus team's place in its group from played GS fixtures.
function groupStatus(gs: any[], team: string): BonusStats['status'] {
  const myGrp = gs.find(f => f.home === team || f.away === team)?.grp
  if (!myGrp) return null
  const table = new Map<string, { pts: number; gd: number; gf: number; p: number }>()
  const add = (n: string, gf: number, ga: number, pts: number) => {
    const e = table.get(n) ?? { pts: 0, gd: 0, gf: 0, p: 0 }
    e.pts += pts; e.gf += gf; e.gd += gf - ga; e.p++; table.set(n, e)
  }
  for (const f of gs) {
    if (f.grp !== myGrp || f.home_score == null || f.away_score == null) continue
    const h = f.home_score, a = f.away_score
    add(f.home, h, a, h > a ? 3 : h === a ? 1 : 0)
    add(f.away, a, h, a > h ? 3 : a === h ? 1 : 0)
  }
  const ranked = [...table.entries()].sort((x, y) => y[1].pts - x[1].pts || y[1].gd - x[1].gd || y[1].gf - x[1].gf)
  const idx = ranked.findIndex(([n]) => n === team)
  if (idx < 0) return null
  const me = ranked[idx][1]
  const rank = idx + 1
  const label = rank <= 2 ? 'In the top two' : rank === 3 ? '3rd — in the hunt for a best-third spot' : 'Bottom of the group'
  return { group: myGrp, rank, points: me.pts, played: me.p, label }
}
