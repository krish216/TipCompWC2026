'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { clsx } from 'clsx'

// One-tap NPS landing page reached from the email links (/r/<token>?s=<score>).
// The clicked score is recorded immediately; the visitor can adjust it and add a
// reason. Identity comes from the opaque token — never from the URL.
export default function SurveyRespondPage({ params }: { params: { token: string } }) {
  const token = params.token
  const sp = useSearchParams()
  const initial = (() => { const n = parseInt(sp.get('s') ?? ''); return Number.isInteger(n) && n >= 0 && n <= 10 ? n : null })()

  const [score, setScore]   = useState<number | null>(initial)
  const [comment, setComment] = useState('')
  const [done, setDone]     = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [recorded, setRecorded] = useState(false)

  // Capture the clicked score right away so it counts even without a comment.
  useEffect(() => {
    if (initial == null || recorded) return
    setRecorded(true)
    fetch('/api/survey/respond', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, score: initial }),
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial])

  const submit = async () => {
    if (score == null) { setError('Pick a score from 0 to 10.'); return }
    setSubmitting(true); setError(null)
    try {
      const res = await fetch('/api/survey/respond', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, score, comment: comment.trim() || undefined }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) setDone(true)
      else setError(d.error ?? 'Something went wrong — please try again.')
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const tone = (n: number) => n <= 6 ? 'detractor' : n <= 8 ? 'passive' : 'promoter'

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {done ? (
          <div className="px-6 py-10 text-center space-y-3">
            <div className="text-4xl">🙏</div>
            <p className="text-lg font-bold text-gray-900">Thanks for the feedback!</p>
            <p className="text-sm text-gray-500">It genuinely helps us make TribePicks better. We read every response.</p>
            <a href="/" className="inline-block mt-2 px-4 py-2 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white">Back to TribePicks →</a>
          </div>
        ) : (
          <div className="px-6 py-6 space-y-4">
            <div>
              <p className="text-base font-extrabold text-gray-900">How likely are you to recommend TribePicks to a mate?</p>
              <p className="text-xs text-gray-500 mt-1">0 = not at all · 10 = absolutely</p>
            </div>

            {/* 0–10 scale */}
            <div className="grid grid-cols-11 gap-1">
              {Array.from({ length: 11 }, (_, n) => {
                const sel = score === n
                const t = tone(n)
                return (
                  <button key={n} onClick={() => setScore(n)}
                    className={clsx(
                      'h-9 rounded-md text-xs font-bold border transition-colors',
                      sel
                        ? t === 'detractor' ? 'bg-red-500 border-red-500 text-white'
                          : t === 'passive' ? 'bg-amber-500 border-amber-500 text-white'
                          : 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
                    )}>
                    {n}
                  </button>
                )
              })}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">What's the main reason for your score? <span className="text-gray-400">(optional)</span></label>
              <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3}
                placeholder="The one thing we could do better…"
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button onClick={submit} disabled={submitting || score == null}
              className="w-full py-3 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition-colors">
              {submitting ? 'Sending…' : 'Send feedback'}
            </button>

            <p className="text-center text-[11px] text-gray-400">🔒 Your response is confidential — we use it to improve TribePicks and may follow up to help.</p>
          </div>
        )}
      </div>
    </div>
  )
}
