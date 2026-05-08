'use client'

import { Suspense, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import confetti from 'canvas-confetti'

function ConfirmedInner() {
  const params  = useSearchParams()
  const next    = params.get('next') ?? '/'
  const fired   = useRef(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true
    confetti({
      particleCount: 160,
      spread: 85,
      origin: { y: 0.5 },
      colors: ['#22c55e', '#16a34a', '#4ade80', '#fbbf24', '#ffffff'],
    })
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-sm w-full text-center">

        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
          <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-2xl font-black text-gray-900 mb-2">Email verified!</h1>
        <p className="text-sm text-gray-500 mb-7">Your account is now fully verified. Head back to TribePicks to continue.</p>

        <Link href={next}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm">
          Continue to TribePicks →
        </Link>

      </div>
    </div>
  )
}

export default function ConfirmedPage() {
  return (
    <Suspense>
      <ConfirmedInner />
    </Suspense>
  )
}
