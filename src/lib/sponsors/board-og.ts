import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase'
import { resolveActiveCampaign } from '@/lib/sponsors/resolver'

// Per-board Open Graph / Twitter metadata for /bracket/leaderboard/<slug>, rendered
// SERVER-SIDE (via generateMetadata) so link-preview crawlers — WhatsApp, Facebook,
// iMessage, Slack, LinkedIn — which don't run JS, see the tags in the initial HTML.
//
// Three tiers, most-specific first:
//   1. OG_OVERRIDES[slug] — a bespoke, hand-made 1200×630 card + exact copy.
//   2. live sponsor campaign — a preview composed from the board's sponsor/prize.
//   3. generic TribePicks preview — title + description, no large image.

const SITE = 'https://tribepicks.com'

// Slugs with a bespoke preview card (image lives at public/og/<file>). Anything not
// listed here falls back to a campaign-composed or generic preview automatically —
// so this stays per-board, not a hardcoded one-off.
const OG_OVERRIDES: Record<string, { title: string; description: string; image: string }> = {
  rwewc: {
    title:       'Ray White Earlwood | Wolli Creek — Pick the World Cup Winners',
    description: 'Free · pick the knockout winners · top 3 share $500 in fuel vouchers. Join in 2 minutes.',
    image:       `${SITE}/og/rwewc.png`,
  },
}

export async function boardMetadata(slug: string): Promise<Metadata> {
  const url      = `${SITE}/bracket/leaderboard/${slug}`
  const override = OG_OVERRIDES[slug]

  let title: string
  let description: string
  let image: string | null

  if (override) {
    ({ title, description, image } = override)
  } else {
    // Compose a preview from the live sponsor campaign when there is one.
    let sponsorName = '', tagline = '', prize = ''
    try {
      const admin = createAdminClient()
      const cfg = await resolveActiveCampaign(admin, { challengeType: 'bracket', slug })
      if (cfg.enabled) { sponsorName = cfg.sponsor_name || ''; tagline = cfg.sponsor_tagline || ''; prize = cfg.prize || '' }
    } catch { /* fall through to the generic preview */ }

    if (sponsorName) {
      title = `${sponsorName}${tagline ? ` ${tagline}` : ''} — Pick the World Cup Winners`
      description = prize
        ? `Free · pick the knockout winners · top 3 share ${prize}. Join in 2 minutes.`
        : 'Free · pick the World Cup knockout winners and climb the leaderboard. Join in 2 minutes.'
    } else {
      title = 'WC 2026 Bracket Challenge — Pick the World Cup Winners | TribePicks'
      description = 'Free · pick the World Cup 2026 knockout winners and climb the leaderboard. Join in 2 minutes — no sign-up wall.'
    }
    // No bespoke card → a dynamically-generated 1200×630 card that composes the sponsor/prize
    // (or a generic bracket card), so every board still gets a rich preview image.
    image = `${SITE}/api/bracket/og?slug=${encodeURIComponent(slug)}`
  }

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: 'website',
      ...(image ? { images: [{ url: image, width: 1200, height: 630 }] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  }
}
