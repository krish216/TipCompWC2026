'use client'

import { clsx } from 'clsx'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'

// Reusable ad placement. DORMANT by default: renders nothing unless ads are
// switched on via NEXT_PUBLIC_ADS_ENABLED='true', and never for premium users.
// When enabled it shows a labelled placeholder — drop your ad-network unit
// (e.g. an AdSense <ins className="adsbygoogle">) where the TODO is, keyed by `slot`.
export function AdSlot({ slot, className }: { slot: string; className?: string }) {
  const { isPremium } = useUserPrefs()
  const enabled = process.env.NEXT_PUBLIC_ADS_ENABLED === 'true'
  if (!enabled || isPremium) return null

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
