'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useSupabase } from '@/components/layout/SupabaseProvider'

// Homepage-only entry point to the end-of-WC wrap-up survey. Rather than showing survey
// questions one at a time (they're excluded from the quick-poll card), this links straight to
// /polls — routed to the visitor's own segment (finisher/drifter) + the shared questions.
// Only appears while the survey is active (server-checked), and is dismissible for good.
const DISMISS_KEY = 'wrapupSurveyDismissed'

export function WrapupSurveyBanner() {
  const { session } = useSupabase()
  const pathname = usePathname()
  const [link, setLink] = useState<string | null>(null)

  useEffect(() => {
    if (pathname !== '/' || !session?.user?.id) { setLink(null); return }
    if (typeof window !== 'undefined' && localStorage.getItem(DISMISS_KEY)) return
    fetch('/api/wrapup-segment')
      .then(r => r.json())
      .then(d => { if (d.active && d.segment) setLink(`/polls?topic=wrapup-${d.segment},wrapup-general`) })
      .catch(() => {})
  }, [session?.user?.id, pathname])

  if (!session || !link || pathname !== '/') return null

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
    setLink(null)
  }

  return (
    <div className="bg-violet-50 border-b border-violet-200 px-4 py-2.5">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-violet-900 font-semibold">📋 Before we close the book on the World Cup — a few quick questions?</p>
        <div className="flex items-center gap-2 shrink-0">
          <Link href={link} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition-colors">
            Share your feedback →
          </Link>
          <button onClick={dismiss} aria-label="Dismiss" className="text-violet-400 hover:text-violet-600 text-xl leading-none ml-1">×</button>
        </div>
      </div>
    </div>
  )
}
