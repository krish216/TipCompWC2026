// Advance real winners into the next knockout round's fixtures, so the schedule
// (My Tips, etc.) shows the actual progressed teams — aligned with ESPN, with no
// in-app auto-advance logic. Called after a knockout result is saved.
//
// For each downstream slot, sets home := winner of feeder[0] and away := winner of
// feeder[1], but ONLY for sides whose feeder is decided with a real team. Undecided
// sides keep their existing placeholder. Never touches a fixture that already has a
// result. Idempotent — safe to call repeatedly.

// Bracket tree (mirrors src/app/bracket/page.tsx). [slot, fromHome, fromAway].
const FEEDS: [string, string, string][] = [
  ['r16:1', 'r32:1', 'r32:2'], ['r16:2', 'r32:3', 'r32:4'], ['r16:3', 'r32:5', 'r32:6'], ['r16:4', 'r32:7', 'r32:8'],
  ['r16:5', 'r32:9', 'r32:10'], ['r16:6', 'r32:11', 'r32:12'], ['r16:7', 'r32:13', 'r32:14'], ['r16:8', 'r32:15', 'r32:16'],
  ['qf:1', 'r16:1', 'r16:2'], ['qf:2', 'r16:3', 'r16:4'], ['qf:3', 'r16:5', 'r16:6'], ['qf:4', 'r16:7', 'r16:8'],
  ['sf:1', 'qf:1', 'qf:2'], ['sf:2', 'qf:3', 'qf:4'],
  ['final', 'sf:1', 'sf:2'],
  ['tp', 'sf:1', 'sf:2'], // third-place play-off: the LOSERS of the two semi-finals
]

export const isPlaceholder = (s: string | null | undefined): boolean =>
  !s || /\b(group|winner|place|3rd|runner|tbd|tbc)\b/i.test(s)
const real = (s: string | null | undefined): string | null => (isPlaceholder(s) ? null : (s as string))

export async function cascadeKnockoutTeams(admin: any, tournamentId: string): Promise<number> {
  const { data: fx } = await admin
    .from('fixtures')
    .select('id, bracket_slot, home, away, home_score, away_score, pen_winner')
    .eq('tournament_id', tournamentId).not('bracket_slot', 'is', null)
  const bySlot: Record<string, any> = {}
  for (const f of (fx ?? []) as any[]) bySlot[f.bracket_slot] = f

  const winnerOf = (slot: string): string | null => {
    const f = bySlot[slot]; if (!f || f.home_score == null || f.away_score == null) return null
    const w = f.home_score > f.away_score ? f.home : f.away_score > f.home_score ? f.away : (f.pen_winner ?? null)
    return real(w)
  }
  const loserOf = (slot: string): string | null => {
    const f = bySlot[slot]; const w = winnerOf(slot); if (!f || !w) return null
    return real(w === f.home ? f.away : f.home)
  }

  let updated = 0
  for (const [slot, fh, fa] of FEEDS) {
    const f = bySlot[slot]
    if (!f || f.home_score != null) continue // missing, or already played — never touch
    const isTP = slot === 'tp'
    const wantHome = isTP ? loserOf(fh) : winnerOf(fh)
    const wantAway = isTP ? loserOf(fa) : winnerOf(fa)
    const patch: Record<string, string> = {}
    if (wantHome && wantHome !== f.home) patch.home = wantHome
    if (wantAway && wantAway !== f.away) patch.away = wantAway
    if (!Object.keys(patch).length) continue
    const { error } = await admin.from('fixtures').update(patch).eq('id', f.id).is('home_score', null)
    if (!error) updated++
  }
  return updated
}
