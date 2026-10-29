// Practice sweeps (migration 200) — the real sweep flow on a shared, made-up field, with no
// real money and no real race. Identified by the practice tournament's slug, so the client
// can tell without an extra column (TournamentSwitcher filters on it).
export const PRACTICE_SLUG = 'practice-sweep'

export const isPracticeSlug = (slug: string | null | undefined) => slug === PRACTICE_SLUG

export async function practiceTournamentId(admin: any): Promise<string | null> {
  const { data } = await (admin.from('tournaments') as any).select('id').eq('slug', PRACTICE_SLUG).maybeSingle()
  return (data as any)?.id ?? null
}

export async function isPracticeTournament(admin: any, tournamentId: string | null | undefined): Promise<boolean> {
  if (!tournamentId) return false
  const { data } = await (admin.from('tournaments') as any).select('slug').eq('id', tournamentId).maybeSingle()
  return isPracticeSlug((data as any)?.slug)
}
