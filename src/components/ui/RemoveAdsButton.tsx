'use client'

import { useState } from 'react'
import { clsx } from 'clsx'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'

// CTA for the $2.95 one-time ad-free pass (per tournament). Renders only when ads
// are actually being shown to this user — i.e. ads are on, they haven't already
// paid (Pro or ad-free), and a tournament is selected. Price label mirrors
// AD_FREE_PRICE_CENTS in /api/stripe/create-checkout.
export function RemoveAdsButton({ className, variant = 'button' }: { className?: string; variant?: 'button' | 'link' }) {
  const { isAdFree, adsEnabled, selectedTournId } = useUserPrefs()
  const [loading, setLoading] = useState(false)

  if (!adsEnabled || isAdFree || !selectedTournId) return null

  const go = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournament_id: selectedTournId, kind: 'ad_free' }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.url) window.location.href = data.url
      else setLoading(false)
    } catch {
      setLoading(false)
    }
  }

  if (variant === 'link') {
    return (
      <button onClick={go} disabled={loading}
        className={clsx('text-[11px] text-gray-400 hover:text-gray-600 underline disabled:opacity-50 transition-colors', className)}>
        {loading ? 'Redirecting…' : 'Remove ads · $2.95'}
      </button>
    )
  }

  return (
    <button onClick={go} disabled={loading}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold',
        'bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors',
        className,
      )}>
      {loading ? 'Redirecting…' : 'Remove ads — $2.95'}
    </button>
  )
}
