// Sponsor Campaigns module — active-campaign resolver.
// THE single entry point challenges call. Given a challenge type (+ optional
// tournament/challenge/slug), returns the stable ResolvedSponsorConfig the
// bracket UI consumes.
//
// A challenge's sponsor comes solely from an active sponsor_campaigns row. When
// none is live, the result is EMPTY (no sponsor → plain header). The old
// app_settings.bracket_sponsor_* fallback has been retired.

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
      if (!challengeId) return EMPTY
    }
    if (!challengeId) {
      let tid = opts.tournamentId ?? null
      if (!tid) {
        const { data: t } = await admin.from('tournaments').select('id').eq('is_active', true).maybeSingle()
        tid = (t as any)?.id ?? null
      }
      if (!tid) return EMPTY

      const { data: chs } = await (admin.from('challenges') as any)
        .select('id').eq('tournament_id', tid).eq('type', opts.challengeType)
        .order('created_at', { ascending: true }).limit(1)
      challengeId = (chs as any)?.[0]?.id ?? null
    }
    if (!challengeId) return EMPTY

    const nowIso = new Date().toISOString()
    const { data: camps } = await (admin.from('sponsor_campaigns') as any)
      .select('prize, click_url, logo_tone, sponsors(name, website_url, logo_url, logo_tone)')
      .eq('challenge_id', challengeId).eq('enabled', true)
      .lte('starts_at', nowIso).gte('ends_at', nowIso)
      .order('starts_at', { ascending: true }).limit(1)

    const c = (camps as any)?.[0]
    if (!c || !c.sponsors) return EMPTY

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
    return EMPTY
  }
}
