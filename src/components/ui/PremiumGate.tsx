'use client'

import React, { useState } from 'react'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'
import { RemoveAdsButton } from './RemoveAdsButton'

// ── Crown badge ──────────────────────────────────────────────────────────────
export function CrownBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[10px] font-bold tracking-wide ${className}`}>
      <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
        <path d="M6 1L8 4.5L11 3L9.5 8H2.5L1 3L4 4.5L6 1Z"/>
        <rect x="2.5" y="9" width="7" height="1.5" rx="0.75"/>
      </svg>
      Pro
    </span>
  )
}

// ── Upgrade modal ─────────────────────────────────────────────────────────────
export function UpgradeModal({ tournamentId, tournamentName, onClose }: {
  tournamentId:   string
  tournamentName: string
  onClose:        () => void
}) {
  const { adsEnabled, isAdFree } = useUserPrefs()
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const handleUpgrade = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournament_id: tournamentId }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Something went wrong'); setLoading(false); return }
      window.location.href = data.url
    } catch {
      setError('Network error — please try again')
      setLoading(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 pointer-events-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">👑</span>
              <div>
                <p className="text-sm font-bold text-gray-900">TribePicks Pro</p>
                <p className="text-xs text-gray-500">{tournamentName}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
          </div>

          {/* Features */}
          <ul className="space-y-2 mb-5">
            {[
              'Full Insights — drop-off analysis & round summaries',
              'Email campaigns — send to all or untipped tipsters',
              'Create challenges & bonus competitions',
              'Full payment tracking for all members',
              'Custom comp branding (logo upload)',
            ].map(f => (
              <li key={f} className="flex items-start gap-2 text-xs text-gray-700">
                <span className="text-amber-500 font-bold mt-0.5">✓</span>
                {f}
              </li>
            ))}
          </ul>

          {/* Price */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-center">
            <p className="text-2xl font-black text-amber-700">$9.95 <span className="text-sm font-semibold">AUD</span></p>
            <p className="text-[11px] text-amber-600 mt-0.5">One-time · covers the full tournament · GST included</p>
          </div>

          {error && <p className="text-xs text-red-600 mb-3 text-center">{error}</p>}

          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-sm font-bold rounded-xl transition-colors">
            {loading ? 'Redirecting to checkout…' : 'Upgrade to Pro →'}
          </button>
          <p className="text-[10px] text-gray-400 text-center mt-2">Secure payment via Stripe</p>

          {/* Downsell — only when ads are live and the user isn't already ad-free */}
          {adsEnabled && !isAdFree && (
            <div className="mt-3 pt-3 border-t border-gray-100 text-center text-[11px] text-gray-400">
              Just want the ads gone? <RemoveAdsButton variant="link" className="ml-0.5" />
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── PremiumSection — blurs a content block and shows a lock overlay ───────────
// Usage: <PremiumSection title="Drop-off Analysis"><YourContent /></PremiumSection>
export function PremiumSection({ children, title }: { children: React.ReactNode; title?: string }) {
  const { isPremium, selectedTournId, selectedTourn } = useUserPrefs()
  const [showModal, setShowModal] = useState(false)

  if (isPremium) return <>{children}</>

  return (
    <>
      <div className="relative rounded-xl overflow-hidden">
        {/* Blurred content */}
        <div className="pointer-events-none select-none blur-[3px] opacity-60">
          {children}
        </div>
        {/* Lock overlay */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 cursor-pointer bg-white/60"
          onClick={() => setShowModal(true)}>
          <div className="bg-amber-100 rounded-full p-2.5">
            <svg width="18" height="18" viewBox="0 0 12 12" fill="#d97706" aria-hidden="true">
              <path d="M6 1L8 4.5L11 3L9.5 8H2.5L1 3L4 4.5L6 1Z"/>
              <rect x="2.5" y="9" width="7" height="1.5" rx="0.75"/>
            </svg>
          </div>
          <p className="text-xs font-bold text-amber-700">{title ?? 'Pro feature'}</p>
          <p className="text-[11px] text-amber-600 underline">Upgrade to unlock</p>
        </div>
      </div>
      {showModal && selectedTournId && (
        <UpgradeModal
          tournamentId={selectedTournId}
          tournamentName={selectedTourn?.name ?? 'this tournament'}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}

// ── PremiumButton — clones a button/element and intercepts click when locked ──
// Usage: <PremiumButton><button onClick={send}>Send</button></PremiumButton>
// When not premium: disables the child's onClick, shows crown badge overlay, opens upgrade modal on click.
export function PremiumButton({ children, className = '' }: {
  children:   React.ReactElement
  className?: string
}) {
  const { isPremium, selectedTournId, selectedTourn } = useUserPrefs()
  const [showModal, setShowModal] = useState(false)

  if (isPremium) return <>{children}</>

  const intercepted = React.cloneElement(children, {
    onClick:  (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); setShowModal(true) },
    disabled: false,
  })

  return (
    <>
      <div className={`relative ${className}`}>
        {intercepted}
        <span className="absolute top-1/2 right-3 -translate-y-1/2 pointer-events-none">
          <CrownBadge />
        </span>
      </div>
      {showModal && selectedTournId && (
        <UpgradeModal
          tournamentId={selectedTournId}
          tournamentName={selectedTourn?.name ?? 'this tournament'}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}
