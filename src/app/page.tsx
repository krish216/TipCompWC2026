import type { Metadata } from 'next'
import { Suspense } from 'react'
import HomeClient from './HomeClient'
import { SITE_DESCRIPTION, SITE_URL } from '@/lib/seo'

// Server wrapper so the homepage — the site's most important page — carries real
// server-rendered title/description/canonical (the interactive dashboard stays in
// <HomeClient>). The site-wide Organization/WebSite/WebApplication JSON-LD comes from the
// root layout, so no per-page schema is needed here.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'TribePicks — free football prediction game, brackets & comps',
  description: SITE_DESCRIPTION,
  alternates: { canonical: SITE_URL },
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <HomeClient />
    </Suspense>
  )
}
