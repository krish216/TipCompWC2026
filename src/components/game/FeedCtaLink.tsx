'use client'

import { track } from '@vercel/analytics'

// A "Feed the doggies" call-to-action link that logs a Vercel Analytics event on click, tagged
// by where it lives (footer / predict_nudge / cabinet). Lets us measure click-through per surface.
// Usable inside server components (it's a client component).
export function FeedCtaLink({
  source, href = '/feed', className, children,
}: {
  source: string
  href?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <a href={href} onClick={() => track('feed_cta_click', { source })} className={className}>
      {children}
    </a>
  )
}
