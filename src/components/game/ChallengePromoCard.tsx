'use client'

import { useEffect, useState } from 'react'
import { clsx } from 'clsx'

interface Promo {
  slug: string
  type: 'match' | 'bracket'
  name: string
  sponsor: { name: string; logo: string; prize: string; tagline: string | null } | null
  href: string
  cta: string
}

// Dismissible promo card advertising an open challenge on a given surface
// ('home' | 'scoreboard'). Server excludes challenges the user has already entered.
// Shows one at a time (the first not-dismissed), dismiss is per-challenge.
export function ChallengePromoCard({ surface, className }: { surface: 'home' | 'scoreboard'; className?: string }) {
  const [promos, setPromos]       = useState<Promo[] | null>(null)
  const [dismissed, setDismissed] = useState<string[]>([])

  useEffect(() => { try { setDismissed(JSON.parse(localStorage.getItem('dismissed_promos') || '[]')) } catch { /* ignore */ } }, [])
  useEffect(() => {
    fetch(`/api/challenge-promos?surface=${surface}`).then(r => r.json())
      .then(d => setPromos(d.promos ?? [])).catch(() => setPromos([]))
  }, [surface])

  if (!promos) return null
  const promo = promos.find(p => !dismissed.includes(p.slug))
  if (!promo) return null

  const dismiss = () => {
    const next = [...dismissed, promo.slug]
    setDismissed(next)
    try { localStorage.setItem('dismissed_promos', JSON.stringify(next.slice(-50))) } catch { /* ignore */ }
  }

  return (
    <div className={clsx('rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white px-4 py-3.5', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">{promo.type === 'match' ? '🎯 Challenge' : '🏆 Bracket Challenge'}</p>
          <p className="text-sm font-bold text-gray-900 mt-0.5 leading-snug">{promo.name}</p>
          {promo.sponsor?.name && (
            <p className="text-[11px] font-semibold text-amber-700 mt-0.5">🤝 {promo.sponsor.name}{promo.sponsor.tagline ? ` ${promo.sponsor.tagline}` : ''}{promo.sponsor.prize ? <> · win <span className="text-amber-800">{promo.sponsor.prize}</span></> : ''}</p>
          )}
        </div>
        <button onClick={dismiss} aria-label="Dismiss" className="text-emerald-300 hover:text-emerald-500 text-lg leading-none flex-shrink-0 px-1">×</button>
      </div>
      <a href={promo.href}
        className="mt-2.5 w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-sm font-bold px-4 py-2.5 rounded-lg transition-all">
        {promo.cta}
      </a>
    </div>
  )
}
