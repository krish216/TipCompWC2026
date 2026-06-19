// Sponsor Campaigns module — active-campaign resolver.
// THE single entry point challenges call. Given a challenge type (+ optional
// tournament), returns the stable ResolvedSponsorConfig the bracket UI consumes.
//
// Resilient by design: if the module tables aren't present yet (migration 120
// not applied) or no campaign is live, it falls back to the legacy
// app_settings.bracket_sponsor_* keys — so nothing breaks during rollout.

import { ChallengeType, LogoTone, ResolvedSponsorConfig } from './types'

const EMPTY: ResolvedSponsorConfig = {
  enabled: false, sponsor_name: '', sponsor_logo: '', prize: '', sponsor_url: '', logo_tone: 'dark',
}

export async function resolveActiveCampaign(
  admin: any,
  opts: { challengeType: ChallengeType; tournamentId?: string | null; challengeId?: string | null; slug?: string | null },
): Promise<ResolvedSponsorConfig> {
  try {
    // Resolve the target challenge. A tournament may host several bracket
    // challenges now, so resolve by explicit id/slug when given; otherwise pick
    // the first of the (tournament, type) — never .maybeSingle() (throws on >1).
    let challengeId = opts.challengeId ?? null
    if (!challengeId && opts.slug) {
      const { data: bySlug } = await (admin.from('challenges') as any)
        .select('id, type').eq('slug', opts.slug).maybeSingle()
      challengeId = (bySlug as any)?.type === opts.challengeType ? (bySlug as any).id : null
      if (!challengeId) return await legacyConfig(admin, opts.challengeType)
    }
    if (!challengeId) {
      let tid = opts.tournamentId ?? null
      if (!tid) {
        const { data: t } = await admin.from('tournaments').select('id').eq('is_active', true).maybeSingle()
        tid = (t as any)?.id ?? null
      }
      if (!tid) return await legacyConfig(admin, opts.challengeType)

      const { data: chs } = await (admin.from('challenges') as any)
        .select('id').eq('tournament_id', tid).eq('type', opts.challengeType)
        .order('created_at', { ascending: true }).limit(1)
      challengeId = (chs as any)?.[0]?.id ?? null
    }
    if (!challengeId) return await legacyConfig(admin, opts.challengeType)

    const nowIso = new Date().toISOString()
    const { data: camps } = await (admin.from('sponsor_campaigns') as any)
      .select('prize, click_url, logo_tone, sponsors(name, website_url, logo_url, logo_tone)')
      .eq('challenge_id', challengeId).eq('enabled', true)
      .lte('starts_at', nowIso).gte('ends_at', nowIso)
      .order('starts_at', { ascending: true }).limit(1)

    const c = (camps as any)?.[0]
    if (!c || !c.sponsors) return await legacyConfig(admin, opts.challengeType)

    const tone: LogoTone = (c.logo_tone ?? c.sponsors.logo_tone) === 'light' ? 'light' : 'dark'
    return {
      enabled:      true,
      sponsor_name: c.sponsors.name ?? '',
      sponsor_logo: c.sponsors.logo_url ?? '',
      prize:        c.prize ?? '',
      sponsor_url:  c.click_url || c.sponsors.website_url || '',
      logo_tone:    tone,
    }
  } catch {
    return await legacyConfig(admin, opts.challengeType)
  }
}

// Legacy fallback: the original single-sponsor app_settings blob.
async function legacyConfig(admin: any, type: ChallengeType): Promise<ResolvedSponsorConfig> {
  if (type !== 'bracket') return EMPTY
  try {
    const KEYS = [
      'bracket_sponsor_enabled', 'bracket_sponsor_name', 'bracket_sponsor_logo',
      'bracket_prize', 'bracket_sponsor_url', 'bracket_sponsor_logo_tone',
    ]
    const { data } = await (admin.from('app_settings') as any).select('key, value').in('key', KEYS)
    const m: Record<string, string> = {}
    ;((data ?? []) as any[]).forEach(r => { m[r.key] = r.value })
    return {
      enabled:      m['bracket_sponsor_enabled'] === 'on',
      sponsor_name: m['bracket_sponsor_name'] ?? '',
      sponsor_logo: m['bracket_sponsor_logo'] ?? '',
      prize:        m['bracket_prize'] ?? '',
      sponsor_url:  m['bracket_sponsor_url'] ?? '',
      logo_tone:    m['bracket_sponsor_logo_tone'] === 'light' ? 'light' : 'dark',
    }
  } catch {
    return EMPTY
  }
}
