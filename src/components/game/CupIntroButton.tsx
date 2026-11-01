'use client'

import { useEffect, useRef, useState } from 'react'
import { track } from '@vercel/analytics'
import { cupIntroClip } from '@/lib/sweep/cup-calls'

// "▶ Hear Vicky & Gordo" — their intro to the real sweep (lib/sweep/cup-calls.ts), by My Pool's
// race countdown. Tap to play, never autoplay: phones block it, and sound out of nowhere in an
// office closes the tab. Hidden until the intro has been recorded.
// `light` — for a light page (My Sweeps) rather than My Pool's dark card.
export function CupIntroButton({ light = false, className = '' }: { light?: boolean; className?: string }) {
  const src = cupIntroClip()
  const audio = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  useEffect(() => () => audio.current?.pause(), [])
  if (!src) return null

  const toggle = () => {
    const a = (audio.current ??= Object.assign(new Audio(src), { onended: () => setPlaying(false) }))
    if (playing) { a.pause(); a.currentTime = 0; setPlaying(false); return }
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    track('cup_intro_play')
  }

  return (
    <button onClick={toggle}
      className={`font-bold rounded-full ${light ? 'text-xs px-3 py-1.5' : 'text-[11px] px-2.5 py-1'} ${playing
        ? 'bg-amber-400 text-emerald-950'
        : light ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100' : 'text-white/80 border border-white/25 hover:bg-white/10'} ${className}`}>
      {playing ? '■ Stop' : light ? "🎙️ Hear Vicky & Gordo's sweep intro" : '▶ Hear Vicky & Gordo'}
    </button>
  )
}
