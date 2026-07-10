// Sponsor Campaigns module — active-campaign resolver.
// THE single entry point challenges call. Given a challenge type (+ optional
// tournament/challenge/slug), returns the stable ResolvedSponsorConfig the
// bracket UI consumes.
//
// A challenge's sponsor comes solely from an active sponsor_campaigns row. When
// none is live, the result is EMPTY (no sponsor → plain header). The old
// app_settings.bracket_sponsor_* fallback has been retired.

import { ChallengeType, LogoTone, ResolvedSponsorConfig } from './types'
import { getPrimaryTournament } from '@/lib/content/wc'

const EMPTY: ResolvedSponsorConfig = {
  enabled: false, sponsor_name: '', sponsor_logo: '', prize: '', prize_1: '', prize_2: '', prize_3: '', sponsor_url: '', logo_tone: 'dark',
  sponsor_brand_color: null, sponsor_tagline: null, logo_includes_name: false,
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
        const t = await getPrimaryTournament(admin)
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
      .select('id, prize, click_url, logo_tone, sponsors(id, name, website_url, logo_url, logo_tone, brand_color, tagline)')
      .eq('challenge_id', challengeId).eq('enabled', true)
      .lte('starts_at', nowIso).gte('ends_at', nowIso)
      .order('starts_at', { ascending: true }).limit(1)

    const c = (camps as any)?.[0]
    if (!c || !c.sponsors) return EMPTY

    // Podium prizes (migration 133) — best-effort so the banner never breaks if the
    // columns aren't present yet; they simply stay empty until the migration runs.
    let prize_1 = '', prize_2 = '', prize_3 = ''
    try {
      const { data: pp, error: pe } = await (admin.from('sponsor_campaigns') as any)
        .select('prize_1, prize_2, prize_3').eq('id', c.id).maybeSingle()
      if (!pe && pp) { prize_1 = (pp as any).prize_1 ?? ''; prize_2 = (pp as any).prize_2 ?? ''; prize_3 = (pp as any).prize_3 ?? '' }
    } catch { /* columns not migrated yet */ }

    // Wordmark flag (migration 134) — best-effort, defaults false until migrated.
    let logoIncludesName = false
    try {
      const { data: sp, error: se } = await (admin.from('sponsors') as any)
        .select('logo_includes_name').eq('id', c.sponsors.id).maybeSingle()
      if (!se && sp) logoIncludesName = !!(sp as any).logo_includes_name
    } catch { /* column not migrated yet */ }

    const tone: LogoTone = (c.logo_tone ?? c.sponsors.logo_tone) === 'light' ? 'light' : 'dark'
    return {
      enabled:      true,
      sponsor_name: c.sponsors.name ?? '',
      sponsor_logo: c.sponsors.logo_url ?? '',
      prize:        c.prize ?? '',
      prize_1,
      prize_2,
      prize_3,
      sponsor_url:  c.click_url || c.sponsors.website_url || '',
      logo_tone:    tone,
      sponsor_brand_color: c.sponsors.brand_color ?? null,
      sponsor_tagline:     c.sponsors.tagline ?? null,
      logo_includes_name:  logoIncludesName,
    }
  } catch {
    return EMPTY
  }
}
