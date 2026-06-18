'use client'

import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'

// Nudge surfaced on home / leaderboard / predict once a round is fully scored,
// linking the tribe to its satirical Round Debrief. Gated by /api/round-debrief-card
// (round complete + you're in a tribe). Dismiss is per-round and shared across
// every surface so it's never naggy.
export function RoundDebriefCard({ className, round = 'gs1' }: { className?: string; round?: string }) {
  const { hasTribe, selectedTribeId } = useUserPrefs()
  const [info, setInfo]           = useState<{ round_code: string; round_name: string } | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)

  const dismissKey = `dismissed_debrief_${round}`
  useEffect(() => { setDismissed(localStorage.getItem(dismissKey)) }, [dismissKey])

  useEffect(() => {
    if (!hasTribe || !selectedTribeId) { setInfo(null); return }
    fetch(`/api/round-debrief-card?tribe_id=${selectedTribeId}&round=${round}`)
      .then(r => r.json())
      .then(d => setInfo(d.show ? { round_code: d.round_code, round_name: d.round_name } : null))
      .catch(() => setInfo(null))
  }, [hasTribe, selectedTribeId, round])

  if (!info || !selectedTribeId || dismissed === info.round_code) return null

  return (
    <div className={clsx('flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5', className)}>
      <span className="text-base flex-shrink-0">🕵️</span>
      <div className="flex-1 min-w-0 text-xs text-amber-900">
        <strong>The {info.round_name} debrief is in</strong> — who bagged the Wooden Spoon? 🥄{' '}
        <a href={`/tribe/round-debrief?tribe_id=${selectedTribeId}&round=${info.round_code}`}
          className="underline font-semibold whitespace-nowrap">Read the dossier →</a>
      </div>
      <button
        onClick={() => { setDismissed(info.round_code); localStorage.setItem(dismissKey, info.round_code) }}
        className="text-amber-400 hover:text-amber-600 text-base font-semibold flex-shrink-0 px-1 leading-none"
        aria-label="Dismiss">×</button>
    </div>
  )
}
