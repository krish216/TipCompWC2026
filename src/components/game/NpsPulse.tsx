'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { clsx } from 'clsx'
import { TRUSTPILOT_REVIEW_URL, isPromoter } from '@/lib/trustpilot'

// In-app NPS pulse — a small dismissible card for signed-in users who haven't
// responded yet. Identified (session) + confidential, lands in the same
// nps_responses table as the email flow. Shows when the survey is live for
// everyone (app_settings.nps_pulse_live = 'on', toggled in /admin/pulse) OR to
// admins always (preview).
const DISMISS_KEY = 'tribepicks_nps_dismissed_wc2026'

export function NpsPulse() {
  const pathname = usePathname()
  const [show, setShow] = useState(false)
  const [score, setScore] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const hidden = !pathname || pathname.startsWith('/r/') || pathname.startsWith('/admin') || pathname.startsWith('/login')

  useEffect(() => {
    if (hidden) return
    try { if (localStorage.getItem(DISMISS_KEY) === '1') return } catch {}
    // Show when live for everyone, or always to admins (preview) — and only to
    // signed-in users who haven't responded.
    Promise.all([
      fetch('/api/admin').then(r => r.json()).catch(() => ({})),
      fetch('/api/survey/respond').then(r => r.json()).catch(() => ({})),
    ]).then(([a, s]) => {
      if ((s?.live || a?.is_admin) && s?.logged_in && !s?.responded) setShow(true)
    })
  }, [hidden])

  const dismiss = () => { try { localStorage.setItem(DISMISS_KEY, '1') } catch {} ; setShow(false) }

  const submit = async () => {
    if (score == null) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/survey/respond', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, comment: comment.trim() || undefined }),
      })
      if (res.ok) {
        setDone(true)
        try { localStorage.setItem(DISMISS_KEY, '1') } catch {}
        // Promoters get the review CTA — keep the card up so they can tap it.
        if (!isPromoter(score)) setTimeout(() => setShow(false), 1800)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!show || hidden) return null

  return (
    <div className="fixed z-40 left-1/2 -translate-x-1/2 bottom-[calc(4rem+env(safe-area-inset-bottom))] sm:bottom-4 w-[calc(100%-2rem)] max-w-sm">
      <div className="rounded-2xl border border-gray-200 bg-white shadow-xl p-4">
        {done ? (
          <div className="text-center py-1 space-y-2">
            <p className="text-sm font-bold text-emerald-800">🙏 Thanks for the feedback!</p>
            {isPromoter(score) && (
              <>
                <a href={TRUSTPILOT_REVIEW_URL} target="_blank" rel="noopener noreferrer"
                  className="block px-3 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white">⭐ Leave a Trustpilot review →</a>
                <button onClick={() => setShow(false)} className="text-[11px] text-gray-400 hover:text-gray-600">Close</button>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-sm font-bold text-gray-900">How likely are you to recommend TribePicks?</p>
              <button onClick={dismiss} className="text-gray-400 hover:text-gray-600 text-sm leading-none px-1" aria-label="Dismiss">✕</button>
            </div>
            <div className="grid grid-cols-11 gap-0.5">
              {Array.from({ length: 11 }, (_, n) => (
                <button key={n} onClick={() => setScore(n)}
                  className={clsx('h-7 rounded text-[11px] font-bold border transition-colors',
                    score === n
                      ? n <= 6 ? 'bg-red-500 border-red-500 text-white' : n <= 8 ? 'bg-amber-500 border-amber-500 text-white' : 'bg-emerald-600 border-emerald-600 text-white'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400')}>
                  {n}
                </button>
              ))}
            </div>
            {score != null && (
              <>
                <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Main reason? (optional)"
                  className="mt-2 w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                <button onClick={submit} disabled={submitting}
                  className="mt-2 w-full py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50">
                  {submitting ? 'Sending…' : 'Send'}
                </button>
              </>
            )}
            <p className="text-[10px] text-gray-400 text-center mt-1.5">🔒 Confidential</p>
          </>
        )}
      </div>
    </div>
  )
}
