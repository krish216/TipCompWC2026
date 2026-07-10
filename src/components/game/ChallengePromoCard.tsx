'use client'

import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'

interface Promo {
  slug: string
  type: 'match' | 'bracket'
  name: string
  sponsor: { name: string; logo: string; prize: string; tagline: string | null } | null
  team_images: { home: string; away: string } | null
  href: string
  cta: string
}

// Max promo cards to show at once on a surface — keeps concurrent challenges
// visible without letting the page become a stack of banners. Any beyond this
// roll in as the user dismisses the ones on top.
const MAX_VISIBLE = 2

// Dismissible promo cards advertising open challenges on a given surface
// ('home' | 'scoreboard'). Server excludes challenges the user has already entered.
// Shows up to MAX_VISIBLE not-dismissed at once; dismiss is per-challenge.
export function ChallengePromoCard({ surface, className }: { surface: 'home' | 'scoreboard' | 'predict'; className?: string }) {
  const { selectedTournId } = useUserPrefs()
  const [promos, setPromos]       = useState<Promo[] | null>(null)
  const [dismissed, setDismissed] = useState<string[]>([])

  useEffect(() => { try { setDismissed(JSON.parse(localStorage.getItem('dismissed_promos') || '[]')) } catch { /* ignore */ } }, [])
  useEffect(() => {
    // Follow the user's selected tournament so promos match the tournament they're in.
    const qs = selectedTournId ? `&tournament_id=${encodeURIComponent(selectedTournId)}` : ''
    fetch(`/api/challenge-promos?surface=${surface}${qs}`).then(r => r.json())
      .then(d => setPromos(d.promos ?? [])).catch(() => setPromos([]))
  }, [surface, selectedTournId])

  if (!promos) return null
  const visible = promos.filter(p => !dismissed.includes(p.slug)).slice(0, MAX_VISIBLE)
  if (!visible.length) return null

  const dismiss = (slug: string) => {
    const next = [...dismissed, slug]
    setDismissed(next)
    try { localStorage.setItem('dismissed_promos', JSON.stringify(next.slice(-50))) } catch { /* ignore */ }
  }

  return (
    <div className={clsx('space-y-2.5', className)}>
      {visible.map(promo => (
        <div key={promo.slug} className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white px-4 py-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">{promo.type === 'match' ? '🎯 Challenge' : '🏆 Bracket Challenge'}</p>
              <p className="text-sm font-bold text-gray-900 mt-0.5 leading-snug">{promo.name}</p>
              {promo.sponsor?.name && (
                <p className="text-[11px] font-semibold text-amber-700 mt-0.5">🤝 {promo.sponsor.name}{promo.sponsor.tagline ? ` ${promo.sponsor.tagline}` : ''}{promo.sponsor.prize ? <> · win <span className="text-amber-800">{promo.sponsor.prize}</span></> : ''}</p>
              )}
            </div>
            <button onClick={() => dismiss(promo.slug)} aria-label="Dismiss" className="text-emerald-300 hover:text-emerald-500 text-lg leading-none flex-shrink-0 px-1">×</button>
          </div>
          {promo.team_images && (
            <div className="flex items-center justify-center gap-3 mt-2.5">
              <img src={promo.team_images.home} alt="" className="w-12 h-12 rounded-lg object-cover shadow-sm" />
              <span className="text-xs font-black text-gray-400">v</span>
              <img src={promo.team_images.away} alt="" className="w-12 h-12 rounded-lg object-cover shadow-sm" />
            </div>
          )}
          <a href={promo.href}
            className="mt-2.5 w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-sm font-bold px-4 py-2.5 rounded-lg transition-all">
            {promo.cta}
          </a>
        </div>
      ))}
    </div>
  )
}
