// Single-match challenge resolution — mirrors lib/bracket/challenge.ts for the
// `type='match'` challenges. A match challenge is a `challenges` row carrying a
// `fixture_id`; entries lock shortly before kickoff.

// Entries lock this long BEFORE kickoff (so no one enters as the whistle blows).
export const LOCK_LEAD_MS = 5 * 60 * 1000   // 5 minutes

export interface MatchChallenge {
  id:            string
  slug:          string
  name:          string
  tournament_id: string
  fixture_id:    number | null
  closes_at:     string | null   // explicit lock time; null → derived from kickoff − LOCK_LEAD_MS
}

export interface MatchFixture {
  id:          number
  home:        string
  away:        string
  kickoff_utc: string
  venue:       string | null
  round:       string | null
  home_score:  number | null
  away_score:  number | null
  pen_winner:  string | null
  first_goal_min: number | null
}

const COLS = 'id, slug, name, tournament_id, type, enabled, fixture_id, closes_at'

// Resolve a match challenge by its slug. Returns null when the slug is missing or
// isn't a match challenge (defensive — keeps the /match routes match-only).
export async function resolveMatchChallenge(admin: any, slug: string): Promise<MatchChallenge | null> {
  const { data } = await (admin.from('challenges') as any).select(COLS).eq('slug', slug).maybeSingle()
  const r = data as any
  if (!r || r.type !== 'match' || r.enabled === false) return null
  return { id: r.id, slug: r.slug, name: r.name, tournament_id: r.tournament_id, fixture_id: r.fixture_id ?? null, closes_at: r.closes_at ?? null }
}

export async function getFixture(admin: any, fixtureId: number): Promise<MatchFixture | null> {
  const { data } = await (admin.from('fixtures') as any)
    .select('id, home, away, kickoff_utc, venue, round, home_score, away_score, pen_winner, first_goal_min')
    .eq('id', fixtureId).maybeSingle()
  return (data as any) ?? null
}

// When entries lock: the challenge's explicit closes_at, else kickoff − LOCK_LEAD_MS.
export function lockAt(challenge: MatchChallenge, fixture: MatchFixture | null): string | null {
  if (challenge.closes_at) return challenge.closes_at
  if (!fixture?.kickoff_utc) return null
  return new Date(new Date(fixture.kickoff_utc).getTime() - LOCK_LEAD_MS).toISOString()
}

// True once entries are locked (now ≥ lock time).
export function isLocked(challenge: MatchChallenge, fixture: MatchFixture | null): boolean {
  const at = lockAt(challenge, fixture)
  return !!at && Date.now() >= new Date(at).getTime()
}
