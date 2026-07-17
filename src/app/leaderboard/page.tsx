import type { Metadata } from 'next'
import { Suspense } from 'react'
import LeaderboardClient from './LeaderboardClient'
import { SITE_URL } from '@/lib/seo'

// Server wrapper for server-rendered title/description/canonical. The live standings are
// personalised and load in <LeaderboardClient>.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Leaderboard & live standings | TribePicks',
  description: 'Live TribePicks standings — see how you and your comp rank across the tournament, round by round.',
  alternates: { canonical: `${SITE_URL}/leaderboard` },
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LeaderboardClient />
    </Suspense>
  )
}
