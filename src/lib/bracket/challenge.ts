// Bracket Challenge resolution.
//
// A tournament can now host several concurrent bracket challenges (one shared
// bracket, many sponsor-branded entry pools). Every bracket API resolves the
// challenge it's acting on through here — by explicit `slug` (the branded
// leaderboard URL), or, when none is given, the tournament's *default* bracket
// challenge so the legacy slug-less routes keep working.

export interface BracketChallenge {
  id:            string
  slug:          string
  name:          string
  tournament_id: string
}

const COLS = 'id, slug, name, tournament_id, type, enabled, created_at'

async function activeTournamentId(admin: any): Promise<string | null> {
  const { data } = await admin.from('tournaments').select('id').eq('is_active', true).maybeSingle()
  return (data as any)?.id ?? null
}

// Resolve a bracket challenge by slug, or the default for a tournament.
//   • slug given      → that exact bracket challenge (null if missing/not bracket)
//   • no slug         → the tournament's default bracket challenge:
//                       the enabled one with a campaign live *now*; failing that,
//                       the earliest-created enabled bracket challenge.
export async function resolveBracketChallenge(
  admin: any,
  opts: { slug?: string | null; tournamentId?: string | null } = {},
): Promise<BracketChallenge | null> {
  const shape = (r: any): BracketChallenge =>
    ({ id: r.id, slug: r.slug, name: r.name, tournament_id: r.tournament_id })

  if (opts.slug) {
    const { data } = await (admin.from('challenges') as any).select(COLS).eq('slug', opts.slug).maybeSingle()
    return (data as any)?.type === 'bracket' ? shape(data) : null
  }

  const tid = opts.tournamentId ?? (await activeTournamentId(admin))
  if (!tid) return null

  const { data: rows } = await (admin.from('challenges') as any)
    .select(COLS)
    .eq('tournament_id', tid).eq('type', 'bracket').eq('enabled', true)
    .order('created_at', { ascending: true })
  const list = ((rows ?? []) as any[])
  if (!list.length) return null
  if (list.length === 1) return shape(list[0])

  // Several concurrent challenges — prefer the one whose campaign is live now.
  const nowIso = new Date().toISOString()
  const { data: camps } = await (admin.from('sponsor_campaigns') as any)
    .select('challenge_id')
    .in('challenge_id', list.map(c => c.id))
    .eq('enabled', true).lte('starts_at', nowIso).gte('ends_at', nowIso)
    .order('starts_at', { ascending: true }).limit(1)
  const liveId = (camps as any)?.[0]?.challenge_id
  return shape(list.find(c => c.id === liveId) ?? list[0])
}

// All enabled bracket challenges for a tournament (default: the active one),
// earliest-created first — powers the challenge chooser lists.
export async function listBracketChallenges(
  admin: any,
  opts: { tournamentId?: string | null } = {},
): Promise<BracketChallenge[]> {
  const tid = opts.tournamentId ?? (await activeTournamentId(admin))
  if (!tid) return []
  const { data } = await (admin.from('challenges') as any)
    .select(COLS)
    .eq('tournament_id', tid).eq('type', 'bracket').eq('enabled', true)
    .order('created_at', { ascending: true })
  return ((data ?? []) as any[]).map(r => ({ id: r.id, slug: r.slug, name: r.name, tournament_id: r.tournament_id }))
}
