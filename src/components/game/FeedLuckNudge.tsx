'use client'

import { useEffect, useState } from 'react'
import { DOGS, dogBySlug, type Dog } from '@/lib/dogs'
import { DogAvatar } from '@/components/game/DogAvatar'

// Pre-match feed surface on the predict page. Two states:
//   • You've fed → your lucky doggie is "rooting for you this round" (the reward). Dismissible
//     per session (it's a positive charm, not a nag).
//   • You haven't → a gentle "feed a doggie for luck before kickoff" nudge. Dismissible for good.
// Feeding is a donation and never affects scoring.
const GEN_KEY   = 'feedLuckDismissed'      // localStorage — hide the generic nudge for good
const LUCKY_KEY = 'luckyDogDismissed'      // sessionStorage — hide the charm this session

export function FeedLuckNudge({ className }: { className?: string }) {
  const [dog, setDog] = useState<Dog | null>(null)
  const [hasLucky, setHasLucky] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/feed/status')
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        const lucky = d?.luckyDog ? dogBySlug(d.luckyDog) : null
        if (lucky) {
          if (sessionStorage.getItem(LUCKY_KEY)) return
          setDog(lucky); setHasLucky(true)
        } else {
          if (localStorage.getItem(GEN_KEY)) return
          setDog(DOGS[Math.floor(Math.random() * DOGS.length)]); setHasLucky(false)
        }
      })
      .catch(() => { if (!cancelled && !localStorage.getItem(GEN_KEY)) { setDog(DOGS[0]); setHasLucky(false) } })
    return () => { cancelled = true }
  }, [])

  if (!dog) return null
  const dismiss = () => {
    try { hasLucky ? sessionStorage.setItem(LUCKY_KEY, '1') : localStorage.setItem(GEN_KEY, '1') } catch {}
    setDog(null)
  }

  return (
    <div className={`flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 ${className ?? ''}`}>
      <DogAvatar photo={dog.photo} name={dog.name} className="w-10 h-10 rounded-full flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-amber-900 leading-snug">
          {hasLucky ? `🍀 ${dog.name}’s got your back this round — good luck!` : `Feeling lucky? Feed ${dog.name} before kickoff 🐾`}
        </p>
        <a href="/feed" className="text-xs font-bold text-amber-700 hover:text-amber-900">{hasLucky ? 'Feed again →' : 'Feed the pack →'}</a>
      </div>
      <button onClick={dismiss} aria-label="Dismiss" className="text-amber-400 hover:text-amber-600 text-lg leading-none flex-shrink-0">×</button>
    </div>
  )
}
