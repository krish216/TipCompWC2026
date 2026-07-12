'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'

// In-app nudge to enter the SELECTED tournament's flagship challenge — the Bracket for a
// knockout (WC), the Table Predictor / top-5 & bottom-3 for a league (EPL). One endpoint
// (/api/challenges/flagship) is the authoritative "which challenge, and should we show
// it?" so the check can't diverge between the surfaces it renders on (/predict,
// /leaderboard, /). Dismissal is per-tournament+type so dismissing EPL's predictor never
// hides WC's bracket, and vice-versa.

type Flagship = {
  type:  'bracket' | 'predictor'
  href:  string
  label: string
  blurb: string
  entered: boolean
  show:  boolean
}

const STYLE = {
  bracket:   { icon: '🏆', cta: 'predict the knockouts, free →',  btn: 'Build & enter →' },
  predictor: { icon: '🪜', cta: 'pick the top 5 & bottom 3, free →', btn: 'Make your picks →' },
} as const

export function FlagshipChallengePrompt({ variant = 'card' }: { variant?: 'card' | 'banner' }) {
  const { session } = useSupabase()
  const { selectedTourn } = useUserPrefs()
  const slug = (selectedTourn as any)?.slug as string | undefined

  const [flagship, setFlagship] = useState<Flagship | null>(null)
  const [dismissed, setDismissed] = useState(true)  // assume hidden until we know

  const dismissKey = flagship ? `flagship_dismissed_v1_${slug}_${flagship.type}` : null

  useEffect(() => {
    if (!session?.user?.id || !slug) { setFlagship(null); return }
    let alive = true
    fetch(`/api/challenges/flagship?tournament=${encodeURIComponent(slug)}`)
      .then(r => r.json())
      .then(d => {
        if (!alive) return
        const f: Flagship | null = d.flagship ?? null
        setFlagship(f && f.show ? f : null)
        if (f && f.show) {
          let wasDismissed = false
          try { wasDismissed = localStorage.getItem(`flagship_dismissed_v1_${slug}_${f.type}`) === '1' } catch {}
          setDismissed(wasDismissed)
        }
      })
      .catch(() => { if (alive) setFlagship(null) })
    return () => { alive = false }
  }, [session?.user?.id, slug])

  const dismiss = () => {
    if (dismissKey) { try { localStorage.setItem(dismissKey, '1') } catch {} }
    setDismissed(true)
  }

  if (!session || !flagship || dismissed) return null

  const s = STYLE[flagship.type]

  if (variant === 'banner') {
    return (
      <div className="mb-3 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
        <span className="text-base flex-shrink-0">{s.icon}</span>
        <Link href={flagship.href} className="flex-1 min-w-0 group">
          <p className="text-xs font-bold text-emerald-900 leading-snug">
            Enter the {flagship.label} <span className="text-emerald-700 group-hover:underline">— {s.cta}</span>
          </p>
          <p className="text-[11px] text-emerald-600">{flagship.blurb}</p>
        </Link>
        <button onClick={dismiss} aria-label="Dismiss" className="flex-shrink-0 text-emerald-400 hover:text-emerald-600 text-lg leading-none">×</button>
      </div>
    )
  }

  return (
    <div className="mb-3 rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white px-4 py-3.5 flex items-start gap-3">
      <span className="text-xl flex-shrink-0 mt-0.5">{s.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-900">Enter the {flagship.label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{flagship.blurb}</p>
        <Link href={flagship.href} className="inline-block mt-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white">
          {s.btn}
        </Link>
      </div>
      <button onClick={dismiss} aria-label="Dismiss" className="flex-shrink-0 text-gray-300 hover:text-gray-500 text-xl leading-none">×</button>
    </div>
  )
}
