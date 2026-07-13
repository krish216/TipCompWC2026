'use client'

import { useEffect, useState } from 'react'
import { DOGS } from '@/lib/dogs'
import { DogAvatar } from '@/components/game/DogAvatar'

// Gentle pre-match "feed a doggie for luck" nudge on the predict page — superstition peaks
// before kickoff. Dismissible (localStorage) so it never nags; the footer + cabinet CTA stay
// as the always-available paths. Feeding is a donation and never affects scoring.
const KEY = 'feedLuckDismissed'

export function FeedLuckNudge({ className }: { className?: string }) {
  const [show, setShow] = useState(false)
  const [dog, setDog] = useState(DOGS[0])

  // Pick the featured doggie client-side (post-hydration) to avoid an SSR mismatch.
  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem(KEY)) return
    setDog(DOGS[Math.floor(Math.random() * DOGS.length)])
    setShow(true)
  }, [])

  if (!show) return null
  const dismiss = () => { try { localStorage.setItem(KEY, '1') } catch {} ; setShow(false) }

  return (
    <div className={`flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 ${className ?? ''}`}>
      <DogAvatar photo={dog.photo} name={dog.name} className="w-10 h-10 rounded-full flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-amber-900 leading-snug">Feeling lucky? Feed {dog.name} before kickoff 🐾</p>
        <a href="/feed" className="text-xs font-bold text-amber-700 hover:text-amber-900">Feed the pack →</a>
      </div>
      <button onClick={dismiss} aria-label="Dismiss" className="text-amber-400 hover:text-amber-600 text-lg leading-none flex-shrink-0">×</button>
    </div>
  )
}
