'use client'

import { BracketLeaderboardView } from '@/components/game/BracketLeaderboardView'

// Slug-less entry point — the API resolves the tournament's default bracket
// challenge. Branded, per-challenge boards live at /bracket/leaderboard/[slug].
export default function BracketLeaderboardPage() {
  return <BracketLeaderboardView />
}
