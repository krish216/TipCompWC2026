// Sponsor Campaigns module — campaign helpers (status derivation, default
// scheduling window, slug generation). Pure/DB-helper logic shared by the API.

import { CampaignStatus, ChallengeType } from './types'

// kebab-case slug for a sponsor name → drives the storage folder + unique key.
export function toSlug(name: string): string {
  return (name || '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'sponsor'
}

// Derive a campaign's live status from its kill switch + window.
export function campaignStatus(
  c: { enabled: boolean; starts_at: string | null; ends_at: string | null },
  now: Date = new Date(),
): CampaignStatus {
  if (!c.enabled) return 'disabled'
  const start = c.starts_at ? new Date(c.starts_at) : null
  const end   = c.ends_at   ? new Date(c.ends_at)   : null
  if (end   && now > end)   return 'ended'
  if (start && now < start) return 'scheduled'
  return 'live'
}

// Default campaign window for a challenge. The window ends at the moment the
// challenge "locks" and runs for the preceding 5 days (peak completion window).
//   bracket: lock = first R32 kick-off (when bracket entries lock).
// Returns ISO strings, or nulls if the lock moment can't be determined.
export async function defaultWindow(
  admin: any,
  tournamentId: string,
  type: ChallengeType,
): Promise<{ starts_at: string | null; ends_at: string | null }> {
  let ends_at: string | null = null
  if (type === 'bracket') {
    const { data } = await admin.from('fixtures')
      .select('kickoff_utc').eq('tournament_id', tournamentId).eq('round', 'r32')
      .order('kickoff_utc', { ascending: true }).limit(1)
    ends_at = (data as any)?.[0]?.kickoff_utc ?? null
  }
  let starts_at: string | null = null
  if (ends_at) {
    const d = new Date(ends_at)
    d.setUTCDate(d.getUTCDate() - 5)
    starts_at = d.toISOString()
  }
  return { starts_at, ends_at }
}
