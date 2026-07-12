'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { Spinner } from '@/components/ui'

// Join an OPEN comp from its public detail page. Mirrors the Explore join flow: needs a
// session (bounces to login otherwise), posts to /api/comps/join, then lands on home.
export function JoinCompButton({ compId, compName, isFull }: { compId: string; compName: string; isFull?: boolean }) {
  const router = useRouter()
  const { session } = useSupabase()
  const [joining, setJoining] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const join = async () => {
    if (!session) { router.push(`/login?redirect=/c`); return }
    setJoining(true); setErr(null)
    const res = await fetch('/api/comps/join', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comp_id: compId }),
    })
    const data = await res.json().catch(() => ({}))
    setJoining(false)
    if (!res.ok) { setErr(data.error ?? 'Failed to join'); return }
    router.push(`/?joined=${encodeURIComponent(compName)}&comp_id=${compId}`)
  }

  return (
    <div>
      <button onClick={join} disabled={isFull || joining}
        className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-colors
          ${isFull ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-sky-600 hover:bg-sky-700 text-white'}`}>
        {joining ? <Spinner className="w-4 h-4 text-white" /> : isFull ? 'Comp full' : 'Join this comp →'}
      </button>
      {err && <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{err}</p>}
    </div>
  )
}
