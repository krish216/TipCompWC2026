'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { Spinner } from '@/components/ui'

type Phase = 'init' | 'joining' | 'done' | 'error'

function JoinInner() {
  const { session } = useSupabase()
  const router      = useRouter()
  const params      = useSearchParams()
  const code        = params.get('code')?.toUpperCase() ?? null
  const email       = params.get('email') ?? null

  const [phase,    setPhase]    = useState<Phase>('init')
  const [compName, setCompName] = useState<string | null>(null)
  const [errMsg,   setErrMsg]   = useState<string | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    if (!code) { setPhase('error'); setErrMsg('No invite code found in this link.'); return }

    if (!session) {
      // Redirect to register page with code + email pre-filled so the post-
      // verification emailRedirectTo can bring them back here to auto-join.
      const qs = new URLSearchParams({ tab: 'register', code })
      if (email) qs.set('email', email)
      router.replace(`/login?${qs.toString()}`)
      return
    }

    ran.current = true
    ;(async () => {
      setPhase('joining')

      const lookupRes = await fetch(`/api/comps?code=${code}`).then(r => r.json())
      if (lookupRes.error || !lookupRes.data) {
        setPhase('error')
        setErrMsg('This invite link is invalid or the comp no longer exists.')
        return
      }

      const comp = lookupRes.data
      setCompName(comp.name)

      const { success, error: joinErr } = await fetch('/api/comp-admins/self-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comp_id: comp.id, invite_code: code }),
      }).then(r => r.json())

      // "Already a member" still counts as success
      if (!success && !joinErr?.toLowerCase().includes('already')) {
        setPhase('error'); setErrMsg(joinErr ?? 'Failed to join comp'); return
      }
      setPhase('done')
      setTimeout(() => router.push('/'), 2000)
    })()
  }, [session, code, email])

  if (phase === 'init' || phase === 'joining') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Spinner className="w-8 h-8 mx-auto mb-4 text-green-600" />
          <p className="text-sm text-gray-500">
            {phase === 'joining' ? 'Joining your comp…' : 'Loading…'}
          </p>
        </div>
      </div>
    )
  }

  if (phase === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm w-full text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-xl font-bold text-gray-900 mb-1">You're in!</h1>
          {compName && (
            <p className="text-sm font-semibold text-green-700 mb-2">{compName}</p>
          )}
          <p className="text-sm text-gray-500">Taking you to your homepage…</p>
        </div>
      </div>
    )
  }

  // error
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-sm w-full text-center">
        <div className="text-5xl mb-4">🔗</div>
        <h1 className="text-lg font-bold text-gray-900 mb-2">Link didn't work</h1>
        <p className="text-sm text-gray-600 mb-6">{errMsg}</p>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-left mb-6">
          <p className="text-xs font-semibold text-gray-700 mb-2">Join manually instead:</p>
          <ol className="text-xs text-gray-600 space-y-1.5 list-decimal list-inside">
            <li>
              <Link href="/login" className="text-green-600 underline">Create a free account</Link> or sign in
            </li>
            <li>Tap <strong>Join a comp</strong> on the home screen</li>
            <li>Enter the invite code from your email</li>
          </ol>
        </div>
        <Link href="/" className="text-sm font-medium text-green-600 hover:text-green-700">
          Go to home →
        </Link>
      </div>
    </div>
  )
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinInner />
    </Suspense>
  )
}
