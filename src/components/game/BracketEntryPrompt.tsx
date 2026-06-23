'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSupabase } from '@/components/layout/SupabaseProvider'

// In-app nudge to enter the Bracket Challenge, for the three high-traffic surfaces
// (/predict, /leaderboard, /). It asks ONE endpoint (/api/bracket/entry-status) for
// the authoritative "should we show this?" so the check can never diverge between
// pages — an entrant sees nothing, anywhere. Dismissal is shared (one localStorage
// key) so dismissing on one surface clears it on all of them: no cluster of cards.

const DISMISS_KEY = 'bracket_prompt_dismissed_v1'

export function BracketEntryPrompt({ variant = 'card' }: { variant?: 'card' | 'banner' }) {
  const { session } = useSupabase()
  const [show, setShow]           = useState(false)
  const [dismissed, setDismissed] = useState(true)  // assume hidden until we know

  useEffect(() => {
    if (!session?.user?.id) { setShow(false); return }
    // Respect a prior dismissal immediately (shared across surfaces).
    let wasDismissed = false
    try { wasDismissed = localStorage.getItem(DISMISS_KEY) === '1' } catch {}
    setDismissed(wasDismissed)
    if (wasDismissed) return
    let alive = true
    fetch('/api/bracket/entry-status')
      .then(r => r.json())
      .then(d => { if (alive) setShow(!!d.show) })
      .catch(() => { if (alive) setShow(false) })
    return () => { alive = false }
  }, [session?.user?.id])

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch {}
    setDismissed(true)
  }

  if (!session || dismissed || !show) return null

  if (variant === 'banner') {
    return (
      <div className="mb-3 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
        <span className="text-base flex-shrink-0">🏆</span>
        <Link href="/bracket" className="flex-1 min-w-0 group">
          <p className="text-xs font-bold text-emerald-900 leading-snug">
            Enter the Bracket Challenge <span className="text-emerald-700 group-hover:underline">— predict the knockouts, free →</span>
          </p>
          <p className="text-[11px] text-emerald-600">Locks Sun 28 Jun. One bracket, live leaderboard.</p>
        </Link>
        <button onClick={dismiss} aria-label="Dismiss" className="flex-shrink-0 text-emerald-400 hover:text-emerald-600 text-lg leading-none">×</button>
      </div>
    )
  }

  return (
    <div className="mb-3 rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white px-4 py-3.5 flex items-start gap-3">
      <span className="text-xl flex-shrink-0 mt-0.5">🏆</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-900">Enter the Bracket Challenge</p>
        <p className="text-xs text-gray-500 mt-0.5">Predict the whole World Cup knockout bracket — free, 2 minutes. Locks <strong>Sun 28 Jun</strong>.</p>
        <Link href="/bracket" className="inline-block mt-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white">
          Build &amp; enter →
        </Link>
      </div>
      <button onClick={dismiss} aria-label="Dismiss" className="flex-shrink-0 text-gray-300 hover:text-gray-500 text-xl leading-none">×</button>
    </div>
  )
}
