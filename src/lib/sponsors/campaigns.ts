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

// Returns an existing enabled campaign on the same challenge whose window
// overlaps [starts_at, ends_at] (excluding `excludeId`), or null. Enforces
// "at most one live sponsor at a time" per challenge — campaigns may queue back
// to back but never overlap. Both dates are required for a real check.
export async function overlappingCampaign(
  admin: any,
  challengeId: string,
  starts_at: string | null,
  ends_at: string | null,
  excludeId?: string,
): Promise<{ id: string; name: string } | null> {
  if (!starts_at || !ends_at) return null
  const s = new Date(starts_at).getTime()
  const e = new Date(ends_at).getTime()
  const { data } = await (admin.from('sponsor_campaigns') as any)
    .select('id, starts_at, ends_at, sponsors(name)')
    .eq('challenge_id', challengeId).eq('enabled', true)
  for (const c of ((data ?? []) as any[])) {
    if (excludeId && c.id === excludeId) continue
    if (!c.starts_at || !c.ends_at) continue
    const cs = new Date(c.starts_at).getTime()
    const ce = new Date(c.ends_at).getTime()
    if (s < ce && cs < e) return { id: c.id, name: c.sponsors?.name ?? 'another sponsor' }  // half-open overlap
  }
  return null
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
