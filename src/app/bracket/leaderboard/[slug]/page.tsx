import type { Metadata } from 'next'
import { BracketLeaderboardView } from '@/components/game/BracketLeaderboardView'
import { boardMetadata } from '@/lib/sponsors/board-og'

// Server component: emits per-board Open Graph / Twitter tags in the initial HTML
// (generateMetadata) so JS-less link-preview crawlers render a rich card. The board
// body itself stays client-rendered via <BracketLeaderboardView>.
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  return boardMetadata(params.slug)
}

// Branded, shareable per-challenge leaderboard (the URL you point a sponsor at):
// /bracket/leaderboard/<challenge-slug>.
export default function BracketChallengeLeaderboardPage({ params }: { params: { slug: string } }) {
  return <BracketLeaderboardView slug={params.slug} />
}
