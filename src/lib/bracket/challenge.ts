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
  closes_at:     string | null   // challenge's own end date; null → first semi-final kick-off
}

const COLS = 'id, slug, name, tournament_id, type, enabled, created_at, closes_at'

// First semi-final kick-off for a tournament — the default entry deadline.
// Entries stay open through R32/R16/QF; each tie locks individually at its own
// kick-off (so a late entrant just scores 0 on ties already played).
async function firstSemiKickoff(admin: any, tournamentId: string): Promise<string | null> {
  const { data } = await admin.from('fixtures')
    .select('kickoff_utc').eq('tournament_id', tournamentId).eq('round', 'sf')
    .order('kickoff_utc', { ascending: true }).limit(1)
  return (data as any)?.[0]?.kickoff_utc ?? null
}

// When a challenge closes for entries: its own end date, else the semi-finals.
export async function challengeClosesAt(admin: any, challenge: { tournament_id: string; closes_at?: string | null }): Promise<string | null> {
  if (challenge.closes_at) return challenge.closes_at
  return firstSemiKickoff(admin, challenge.tournament_id)
}

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
    ({ id: r.id, slug: r.slug, name: r.name, tournament_id: r.tournament_id, closes_at: r.closes_at ?? null })

  if (opts.slug) {
    const { data } = await (admin.from('challenges') as any).select(COLS).eq('slug', opts.slug).maybeSingle()
    return (data as any)?.type === 'bracket' ? shape(data) : null
  }

  const tid = opts.tournamentId ?? (await activeTournamentId(admin))
  if (!tid) return null

  // Default (no slug) → only an OPEN challenge can be the tournament default.
  const { data: rows } = await (admin.from('challenges') as any)
    .select(COLS)
    .eq('tournament_id', tid).eq('type', 'bracket').eq('enabled', true).eq('access', 'open')
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

// "Global = everyone": ensure the user is also entered in the tournament's
// Global bracket challenge (the earliest-created open challenge). No-op when the
// challenge they just entered IS the Global one, or when they already have a
// Global entry (we never overwrite their existing tie-breakers). Reuses the
// passed tie-breakers/consent and the shared bracket. Best-effort.
export async function ensureGlobalEntry(
  admin: any,
  opts: {
    userId: string
    tournamentId: string
    enteredChallengeId: string
    finalGoals: number
    tpGoals: number
    phone?: string | null
    postcode?: string | null
    consentMarketing?: boolean
  },
): Promise<void> {
  try {
    const open = await listBracketChallenges(admin, { tournamentId: opts.tournamentId })
    const globalCh = open[0]                                  // earliest open = the Global board
    if (!globalCh || globalCh.id === opts.enteredChallengeId) return
    await (admin.from('bracket_entries') as any).upsert({
      user_id:           opts.userId,
      tournament_id:     opts.tournamentId,
      challenge_id:      globalCh.id,
      final_goals:       opts.finalGoals,
      tp_goals:          opts.tpGoals,
      phone:             opts.phone ?? null,
      postcode:          opts.postcode ?? null,
      consent_terms:     true,
      consent_marketing: opts.consentMarketing ?? false,
      source:            'auto_global',
      updated_at:        new Date().toISOString(),
    }, { onConflict: 'user_id,challenge_id', ignoreDuplicates: true })   // keep any existing Global entry
  } catch {
    // best-effort — never fail the primary entry over the auto-enrol
  }
}

// All enabled bracket challenges for a tournament (default: the active one),
// earliest-created first — powers the challenge chooser lists.
export async function listBracketChallenges(
  admin: any,
  opts: { tournamentId?: string | null } = {},
): Promise<BracketChallenge[]> {
  const tid = opts.tournamentId ?? (await activeTournamentId(admin))
  if (!tid) return []
  // Public list (hub + choosers) — open challenges only. Invite-only ones are
  // reachable solely via their leaderboard link.
  const { data } = await (admin.from('challenges') as any)
    .select(COLS)
    .eq('tournament_id', tid).eq('type', 'bracket').eq('enabled', true).eq('access', 'open')
    .order('created_at', { ascending: true })
  return ((data ?? []) as any[]).map(r => ({ id: r.id, slug: r.slug, name: r.name, tournament_id: r.tournament_id, closes_at: r.closes_at ?? null }))
}
