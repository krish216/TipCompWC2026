'use client'

import { BracketLeaderboardView } from '@/components/game/BracketLeaderboardView'

// Branded, shareable per-challenge leaderboard (the URL you point a sponsor at):
// /bracket/leaderboard/<challenge-slug>.
export default function BracketChallengeLeaderboardPage({ params }: { params: { slug: string } }) {
  return <BracketLeaderboardView slug={params.slug} />
}
