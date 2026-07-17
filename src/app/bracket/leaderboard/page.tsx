import type { Metadata } from 'next'
import { Suspense } from 'react'
import BracketLeaderboardClient from './BracketLeaderboardClient'
import { SITE_URL } from '@/lib/seo'

// Server wrapper for server-rendered metadata. The per-challenge boards live at
// /bracket/leaderboard/[slug] (already fully covered); this is the index.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Bracket challenge leaderboards | TribePicks',
  description: 'Browse the public World Cup 2026 bracket challenge leaderboards on TribePicks — see who is topping the standings.',
  alternates: { canonical: `${SITE_URL}/bracket/leaderboard` },
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <BracketLeaderboardClient />
    </Suspense>
  )
}
