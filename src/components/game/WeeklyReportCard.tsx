'use client'

import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'

// Compact nudge that drives members into the tribe chat (where the Weekly
// Intelligence Report link is posted) — keeping the chat-first funnel. Gated
// server-side by /api/weekly-report-card (admin toggle ON + you're in a tribe of
// 4+). Click goes through /api/r/tribe-chat so it's counted. Dismiss is per-ISO-
// week and shared across every surface (home/predict/leaderboard), so dismissing
// once hides it everywhere for the week — never naggy.
const DISMISS_KEY = 'dismissed_report_week'

export function WeeklyReportCard({ className, src = 'home' }: { className?: string; src?: string }) {
  const { hasTribe, selectedTribeId } = useUserPrefs()
  const [week, setWeek]           = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)

  useEffect(() => { setDismissed(localStorage.getItem(DISMISS_KEY)) }, [])

  useEffect(() => {
    if (!hasTribe || !selectedTribeId) { setWeek(null); return }
    fetch(`/api/weekly-report-card?tribe_id=${selectedTribeId}`)
      .then(r => r.json())
      .then(d => setWeek(d.show ? d.week : null))
      .catch(() => setWeek(null))
  }, [hasTribe, selectedTribeId])

  if (!week || week === dismissed || !selectedTribeId) return null

  return (
    <div className={clsx('flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5', className)}>
      <span className="text-base flex-shrink-0">📋</span>
      <div className="flex-1 min-w-0 text-xs text-amber-900">
        <strong>This week&apos;s tribe intel is in</strong> — see who&apos;s under investigation 👀{' '}
        <a href={`/api/r/tribe-chat?tribe_id=${selectedTribeId}&src=${src}`} className="underline font-semibold whitespace-nowrap">Open chat →</a>
      </div>
      <button
        onClick={() => { setDismissed(week); localStorage.setItem(DISMISS_KEY, week) }}
        className="text-amber-400 hover:text-amber-600 text-base font-semibold flex-shrink-0 px-1 leading-none"
        aria-label="Dismiss">×</button>
    </div>
  )
}
