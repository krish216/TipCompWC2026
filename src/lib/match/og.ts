import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase'
import { resolveActiveCampaign } from '@/lib/sponsors/resolver'
import { resolveMatchChallenge, getFixture } from '@/lib/match/challenge'

// Server-rendered Open Graph / Twitter metadata for /match/<slug>, so JS-less
// link-preview crawlers (WhatsApp, Facebook, iMessage, Slack) show a rich card.
// Composed from the challenge's fixture + sponsor.
//
// Image resolution, most-specific first:
//   1. OG_IMAGES[slug] — a bespoke, hand-made 1200×630 PNG at public/og/<file>.
//   2. the dynamic card at /api/match/og?slug=… — teams + flags + sponsor/prize,
//      generated per match so every challenge gets a rich large-image preview.

const SITE = 'https://tribepicks.com'

// slug → bespoke 1200×630 card at public/og/<file>. Anything not listed falls back
// to the dynamic /api/match/og card.
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

  // Bespoke PNG if one exists, else the dynamic per-match card. Either way we always
  // have a large image, so the preview is a rich summary_large_image card.
  const image = OG_IMAGES[slug]
    ? `${SITE}${OG_IMAGES[slug]}`
    : `${SITE}/api/match/og?slug=${encodeURIComponent(slug)}`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title, description, url, type: 'website',
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title, description,
      images: [image],
    },
  }
}
