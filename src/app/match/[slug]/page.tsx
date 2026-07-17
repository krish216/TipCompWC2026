import type { Metadata } from 'next'
import { MatchChallengeView } from '@/components/game/MatchChallengeView'
import { matchMetadata } from '@/lib/match/og'
import { createAdminClient } from '@/lib/supabase'
import { resolveMatchChallenge, getFixture } from '@/lib/match/challenge'
import { JsonLd } from '@/components/seo/JsonLd'
import { SITE_URL } from '@/lib/seo'

// Server component: emits per-match Open Graph / Twitter tags in the initial HTML
// (generateMetadata) for rich link previews, plus SportsEvent JSON-LD for the fixture so
// search + AI engines understand the page is about a specific football match. The
// interactive predictor + leaderboard render client-side via <MatchChallengeView>.
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  return matchMetadata(params.slug)
}

async function matchEventJsonLd(slug: string) {
  try {
    const admin = createAdminClient()
    const challenge = await resolveMatchChallenge(admin, slug)
    if (!challenge?.fixture_id) return null
    const fx = await getFixture(admin, challenge.fixture_id)
    if (!fx?.home || !fx?.away) return null
    return {
      '@context': 'https://schema.org',
      '@type': 'SportsEvent',
      name: `${fx.home} v ${fx.away}`,
      sport: 'Association football',
      startDate: fx.kickoff_utc,
      ...(fx.venue ? { location: { '@type': 'Place', name: fx.venue } } : {}),
      homeTeam: { '@type': 'SportsTeam', name: fx.home },
      awayTeam: { '@type': 'SportsTeam', name: fx.away },
      competitor: [
        { '@type': 'SportsTeam', name: fx.home },
        { '@type': 'SportsTeam', name: fx.away },
      ],
      url: `${SITE_URL}/match/${slug}`,
      description: `Predict the full-time score of ${fx.home} v ${fx.away} on TribePicks — free, no betting.`,
    }
  } catch {
    return null
  }
}

export default async function MatchChallengePage({ params }: { params: { slug: string } }) {
  const event = await matchEventJsonLd(params.slug)
  return (
    <>
      {event && <JsonLd data={event} />}
      <MatchChallengeView slug={params.slug} />
    </>
  )
}
