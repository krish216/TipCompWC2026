import { Suspense } from 'react'
import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase'
import { Spinner } from '@/components/ui'
import SweepClient from './SweepClient'

const DESC = 'Grab a ticket, pay your organiser directly, and spin the wheel for your horse. Every dollar goes back as prizes.'

// A server wrapper so a sweep's join link (/sweep?code=…) unfurls in Slack, Teams and group
// chats with the sweep's own name, rather than the site-wide football card. The page itself
// is SweepClient.
export async function generateMetadata({ searchParams }: { searchParams: { code?: string } }): Promise<Metadata> {
  let title = 'Melbourne Cup 2026 sweeps | TribePicks'
  let ogTitle = 'Melbourne Cup 2026 sweeps on TribePicks'
  const code = searchParams.code?.toUpperCase()
  if (code) {
    const { data: comp } = await (createAdminClient().from('comps') as any)
      .select('name, tournaments(name, format)').eq('invite_code', code).maybeSingle()
    if ((comp as any)?.tournaments?.format === 'sweep') {
      title = `Join ${(comp as any).name} | TribePicks`
      ogTitle = `🐎 Join ${(comp as any).name}`
    }
  }
  return {
    title,
    description: DESC,
    openGraph: { title: ogTitle, description: DESC, siteName: 'TribePicks', type: 'website' },
  }
}

export default function SweepPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div>}>
      <SweepClient />
    </Suspense>
  )
}
