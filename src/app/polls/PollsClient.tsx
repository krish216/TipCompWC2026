'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { clsx } from 'clsx'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { PollItem, type Poll } from '@/components/game/PollItem'
import { Spinner } from '@/components/ui'

// Has the signed-in user already answered this poll?
function isAnswered(p: Poll): boolean {
  if (p.kind === 'multi' || p.kind === 'rank') return Array.isArray(p.my_ranking) && p.my_ranking.length > 0
  if (p.kind === 'text') return !!(p.note && p.note.trim())
  return p.my_vote != null
}

export function PollsClient({ topic, pollId }: { topic: string | null; pollId: string | null }) {
  const { session } = useSupabase()
  const [polls, setPolls] = useState<Poll[] | null>(null)
  const [answered, setAnswered] = useState<Set<string>>(new Set())
  const [current, setCurrent] = useState(0)       // anchored question index (Back/Next/answer only)

  useEffect(() => {
    if (!session) { setPolls([]); return }
    fetch('/api/polls').then(r => r.json())
      .then(d => {
        let list = (d?.polls ?? []) as Poll[]
        if (pollId)      list = list.filter(p => p.id === pollId)
        else if (topic) {
          // Comma-separated topics let one link show a segment poll + shared polls
          // (e.g. ?topic=wrapup-drift,wrapup-general). Order is preserved from the API.
          const topics = topic.split(',').map(t => t.trim()).filter(Boolean)
          list = list.filter(p => topics.includes(p.topic))
        }
        setPolls(list)
        setAnswered(new Set(list.filter(isAnswered).map(p => p.id)))
        setCurrent(0)
      })
      .catch(() => setPolls([]))
  }, [session, topic, pollId])

  // Highlight the active pill = the last question whose top has scrolled into the upper ~40%
  // of the viewport. This is only a highlight; navigation is by absolute pill taps, so it
  // works even if the highlight is momentarily off.
  useEffect(() => {
    if (!polls || polls.length < 2) return
    let raf = 0
    const compute = () => {
      raf = 0
      const line = window.innerHeight * 0.4
      let idx = 0
      for (let i = 0; i < polls.length; i++) {
        const el = document.querySelector<HTMLElement>(`[data-poll-id="${CSS.escape(polls[i].id)}"]`)
        if (el && el.getBoundingClientRect().top <= line) idx = i
      }
      setCurrent(idx)
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(compute) }
    compute()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [polls])

  const loading = polls === null && !!session

  // Scroll a question to the top, offset to clear the sticky progress bar. Manual window.scrollTo
  // (not scrollIntoView) so it lands deterministically even for the first question under the header.
  const scrollToPoll = (id: string) => {
    // Query the DOM directly (not a React ref) so this never misses due to ref-reattach timing.
    const el = document.querySelector<HTMLElement>(`[data-poll-id="${CSS.escape(id)}"]`)
    if (!el) return
    // The first question sits under the page header — scroll to the very top for it. Others
    // scroll to their own top, offset to clear the sticky progress bar.
    const isFirst = !!polls && polls[0]?.id === id
    const y = isFirst ? 0 : el.getBoundingClientRect().top + window.scrollY - 72
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' })
  }

  // Mark a poll answered; on its FIRST answer, auto-scroll to the next unanswered question.
  const handleAnswered = (id: string) => {
    const firstTime = !answered.has(id)
    setAnswered(prev => { const next = new Set(prev); next.add(id); return next })
    if (firstTime && polls) {
      const idx = polls.findIndex(p => p.id === id)
      const target = polls.find((p, i) => i > idx && !answered.has(p.id))
      if (target) setTimeout(() => scrollToPoll(target.id), 350)
    }
  }

  const total = polls?.length ?? 0
  const done = answered.size
  const showNav = !loading && !!session && total > 1 && !pollId   // survey view only
  const complete = total > 0 && done >= total

  return (
    <div className="max-w-md mx-auto px-4 pt-8 pb-8">
      {showNav && (
        <div className="sticky top-0 z-20 -mx-4 -mt-8 mb-5 border-b border-gray-100 bg-white/95 px-4 pb-2.5 pt-3 backdrop-blur">
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold">
            <span className={complete ? 'text-violet-600' : 'text-gray-500'}>{complete ? 'All done — thank you! 🎉' : 'Your feedback'}</span>
            <span className="tabular-nums text-gray-400">{done} / {total} answered</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-violet-500 transition-all duration-500" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      <h1 className="text-xl font-black text-gray-900">A few quick questions 👇</h1>
      <p className="text-sm text-gray-500 mt-1 mb-5">One tap each — your answers shape what we build next. Thanks for the two minutes.</p>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner className="w-7 h-7" /></div>
      ) : !session ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
          <p className="text-sm text-gray-600 mb-3">Sign in to answer.</p>
          {/* Carry the survey URL so login returns here (not the homepage) — password, magic-link and Google OAuth all honour ?redirect=. */}
          <Link
            href={`/login?redirect=${encodeURIComponent(pollId ? `/polls?id=${pollId}` : topic ? `/polls?topic=${topic}` : '/polls')}`}
            className="inline-block px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
          >Sign in →</Link>
        </div>
      ) : (polls && polls.length > 0) ? (
        <div className="space-y-4">
          {polls.map((p, i) => (
            <div key={p.id} data-poll-id={p.id} className="scroll-mt-20">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-violet-600 px-2 py-0.5 text-[11px] font-bold text-white tabular-nums">Q{i + 1}</span>
                {answered.has(p.id) && <span className="text-[11px] font-semibold text-violet-500">✓ answered</span>}
              </div>
              <PollItem poll={p} onAnswered={() => handleAnswered(p.id)} />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
          No active questions for you right now — thanks for stopping by!
        </div>
      )}

      <div className="mt-7 text-center">
        <Link href="/" className="text-sm text-gray-400 hover:text-gray-600">← Back to TribePicks</Link>
      </div>

      {/* Spacer so the fixed bottom nav never hides the last content */}
      {showNav && <div className="h-20" aria-hidden />}

      {/* Bottom nav — one pill per question; tap to jump straight there. Absolute navigation,
          so it never depends on tracking scroll. Sits above the app's mobile bottom nav. */}
      {showNav && polls && (
        <div className="fixed inset-x-0 z-30 border-t border-gray-200 bg-white/95 px-3 py-2.5 backdrop-blur bottom-[calc(3.5rem+env(safe-area-inset-bottom))] sm:bottom-0">
          <div className="mx-auto flex max-w-md items-center justify-center gap-1.5 overflow-x-auto">
            {polls.map((p, i) => {
              const isAns = answered.has(p.id)
              const isCur = i === current
              return (
                <button
                  key={p.id} type="button" onClick={() => scrollToPoll(p.id)}
                  aria-label={`Go to question ${i + 1}${isAns ? ' (answered)' : ''}`}
                  className={clsx(
                    'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors',
                    isCur ? 'bg-violet-600 text-white ring-2 ring-violet-300'
                      : isAns ? 'bg-violet-100 text-violet-700 hover:bg-violet-200'
                      : 'bg-gray-100 text-gray-400 hover:bg-gray-200',
                  )}
                >{isAns && !isCur ? '✓' : i + 1}</button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
