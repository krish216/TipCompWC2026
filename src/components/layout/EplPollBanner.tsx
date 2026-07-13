'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '@/components/layout/SupabaseProvider'

// App-wide EPL interest poll — shown only to signed-in users who haven't responded via any
// channel (the email one-click links or a prior in-app answer). One tap, dismissible, never
// nags again (localStorage + server state). Records via /api/epl-poll (source='app').
const DISMISS_KEY = 'eplPoll2627Dismissed'

export function EplPollBanner() {
  const { session } = useSupabase()
  const [show, setShow] = useState(false)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!session?.user?.id) { setShow(false); return }
    if (typeof window !== 'undefined' && localStorage.getItem(DISMISS_KEY)) return
    fetch('/api/epl-poll')
      .then(r => r.json())
      .then(d => { if (!d.responded) setShow(true) })
      .catch(() => {})
  }, [session?.user?.id])

  if (!session || !show) return null

  const answer = async (response: string) => {
    setBusy(true)
    const res = await fetch('/api/epl-poll', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ response }),
    }).catch(() => null)
    setBusy(false)
    if (res?.ok) {
      try { localStorage.setItem(DISMISS_KEY, '1') } catch {}
      setDone(true)
      setTimeout(() => setShow(false), 2600)
    }
  }

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch {}
    setShow(false)
  }

  return (
    <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2.5">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-3 flex-wrap">
        {done ? (
          <p className="text-sm text-emerald-800 font-medium">🎉 Thanks — we’ve noted your interest in the English Premier League 2026/27.</p>
        ) : (
          <>
            <p className="text-sm text-emerald-900 font-semibold">🔜 Playing the English Premier League 2026/27?</p>
            <div className="flex items-center gap-2 shrink-0">
              <button disabled={busy} onClick={() => answer('yes')}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50">Yes, I’m in</button>
              <button disabled={busy} onClick={() => answer('maybe')}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50">Maybe</button>
              <button disabled={busy} onClick={() => answer('no')}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50">Not for me</button>
              <button onClick={dismiss} aria-label="Dismiss"
                className="text-emerald-400 hover:text-emerald-600 text-xl leading-none ml-1">×</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
