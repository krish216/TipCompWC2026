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

  const [phase,         setPhase]         = useState<Phase>('init')
  const [compName,      setCompName]      = useState<string | null>(null)
  const [compId,        setCompId]        = useState<string | null>(null)
  const [tribeAssigned, setTribeAssigned] = useState(false)
  const [errMsg,        setErrMsg]        = useState<string | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    if (!code) { setPhase('error'); setErrMsg('No invite code found in this link.'); return }

    if (!session) {
      // Redirect to login/register with code + email pre-filled.
      // `redirect` ensures that after sign-in the user is sent back to /join
      // to complete the auto-join (new-user registration uses emailRedirectTo
      // instead, which already points to /join?code=...).
      const qs = new URLSearchParams({ tab: 'register', code, redirect: `/join?code=${code}` })
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
      setCompId(comp.id)

      const { success, error: joinErr, tribe_assigned } = await fetch('/api/comp-admins/self-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comp_id: comp.id, invite_code: code }),
      }).then(r => r.json())

      // "Already a member" still counts as success
      if (!success && !joinErr?.toLowerCase().includes('already')) {
        setPhase('error'); setErrMsg(joinErr ?? 'Failed to join comp'); return
      }
      setTribeAssigned(!!tribe_assigned)
      setPhase('done')
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
        <div className="max-w-sm w-full">
          <div className="text-center mb-6">
            <div className="text-6xl mb-4">🎉</div>
            <h1 className="text-xl font-bold text-gray-900 mb-1">You're in!</h1>
            {compName && <p className="text-sm font-semibold text-green-700">{compName}</p>}
          </div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 text-center">What to do next</p>
          <div className="space-y-3">
            <Link href="/predict"
              className="flex items-center gap-3 px-4 py-3.5 bg-green-600 hover:bg-green-700 text-white rounded-xl transition-colors group">
              <span className="text-2xl flex-shrink-0">🎯</span>
              <div className="flex-1">
                <p className="text-sm font-bold">Start tipping</p>
                <p className="text-xs opacity-75">Make your match predictions now</p>
              </div>
              <span className="text-lg group-hover:translate-x-0.5 transition-transform">→</span>
            </Link>
            <Link href={`/?joined=${encodeURIComponent(compName ?? '')}&comp_id=${encodeURIComponent(compId ?? '')}`}
              className="flex items-center gap-3 px-4 py-3.5 bg-white border border-gray-200 hover:border-gray-300 text-gray-800 rounded-xl transition-colors group">
              <span className="text-2xl flex-shrink-0">⭐</span>
              <div className="flex-1">
                <p className="text-sm font-bold">Pick your Bonus Team</p>
                <p className="text-xs text-gray-500">2× points on their Group Stage matches</p>
              </div>
              <span className="text-lg text-gray-400 group-hover:translate-x-0.5 transition-transform">→</span>
            </Link>
          </div>
          {!tribeAssigned && (
            <p className="text-[11px] text-gray-400 text-center mt-5">Your tribe will be assigned by the comp manager.</p>
          )}
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
