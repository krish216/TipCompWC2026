'use client'

import { useState, useEffect } from 'react'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { Spinner } from '@/components/ui'

export function EmailVerificationBanner() {
  const { supabase, session } = useSupabase()
  // supabase used only for DB read; resend is done via API route
  const [verified,      setVerified]      = useState<boolean | null>(null) // null = loading
  const [dismissed,     setDismissed]     = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendSent,    setResendSent]    = useState(false)
  const [resendError,   setResendError]   = useState(false)

  useEffect(() => {
    if (!session?.user?.id) { setVerified(null); return }
    // Source of truth mirrors src/app/page.tsx: verified if our column is true OR
    // Supabase's own email_confirmed_at is set — covers OAuth logins and cases where
    // the PKCE callback never wrote our column (which were wrongly re-prompting users).
    const confirmedInAuth = !!session.user.email_confirmed_at
    supabase
      .from('users')
      .select('email_verified')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        const col = !!(data as any)?.email_verified
        setVerified(col || confirmedInAuth)
        // Self-heal the stale column so other surfaces reading it are correct too.
        if (confirmedInAuth && !col) {
          ;(supabase.from('users') as any).update({ email_verified: true }).eq('id', session.user.id).then(() => {})
        }
      })
  }, [session?.user?.id])

  // Don't render until we know the state, or if verified / dismissed
  if (!session || verified === null || verified || dismissed) return null

  const handleResend = async () => {
    setResendLoading(true)
    setResendError(false)
    const res = await fetch('/api/auth/resend-verification', { method: 'POST' }).catch(() => null)
    if (res?.ok) {
      setResendSent(true)
      setTimeout(() => setResendSent(false), 8000)
    } else {
      setResendError(true)
      setTimeout(() => setResendError(false), 6000)
    }
    setResendLoading(false)
  }

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-amber-800">
          <span className="font-medium">Verify your email</span>
          {' — '}we sent a link to <strong>{session.user.email}</strong>
        </p>
        <div className="flex items-center gap-4 shrink-0">
          {resendSent ? (
            <span className="text-xs text-green-600 font-medium">✓ Email sent!</span>
          ) : resendError ? (
            <span className="text-xs text-red-600 font-medium">Failed — try again</span>
          ) : (
            <button
              onClick={handleResend}
              disabled={resendLoading}
              className="text-xs text-amber-700 hover:text-amber-900 font-medium underline disabled:opacity-50 flex items-center gap-1"
            >
              {resendLoading && <Spinner className="w-3 h-3" />}
              Resend
            </button>
          )}
          <button
            onClick={() => setDismissed(true)}
            className="text-amber-400 hover:text-amber-600 text-xl leading-none"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  )
}
