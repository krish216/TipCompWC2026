import type { Metadata } from 'next'
import { Suspense } from 'react'
import BracketClient from './BracketClient'
import { SITE_URL } from '@/lib/seo'

// Server wrapper for server-rendered metadata. The interactive bracket builder is in
// <BracketClient>. NB: "Bracket" wording is pending a product/brand call for AU/UK audiences.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'World Cup 2026 Bracket — free bracket predictor | TribePicks',
  description: 'Fill in a free World Cup 2026 bracket — predict every knockout tie all the way to the final. No account needed, play as a guest, and share it with your mates.',
  alternates: { canonical: `${SITE_URL}/bracket` },
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <BracketClient />
    </Suspense>
  )
}
