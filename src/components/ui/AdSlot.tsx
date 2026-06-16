'use client'

import { clsx } from 'clsx'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'
import { SPONSORS } from '@/lib/sponsors'

// Reusable ad placement. Resolution order (and never shown to premium users):
//   1. A direct sponsor banner configured for this slot (src/lib/sponsors.ts) —
//      shows immediately, no ad network needed.
//   2. Otherwise, an ad-network unit when NEXT_PUBLIC_ADS_ENABLED='true' (drop the
//      real unit where the TODO is, keyed by `slot`).
//   3. Otherwise nothing (dormant).
export function AdSlot({ slot, className }: { slot: string; className?: string }) {
  const { isPremium } = useUserPrefs()
  if (isPremium) return null

  // 1. Direct sponsor banner (image + click-through) — zero ad-network setup.
  const sponsor = SPONSORS[slot] ?? null
  if (sponsor) {
    return (
      <a href={sponsor.href} target="_blank" rel="noopener noreferrer sponsored"
        data-ad-slot={slot}
        className={clsx('block overflow-hidden rounded-xl border border-gray-100', className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={sponsor.image} alt={sponsor.alt} className="block w-full h-auto" />
        <span className="block text-center text-[9px] uppercase tracking-widest text-gray-400 py-1">Sponsored</span>
      </a>
    )
  }

  // 2. Ad-network placeholder (dormant unless explicitly enabled).
  const enabled = process.env.NEXT_PUBLIC_ADS_ENABLED === 'true'
  if (!enabled) return null

  return (
    <div
      data-ad-slot={slot}
      aria-label="Advertisement"
      className={clsx(
        'rounded-xl border border-dashed border-gray-300 bg-gray-50/60 py-6 text-center',
        className,
      )}
    >
      <p className="text-[10px] uppercase tracking-widest text-gray-400">Advertisement</p>
      {/* TODO: render the real ad unit here, e.g.:
          <ins className="adsbygoogle" style={{display:'block'}}
               data-ad-client="ca-pub-XXXX" data-ad-slot="YYYY"
               data-ad-format="auto" data-full-width-responsive="true" /> */}
    </div>
  )
}
