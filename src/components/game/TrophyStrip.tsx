'use client'

import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'
import type { Achievements } from '@/lib/achievements'

const MEDAL: Record<1 | 2 | 3, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

// Free engagement strip — medals & badges. Self-fetches; hides until ready so it
// never blocks the page it sits on.
export function TrophyStrip({ className }: { className?: string }) {
  const { selectedTournId, selectedTribeId } = useUserPrefs()
  const [a, setA] = useState<Achievements | null>(null)
  const [done, setDone] = useState(false)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Close the badge tooltip on any tap outside the strip (mobile has no hover).
  useEffect(() => {
    if (!openKey) return
    const onDown = (e: Event) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpenKey(null) }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [openKey])

  useEffect(() => {
    if (!selectedTournId) return
    let live = true
    const q = new URLSearchParams({ tournament_id: selectedTournId })
    if (selectedTribeId) q.set('tribe_id', selectedTribeId)
    fetch(`/api/achievements?${q.toString()}`)
      .then(r => r.json())
      .then(d => { if (live) { setA(d?.badges ? d : null); setDone(true) } })
      .catch(() => { if (live) setDone(true) })
    return () => { live = false }
  }, [selectedTournId, selectedTribeId])

  if (!done || !a) return null

  return (
    <div ref={ref} className={clsx('bg-white rounded-2xl border border-gray-200 p-4', className)}>
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">🏆 Trophies</p>
        {a.globalRank != null && <span className="text-[10px] text-gray-400">#{a.globalRank} of {a.totalPlayers}</span>}
      </div>

      {/* Badges — tap any badge to see how it's earned (hover on desktop). */}
      <div className="flex flex-wrap gap-2">
        {a.badges.map(b => (
          <div key={b.key} className="relative">
            <button type="button" title={b.hint}
              onClick={() => setOpenKey(k => (k === b.key ? null : b.key))}
              className={clsx('inline-flex items-center gap-1 text-[11px] font-bold rounded-full px-2.5 py-1 border transition',
                b.earned ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-gray-50 text-gray-300 border-gray-100',
                openKey === b.key && 'ring-2 ring-amber-300 ring-offset-1')}>
              <span className={clsx(!b.earned && 'grayscale opacity-50')}>{b.emoji}</span> {b.label}
            </button>
            {openKey === b.key && (
              <div role="tooltip"
                className="absolute z-30 top-full left-0 mt-1.5 w-max max-w-[220px] rounded-lg bg-gray-900 text-white text-[11px] leading-snug px-2.5 py-1.5 shadow-lg">
                <span className="font-bold">{b.earned ? '✓ Earned' : '🔒 Locked'}</span>
                <span className="text-gray-300"> · {b.hint}</span>
                <span className="absolute -top-1 left-4 w-2 h-2 rotate-45 bg-gray-900" />
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-400 mt-1.5">Tap a badge to see how it’s earned</p>

      {/* Round medals (your tribe) */}
      {a.medals.length > 0 && (
        <div className="mt-3 pt-2.5 border-t border-gray-100">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Round medals · your tribe</p>
          <div className="flex flex-wrap gap-1.5">
            {a.medals.map(m => (
              <span key={m.round} className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-700 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1">
                {MEDAL[m.place]} {m.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
