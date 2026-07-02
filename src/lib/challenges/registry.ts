// Challenge-type registry (CODE, not a DB table).
//
// Each challenge stores its `type` (a column on `challenges`); this registry maps
// that type to its label and where its leaderboard lives. Routes are Next.js
// pages, so the mapping belongs in code — and a new type needs its page + entry +
// scoring built anyway. `available: false` types exist in the type system but
// aren't selectable until their flow is built (no orphan/broken challenges).

import { toSlug } from '@/lib/sponsors/campaigns'

export type ChallengeTypeKey = 'bracket' | 'four_pick' | 'match'

interface ChallengeTypeDef {
  label:           string
  available:       boolean
  slugPrefix:      string                       // 2-letter slug prefix → globally-unique slugs
  leaderboardPath: (slug: string) => string
}

export const CHALLENGE_TYPES: Record<ChallengeTypeKey, ChallengeTypeDef> = {
  bracket:   { label: 'Bracket',    available: true,  slugPrefix: 'br', leaderboardPath: slug => `/bracket/leaderboard/${slug}` },
  four_pick: { label: 'Four Pick',  available: false, slugPrefix: '4p', leaderboardPath: slug => `/four-pick/leaderboard/${slug}` },
  // Selectable in the admin create form (which shows a fixture picker for match
  // challenges and auto-locks 5 min before kickoff). Public choosers list bracket
  // challenges only, so a match type here doesn't leak into the bracket hub.
  match:     { label: 'Match',      available: true,  slugPrefix: 'mt', leaderboardPath: slug => `/match/${slug}` },
}

// Types that are actually built → the only ones offered in create forms / accepted by the API.
export const AVAILABLE_CHALLENGE_TYPES = (Object.keys(CHALLENGE_TYPES) as ChallengeTypeKey[])
  .filter(t => CHALLENGE_TYPES[t].available)

export function isAvailableType(type: string): type is ChallengeTypeKey {
  return (AVAILABLE_CHALLENGE_TYPES as string[]).includes(type)
}

export function challengeTypeLabel(type: string): string {
  return (CHALLENGE_TYPES as any)[type]?.label ?? type
}

// Leaderboard route for a challenge of `type` with `slug`. Falls back to the
// bracket path for unknown types (defensive).
export function leaderboardPathFor(type: string, slug: string): string {
  return ((CHALLENGE_TYPES as any)[type]?.leaderboardPath ?? CHALLENGE_TYPES.bracket.leaderboardPath)(slug)
}

// Implicit challenge name from sponsor + type, e.g. "GatedFlow Bracket Challenge"
// (or "Bracket Challenge" for a house challenge with no sponsor).
export function deriveChallengeName(sponsorName: string | null | undefined, type: string): string {
  const label = challengeTypeLabel(type)
  return sponsorName?.trim() ? `${sponsorName.trim()} ${label} Challenge` : `${label} Challenge`
}

// Default slug: <type-prefix>-<base>, e.g. "br-gatedflow". The prefix keeps slugs
// globally unique across types (br-tribepicks vs 4p-tribepicks).
export function deriveChallengeSlug(base: string | null | undefined, type: string): string {
  const b = toSlug(base ?? '')
  if (!b) return ''
  const prefix = (CHALLENGE_TYPES as any)[type]?.slugPrefix as string | undefined
  return prefix ? `${prefix}-${b}` : b
}
