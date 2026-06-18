'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { clsx } from 'clsx'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'
import { SPONSORS } from '@/lib/sponsors'
import { RemoveAdsButton } from './RemoveAdsButton'

// AdSense config. Client (publisher) id is app-wide; each placement maps to its
// own AdSense ad-unit id so units can be turned on independently. All come from
// NEXT_PUBLIC_* env so nothing is hard-coded and ads stay dormant until set.
const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT   // ca-pub-XXXXXXXXXXXXXXXX
const ADSENSE_SLOT_IDS: Record<string, string | undefined> = {
  'leaderboard-infeed': process.env.NEXT_PUBLIC_ADSENSE_SLOT_LEADERBOARD,
  'predict-infeed':     process.env.NEXT_PUBLIC_ADSENSE_SLOT_PREDICT,
  'bracket-infeed':     process.env.NEXT_PUBLIC_ADSENSE_SLOT_BRACKET,
}

// One responsive AdSense unit. The push() registers the <ins> with the loader
// (queued if the script hasn't loaded yet); the ref guard prevents the "already
// have ads" error from React re-invoking the effect (StrictMode / re-render).
function AdsenseUnit({ client, adSlot, className }: { client: string; adSlot: string; className?: string }) {
  const pushed = useRef(false)
  useEffect(() => {
    if (pushed.current) return
    pushed.current = true
    try { ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({}) } catch {}
  }, [])
  return (
    <ins
      className={clsx('adsbygoogle', className)}
      style={{ display: 'block' }}
      data-ad-client={client}
      data-ad-slot={adSlot}
      data-ad-format="auto"
      data-full-width-responsive="true"
      aria-label="Advertisement"
    />
  )
}

// Reusable ad placement. Resolution order (never shown to premium users):
//   1. A direct sponsor banner configured for this slot (src/lib/sponsors.ts).
//   2. A Google AdSense unit — when ads are enabled AND this slot has a unit id.
//   3. Otherwise nothing (dormant).
export function AdSlot({ slot, className }: { slot: string; className?: string }) {
  const { isAdFree, adsEnabled } = useUserPrefs()
  // Admin master switch off, or this user paid to remove ads → render nothing.
  if (!adsEnabled || isAdFree) return null

  let ad: ReactNode = null

  // 1. Direct sponsor banner (image + click-through) — zero ad-network setup.
  const sponsor = SPONSORS[slot] ?? null
  if (sponsor) {
    ad = (
      <a href={sponsor.href} target="_blank" rel="noopener noreferrer sponsored"
        data-ad-slot={slot}
        className={clsx('block overflow-hidden rounded-xl border border-gray-100', className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={sponsor.image} alt={sponsor.alt} className="block w-full h-auto" />
        <span className="block text-center text-[9px] uppercase tracking-widest text-gray-400 py-1">Sponsored</span>
      </a>
    )
  } else {
    // 2. AdSense — only when enabled and this slot has a unit id configured.
    const enabled  = process.env.NEXT_PUBLIC_ADS_ENABLED === 'true'
    const adUnitId = ADSENSE_SLOT_IDS[slot]
    if (enabled && ADSENSE_CLIENT && adUnitId) {
      ad = <AdsenseUnit client={ADSENSE_CLIENT} adSlot={adUnitId} className={className} />
    }
  }

  // 3. Dormant — nothing to show.
  if (!ad) return null

  // An ad is showing → offer the cheap ad-free upsell directly beneath it.
  return (
    <div className="space-y-1">
      {ad}
      <div className="text-right"><RemoveAdsButton variant="link" /></div>
    </div>
  )
}
