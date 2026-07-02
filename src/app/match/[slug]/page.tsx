import type { Metadata } from 'next'
import { MatchChallengeView } from '@/components/game/MatchChallengeView'
import { matchMetadata } from '@/lib/match/og'

// Server component: emits per-match Open Graph / Twitter tags in the initial HTML
// (generateMetadata) for rich link previews; the interactive predictor + leaderboard
// render client-side via <MatchChallengeView>.
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  return matchMetadata(params.slug)
}

export default function MatchChallengePage({ params }: { params: { slug: string } }) {
  return <MatchChallengeView slug={params.slug} />
}
