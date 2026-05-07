'use client'

import { useState } from 'react'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { Spinner } from '@/components/ui'

export function EmailVerificationBanner() {
  const { supabase, session } = useSupabase()
  const [dismissed,     setDismissed]     = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendSent,    setResendSent]    = useState(false)

  if (!session || session.user.email_confirmed_at || dismissed) return null

  const handleResend = async () => {
    setResendLoading(true)
    await supabase.auth.resend({ type: 'signup', email: session.user.email! })
    setResendSent(true)
    setResendLoading(false)
    setTimeout(() => setResendSent(false), 8000)
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
            <span className="text-xs text-green-600 font-medium">✓ Email resent!</span>
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
