import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase'
import { resolveActiveCampaign } from '@/lib/sponsors/resolver'
import { resolveMatchChallenge, getFixture } from '@/lib/match/challenge'

// Server-rendered Open Graph / Twitter metadata for /match/<slug>, so JS-less
// link-preview crawlers (WhatsApp, Facebook, iMessage, Slack) show a rich card.
// Composed from the challenge's fixture + sponsor. Bespoke per-slug cards can be
// added to OG_IMAGES later; until then it's a text preview (no large image).

const SITE = 'https://tribepicks.com'

// slug → bespoke 1200×630 card at public/og/<file>. Anything not listed falls back
// to a text preview (title + description only).
const OG_IMAGES: Record<string, string> = {
  'mt-socceroos-egypt': '/og/socceroos-egypt.png',
}

export async function matchMetadata(slug: string): Promise<Metadata> {
  const url = `${SITE}/match/${slug}`
  const admin = createAdminClient()
  const challenge = await resolveMatchChallenge(admin, slug)
  if (!challenge) return { title: 'Match Challenge | TribePicks' }

  const fixture = challenge.fixture_id ? await getFixture(admin, challenge.fixture_id) : null
  const cfg     = await resolveActiveCampaign(admin, { challengeType: 'match', challengeId: challenge.id })
  const sponsor = cfg.enabled ? (cfg.sponsor_name || '') : ''
  const prize   = cfg.enabled ? (cfg.prize || '') : ''
  const match   = fixture ? `${fixture.home} v ${fixture.away}` : 'the match'

  const title = sponsor
    ? `${sponsor} — Pick the score: ${match}`
    : `Pick the score: ${match} | TribePicks`
  const description = prize
    ? `Free · predict the full-time score and win ${prize}. Locks 5 min before kick-off — no sign-up wall.`
    : `Free · predict the full-time score of ${match} and top the leaderboard. Locks 5 min before kick-off.`

  const image = OG_IMAGES[slug] ? `${SITE}${OG_IMAGES[slug]}` : null

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title, description, url, type: 'website',
      ...(image ? { images: [{ url: image, width: 1200, height: 630 }] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title, description,
      ...(image ? { images: [image] } : {}),
    },
  }
}
