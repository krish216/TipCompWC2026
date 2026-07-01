'use client'

import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'

// Nudge surfaced on home / leaderboard / predict once a round is fully scored,
// linking the tribe to its satirical Round Debrief. Gated by /api/round-debrief-card,
// which auto-resolves the latest fully-scored round (unless `round` is passed to pin
// it), so the card advances through the tournament in step with the chat announcement.
// Dismiss is per-round and shared across every surface so it's never naggy.
export function RoundDebriefCard({ className, round, source = 'debrief' }: { className?: string; round?: string; source?: string }) {
  const { hasTribe, selectedTribeId } = useUserPrefs()
  const [info, setInfo]           = useState<{ round_code: string; round_name: string } | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)

  useEffect(() => {
    if (!hasTribe || !selectedTribeId) { setInfo(null); return }
    const qs = round ? `&round=${round}` : ''
    fetch(`/api/round-debrief-card?tribe_id=${selectedTribeId}${qs}`)
      .then(r => r.json())
      .then(d => setInfo(d.show ? { round_code: d.round_code, round_name: d.round_name } : null))
      .catch(() => setInfo(null))
  }, [hasTribe, selectedTribeId, round])

  // Dismiss keyed off the resolved round so each round's card can be dismissed once.
  useEffect(() => {
    if (info) setDismissed(localStorage.getItem(`dismissed_debrief_${info.round_code}`))
  }, [info])

  if (!info || !selectedTribeId || dismissed === info.round_code) return null

  return (
    <div className={clsx('flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5', className)}>
      <span className="text-base flex-shrink-0">🕵️</span>
      <div className="flex-1 min-w-0 text-xs text-amber-900">
        <strong>The {info.round_name} debrief is in</strong> — who bagged the Wooden Spoon? 🥄{' '}
        <a href={`/api/r/round-debrief?tribe_id=${selectedTribeId}&round=${info.round_code}&source=${source}`}
          className="underline font-semibold whitespace-nowrap">Read the dossier →</a>
      </div>
      <button
        onClick={() => { setDismissed(info.round_code); localStorage.setItem(`dismissed_debrief_${info.round_code}`, info.round_code) }}
        className="text-amber-400 hover:text-amber-600 text-base font-semibold flex-shrink-0 px-1 leading-none"
        aria-label="Dismiss">×</button>
    </div>
  )
}
