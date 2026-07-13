'use client'

import { useState } from 'react'
import { DOGS, BOWLS, dollars } from '@/lib/dogs'
import { DogAvatar } from '@/components/game/DogAvatar'
import { Spinner } from '@/components/ui'
import toast from 'react-hot-toast'

// Pick a doggie + a bowl → Stripe Checkout (kind:'donation'). Requires sign-in for attribution;
// signed-out visitors get a prompt instead. Feeding is for good luck only — never scoring.
export function FeedPanel({ signedIn, initialDog }: { signedIn: boolean; initialDog?: string }) {
  const [dog,  setDog]  = useState(initialDog ?? DOGS[0].slug)
  const [bowl, setBowl] = useState(BOWLS[1].key)   // default: Meal
  const [busy, setBusy] = useState(false)

  const chosen = BOWLS.find(b => b.key === bowl) ?? BOWLS[1]
  const chosenDog = DOGS.find(d => d.slug === dog) ?? DOGS[0]

  const feed = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'donation', amount_cents: chosen.cents, dog_slug: dog }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || 'Could not start checkout')
      window.location.href = data.url
    } catch (e: any) {
      toast.error(e.message ?? 'Something went wrong')
      setBusy(false)
    }
  }

  if (!signedIn) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center">
        <p className="text-sm text-amber-800 font-medium">Sign in to feed the pack 🐾</p>
        <a href="/login" className="mt-2 inline-block px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold">Sign in</a>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-gray-900 mb-2">Choose a doggie</p>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {DOGS.map(d => (
          <button key={d.slug} onClick={() => setDog(d.slug)}
            className={`flex-shrink-0 flex flex-col items-center gap-1 w-16 ${dog === d.slug ? '' : 'opacity-60 hover:opacity-100'}`}>
            <DogAvatar photo={d.photo} name={d.name} className={`w-14 h-14 rounded-full border-2 ${dog === d.slug ? 'border-emerald-500' : 'border-transparent'}`} />
            <span className="text-[11px] font-semibold text-gray-700 truncate w-full text-center">{d.name}</span>
          </button>
        ))}
      </div>

      <p className="text-sm font-bold text-gray-900 mt-4 mb-2">Fill a bowl</p>
      <div className="grid grid-cols-3 gap-2">
        {BOWLS.map(b => (
          <button key={b.key} onClick={() => setBowl(b.key)}
            className={`rounded-xl border px-2 py-3 text-center transition-colors ${bowl === b.key ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-emerald-300'}`}>
            <div className="text-xl">{b.emoji}</div>
            <div className="text-[13px] font-bold text-gray-900 mt-0.5">{b.label}</div>
            <div className="text-[11px] text-gray-500 tabular-nums">{dollars(b.cents)}</div>
          </button>
        ))}
      </div>

      <button onClick={feed} disabled={busy}
        className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm py-3 transition-colors">
        {busy && <Spinner className="w-4 h-4 text-white" />}
        Feed {chosenDog.name} a {chosen.label.toLowerCase()} · {dollars(chosen.cents)} 🐾
      </button>
      <p className="text-[11px] text-gray-400 text-center mt-2">For good luck — feeding never affects your scores or standing.</p>
    </div>
  )
}
