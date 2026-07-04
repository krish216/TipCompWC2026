import { resolveActiveCampaign } from '@/lib/sponsors/resolver'
import { getFixture, resolveMatchChallenge, isLocked, type MatchChallenge, type MatchFixture } from '@/lib/match/challenge'

// Shared entry validation + write for a single-match challenge, used by both the
// member (/api/match/enter) and guest (/api/match/guest-enter) routes. Returns a
// discriminated result so the routes can translate it to HTTP.

export interface MatchEntryResult {
  ok:        boolean
  status:    number
  error?:    string
  challenge?: MatchChallenge
  fixture?:  MatchFixture | null
  hasPrize?: boolean
  created?:  boolean          // true = brand-new entry (drives the one-time confirmation email); false = an edit
  redirect?: string
}

interface EnterBody {
  slug?: unknown
  pred_home?: unknown
  pred_away?: unknown
  advances_team?: unknown
  first_goal_min?: unknown
  reveal_picks?: unknown
  postcode?: unknown
  phone?: unknown
  consent_terms?: unknown
  consent_marketing?: unknown
  consent_over18?: unknown
}

// Validate the challenge/lock/prediction/consent and upsert the entry for `userId`.
// `source` is 'member' | 'guest'. Does NOT touch accounts/sessions — callers own that.
export async function enterMatchChallenge(
  admin: any,
  opts: { body: EnterBody; userId: string; source: 'member' | 'guest' },
): Promise<MatchEntryResult> {
  const { body, userId, source } = opts

  const slug = typeof body.slug === 'string' ? body.slug : ''
  if (!slug) return { ok: false, status: 400, error: 'Missing challenge.' }

  const challenge = await resolveMatchChallenge(admin, slug)
  if (!challenge) return { ok: false, status: 404, error: 'This match challenge isn’t available.' }
  const fixture = challenge.fixture_id ? await getFixture(admin, challenge.fixture_id) : null
  if (!fixture) return { ok: false, status: 400, error: 'This challenge has no match attached.' }

  // Entries lock shortly before kickoff.
  if (isLocked(challenge, fixture))
    return { ok: false, status: 409, error: 'Predictions are locked — kick-off is almost here.', challenge, fixture }

  // Scoreline (full-time, excl. penalties).
  const predHome = Number(body.pred_home)
  const predAway = Number(body.pred_away)
  if (!Number.isInteger(predHome) || predHome < 0 || predHome > 20 ||
      !Number.isInteger(predAway) || predAway < 0 || predAway > 20)
    return { ok: false, status: 422, error: 'Enter a scoreline (0–20 each).', challenge, fixture }

  // Who advances (draw resolver + tiebreak) — must be one of the two teams.
  const advances = typeof body.advances_team === 'string' ? body.advances_team.trim() : ''
  if (advances !== fixture.home && advances !== fixture.away)
    return { ok: false, status: 422, error: 'Pick who goes through.', challenge, fixture }

  // Predicted minute of the first goal (0 = no goal) — the tie-break. Optional, but
  // when given must be a sane minute; a missing value just forfeits the tie-break.
  let firstGoalMin: number | null = null
  if (body.first_goal_min !== undefined && body.first_goal_min !== null && body.first_goal_min !== '') {
    const n = Number(body.first_goal_min)
    if (!Number.isInteger(n) || n < 0 || n > 130)
      return { ok: false, status: 422, error: 'First-goal minute must be 0–130 (0 = no goal).', challenge, fixture }
    firstGoalMin = n
  }

  if (body.consent_terms !== true)
    return { ok: false, status: 400, error: 'Please accept the terms to enter.', challenge, fixture }

  // Prize (sponsored) challenges capture lead data + 18+ per AU promo rules.
  const cfg = await resolveActiveCampaign(admin, { challengeType: 'match', challengeId: challenge.id })
  const hasPrize = !!(cfg.enabled && cfg.prize)
  const postcode = typeof body.postcode === 'string' ? body.postcode.trim() : ''
  if (hasPrize) {
    if (body.consent_marketing !== true)
      return { ok: false, status: 422, error: 'Agree to share your details with the sponsor to enter the draw.', challenge, fixture, hasPrize }
    if (!/^\d{4}$/.test(postcode))
      return { ok: false, status: 422, error: 'Enter your 4-digit postcode to go in the prize draw.', challenge, fixture, hasPrize }
    if (body.consent_over18 !== true)
      return { ok: false, status: 422, error: 'Confirm you are 18 or older to enter the prize draw.', challenge, fixture, hasPrize }
  }

  // Is this a first entry (→ send a confirmation) or an edit (→ stay quiet)?
  const { data: existingRow } = await (admin.from('match_entries') as any)
    .select('id').eq('challenge_id', challenge.id).eq('user_id', userId).maybeSingle()
  const created = !existingRow

  const now = new Date().toISOString()
  const { error } = await (admin.from('match_entries') as any).upsert({
    challenge_id:      challenge.id,
    user_id:           userId,
    fixture_id:        fixture.id,
    pred_home:         predHome,
    pred_away:         predAway,
    advances_team:     advances,
    first_goal_min:    firstGoalMin,
    reveal_picks:      body.reveal_picks === false ? false : true,   // opt-out: default shown
    phone:             typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null,
    postcode:          postcode || null,
    consent_terms:     true,
    consent_marketing: body.consent_marketing === true,
    consent_over18:    body.consent_over18 === true,
    source,
    updated_at:        now,
  }, { onConflict: 'challenge_id,user_id' })
  if (error) return { ok: false, status: 500, error: error.message, challenge, fixture, hasPrize }

  return { ok: true, status: 200, challenge, fixture, hasPrize, created, redirect: `/match/${challenge.slug}` }
}
