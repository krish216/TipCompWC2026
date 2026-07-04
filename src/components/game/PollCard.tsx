'use client'

import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { linkify } from '@/lib/linkify'

interface Poll {
  id: string; topic: string; question: string; description: string | null; options: string[]
  ends_at: string | null; my_vote: number | null; tallies: number[]; total: number
}

// Homepage "quick poll" card. Shows the most recent active poll the signed-in user
// hasn't dismissed; vote inline, then see live results. Dismiss is per-poll.
export function PollCard({ className }: { className?: string }) {
  const { session } = useSupabase()
  const [poll, setPoll]     = useState<Poll | null>(null)
  const [busy, setBusy]     = useState(false)
  const [dismissed, setDismissed] = useState<string[]>([])

  useEffect(() => {
    try { setDismissed(JSON.parse(localStorage.getItem('dismissed_polls') || '[]')) } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (!session) { setPoll(null); return }
    fetch('/api/polls').then(r => r.json())
      .then(d => {
        const list = (d?.polls ?? []) as Poll[]
        const next = list.find(p => !dismissed.includes(p.id)) ?? null
        setPoll(next)
      })
      .catch(() => setPoll(null))
  }, [session, dismissed])

  if (!poll) return null

  const voted = poll.my_vote != null
  const dismiss = () => {
    const next = [...dismissed, poll.id]
    setDismissed(next)
    try { localStorage.setItem('dismissed_polls', JSON.stringify(next.slice(-50))) } catch { /* ignore */ }
    setPoll(null)
  }

  const vote = async (idx: number) => {
    if (busy || idx === poll.my_vote) return
    setBusy(true)
    try {
      const res = await fetch('/api/polls', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poll_id: poll.id, option_idx: idx }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) setPoll({ ...poll, my_vote: d.my_vote, tallies: d.tallies, total: d.total })
    } finally { setBusy(false) }
  }

  const pct = (n: number) => (poll.total ? Math.round((n / poll.total) * 100) : 0)

  return (
    <div className={clsx('rounded-xl border border-violet-200 bg-violet-50/70 px-4 py-3.5', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-violet-500">📊 Quick poll</p>
          <p className="text-sm font-bold text-violet-950 mt-0.5 leading-snug">{poll.question}</p>
          {poll.description && (
            <p className="text-xs text-violet-700/90 mt-1 leading-relaxed whitespace-pre-line break-words [&_a]:underline [&_a]:font-semibold">{linkify(poll.description)}</p>
          )}
        </div>
        <button onClick={dismiss} aria-label="Dismiss" className="text-violet-300 hover:text-violet-500 text-lg leading-none flex-shrink-0 px-1">×</button>
      </div>

      <div className="mt-3 space-y-1.5">
        {poll.options.map((opt, i) => {
          const isMine = poll.my_vote === i
          const share = pct(poll.tallies[i] ?? 0)
          return (
            <button key={i} onClick={() => vote(i)} disabled={busy}
              className={clsx(
                'relative w-full text-left rounded-lg border px-3 py-2 text-sm font-semibold overflow-hidden transition-colors',
                voted ? 'border-violet-200 bg-white' : 'border-violet-200 bg-white hover:bg-violet-100 active:scale-[0.99]',
                isMine && 'ring-2 ring-violet-400',
              )}>
              {voted && <span className="absolute inset-y-0 left-0 bg-violet-200/70" style={{ width: `${share}%` }} aria-hidden />}
              <span className="relative flex items-center justify-between gap-2">
                <span className={clsx('truncate', isMine ? 'text-violet-900' : 'text-gray-700')}>{isMine ? '✓ ' : ''}{opt}</span>
                {voted && <span className="text-xs font-bold text-violet-700 tabular-nums flex-shrink-0">{share}%</span>}
              </span>
            </button>
          )
        })}
      </div>

      <p className="text-[11px] text-violet-500 mt-2">
        {voted ? `${poll.total} vote${poll.total === 1 ? '' : 's'} · tap another to change` : 'Tap to vote — see how everyone answered'}
      </p>
    </div>
  )
}
