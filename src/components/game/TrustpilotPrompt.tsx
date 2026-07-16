'use client'

import { useState, useEffect } from 'react'
import { clsx } from 'clsx'
import { track } from '@vercel/analytics'

const DISMISS_KEY = 'tp:trustpilot-dismissed'
const REVIEW_URL  = 'https://www.trustpilot.com/evaluate/tribepicks.com'

// A small, dismissible "rate us on Trustpilot" prompt. Shown only to engaged users (passed
// via `engaged` — e.g. someone who has points on the board) so we never ask a newcomer.
// Dismissal is remembered in localStorage under a shared key, so closing it on one surface
// (ScoreBoard or Home) hides it on both.
export function TrustpilotPrompt({ engaged, surface, className }: { engaged: boolean; surface: 'scoreboard' | 'home'; className?: string }) {
  // Start hidden to avoid a flash before the dismissal flag is read on the client.
  const [hidden, setHidden] = useState(true)
  useEffect(() => {
    try { setHidden(localStorage.getItem(DISMISS_KEY) === '1') } catch { setHidden(false) }
  }, [])

  if (!engaged || hidden) return null

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
    setHidden(true)
  }

  return (
    <div className={clsx('flex items-center gap-3 rounded-xl border border-purple-200 bg-purple-50 px-3.5 py-2.5 text-sm', className)}>
      <span className="text-lg flex-shrink-0" aria-hidden>⭐</span>
      <p className="flex-1 text-purple-900 leading-snug">
        Enjoying TribePicks? A quick Trustpilot review helps other tribes find us.
      </p>
      <a
        href={REVIEW_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track('trustpilot_click', { surface })}
        className="flex-shrink-0 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-700"
      >
        Rate us&nbsp;→
      </a>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="flex-shrink-0 text-purple-400 hover:text-purple-600 text-lg leading-none"
      >
        ✕
      </button>
    </div>
  )
}
