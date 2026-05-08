'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import confetti from 'canvas-confetti'

function ConfirmedInner() {
  const params = useSearchParams()
  const error  = params.get('error')
  const fired  = useRef(false)

  const [resendLoading, setResendLoading] = useState(false)
  const [resendSent,    setResendSent]    = useState(false)
  const [resendErr,     setResendErr]     = useState<'not_signed_in' | 'generic' | false>(false)

  useEffect(() => {
    // Only fire confetti on the success path (no error param).
    // Successful verifications now redirect to /?verified=1 instead, so this
    // page is mainly shown for error cases and as a direct-URL fallback.
    if (error || fired.current) return
    fired.current = true
    confetti({
      particleCount: 160,
      spread: 85,
      origin: { y: 0.5 },
      colors: ['#22c55e', '#16a34a', '#4ade80', '#fbbf24', '#ffffff'],
    })
  }, [error])

  const handleResend = async () => {
    setResendLoading(true); setResendErr(false)
    const res = await fetch('/api/auth/resend-verification', { method: 'POST' }).catch(() => null)
    if (res?.ok)            { setResendSent(true) }
    else if (res?.status === 401) { setResendErr('not_signed_in') }
    else                    { setResendErr('generic') }
    setResendLoading(false)
  }

  // ── Error screen ─────────────────────────────────────────
  if (error) {
    const isExpiredOrInvalid = error === 'expired_token' || error === 'invalid_token'
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm w-full text-center">
          <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-5">
            <svg className="w-10 h-10 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>

          <h1 className="text-xl font-black text-gray-900 mb-2">
            {isExpiredOrInvalid ? 'Link expired or invalid' : 'Something went wrong'}
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            {isExpiredOrInvalid
              ? 'This verification link has expired or already been used. Request a new one below.'
              : 'We couldn\'t verify your email. Please try again or request a new link.'}
          </p>

          {resendSent ? (
            <div className="mb-6 px-4 py-3 bg-green-50 border border-green-200 rounded-xl">
              <p className="text-sm font-semibold text-green-700">✓ New verification email sent!</p>
              <p className="text-xs text-green-600 mt-1">Check your inbox and click the link.</p>
            </div>
          ) : resendErr ? (
            <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-700">
                {resendErr === 'not_signed_in'
                  ? 'Sign in first, then resend from your account settings.'
                  : 'Failed to send — please try again.'}
              </p>
            </div>
          ) : (
            <button
              onClick={handleResend}
              disabled={resendLoading}
              className="w-full mb-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors">
              {resendLoading ? 'Sending…' : 'Send a new verification link'}
            </button>
          )}

          <Link href="/" className="text-sm text-green-600 hover:text-green-700 font-medium">
            Back to TribePicks →
          </Link>
        </div>
      </div>
    )
  }

  // ── Success screen (fallback — normal flow now redirects to /?verified=1) ──
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-sm w-full text-center">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
          <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-black text-gray-900 mb-2">Email verified!</h1>
        <p className="text-sm text-gray-500 mb-7">Your account is now fully verified.</p>
        <Link href="/"
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
