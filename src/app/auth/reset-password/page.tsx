'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { Spinner } from '@/components/ui'

type Stage = 'loading' | 'form' | 'success' | 'error'

export default function ResetPasswordPage() {
  const { supabase } = useSupabase()
  const router = useRouter()

  const [stage,    setStage]    = useState<Stage>('loading')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  // Supabase puts the session tokens in the URL hash when redirecting back.
  // The @supabase/ssr listener picks them up automatically — we just need
  // to wait for the session to be established before showing the form.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setStage('form')
      } else if (event === 'SIGNED_IN') {
        // Already handled by PASSWORD_RECOVERY — ignore
      }
    })

    // Also check if we already have a session from the URL hash
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setStage('form')
      else {
        // Give the hash a moment to be processed
        setTimeout(() => {
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) setStage('form')
            else setStage('error')
          })
        }, 1500)
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters'); return
    }
    if (password !== confirm) {
      setError('Passwords do not match'); return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError(error.message)
    } else {
      setStage('success')
      setTimeout(() => router.push('/predict'), 2500)
    }
  }

  if (stage === 'loading') return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <Spinner className="w-8 h-8 mx-auto mb-3" />
        <p className="text-sm text-gray-500">Verifying reset link…</p>
      </div>
    </div>
  )

  if (stage === 'error') return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h1 className="text-lg font-semibold text-gray-900 mb-2">Reset link expired</h1>
        <p className="text-sm text-gray-500 mb-6">
          This password reset link has expired or already been used.
          Reset links are valid for 1 hour.
        </p>
        <a href="/login"
          className="inline-block px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors">
          Request a new link
        </a>
      </div>
    </div>
  )

  if (stage === 'success') return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center">
        <div className="text-4xl mb-4">✅</div>
        <h1 className="text-lg font-semibold text-gray-900 mb-2">Password updated</h1>
        <p className="text-sm text-gray-500">
          Your password has been changed. Redirecting you to the app…
        </p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="max-w-sm w-full">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🔑</div>
          <h1 className="text-xl font-semibold text-gray-900">Set new password</h1>
          <p className="text-sm text-gray-500 mt-1">Choose a strong password for your account</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              New password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Confirm new password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repeat your new password"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
            />
          </div>

          {/* Password strength indicator */}
          {password.length > 0 && (
            <div>
              <div className="flex gap-1 mb-1">
                {[1,2,3,4].map(i => (
                  <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
                    password.length >= i * 3
                      ? i <= 2 ? 'bg-red-400' : i === 3 ? 'bg-amber-400' : 'bg-green-500'
                      : 'bg-gray-200'
                  }`} />
                ))}
              </div>
              <p className="text-[10px] text-gray-400">
                {password.length < 8 ? 'Too short' : password.length < 10 ? 'Weak' : password.length < 12 ? 'Good' : 'Strong'}
              </p>
            </div>
          )}

          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || password.length < 8 || password !== confirm}
            className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            {loading && <Spinner className="w-4 h-4 text-white" />}
            Update password
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-4">
          Remember your password?{' '}
          <a href="/login" className="text-green-600 hover:text-green-700 font-medium">
            Sign in
          </a>
        </p>
      </div>
    </div>
  )
}
