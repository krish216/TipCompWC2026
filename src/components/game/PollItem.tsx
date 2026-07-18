'use client'

import { useState } from 'react'
import { clsx } from 'clsx'
import { linkify } from '@/lib/linkify'

export interface Poll {
  id: string; topic: string; question: string; description: string | null; options: string[]
  ends_at: string | null; my_vote: number | null; tallies: number[]; total: number
  kind?: 'single' | 'multi' | 'rank' | 'text'   // multi → pick up to N; rank → order; text → open answer
  max_select?: number | null            // multi polls: max options a user may pick
  my_ranking?: number[] | null          // multi = chosen option indices; rank = order (best-first)
  rank_avg?: (number | null)[] | null   // rank polls: mean 1-based position per option (lower = better)
  note?: string | null                  // the user's free-text note (e.g. their 'Other' cause)
  tournament_id?: string | null         // contextual tournament (comp/tournament polls); null = 'all'
}

// A poll renderer: dispatches to the single-choice or the ranked variant. Shared by the
// homepage PollCard (one at a time, dismissible) and the /polls landing page (stacked).
// Give it a key={poll.id} at the call site so switching polls re-seeds internal state.
// onAnswered fires after a successful submit/vote — the /polls survey page uses it to
// advance a progress bar and scroll to the next unanswered question.
type PollProps = { poll: Poll; className?: string; onDismiss?: () => void; onAnswered?: () => void }

export function PollItem(props: PollProps) {
  if (props.poll.kind === 'rank') return <RankPoll {...props} />
  if (props.poll.kind === 'multi') return <MultiPoll {...props} />
  if (props.poll.kind === 'text') return <TextPoll {...props} />
  return <SinglePoll {...props} />
}

// Open free-text poll: a single textarea, submit, then a quiet thank-you. Responses aren't
// shown back (they're not aggregatable) — this just captures the "anything else?" catch-all.
function TextPoll({ poll, className, onAnswered }: PollProps) {
  const [note, setNote] = useState(poll.note ?? '')
  const [submitted, setSubmitted] = useState(!!(poll.note && poll.note.trim()))
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy || !note.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/polls', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poll_id: poll.id, note: note.trim() }),
      })
      if (res.ok) { setSubmitted(true); onAnswered?.() }
    } finally { setBusy(false) }
  }

  return (
    <div className={clsx('rounded-xl border border-violet-200 bg-violet-50/70 px-4 py-3.5', className)}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-violet-500">💬 Open answer</p>
      <p className="text-sm font-bold text-violet-950 mt-0.5 leading-snug">{poll.question}</p>
      {poll.description && (
        <p className="text-xs text-violet-700/90 mt-1 leading-relaxed whitespace-pre-line break-words">{poll.description}</p>
      )}
      <textarea
        value={note} onChange={e => { setNote(e.target.value); setSubmitted(false) }} maxLength={1000} rows={3}
        placeholder="Type your thoughts…"
        className="mt-2.5 w-full resize-y rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-violet-400 focus:outline-none"
      />
      <button type="button" onClick={submit} disabled={busy || !note.trim()}
        className="mt-2 w-full rounded-lg bg-violet-600 px-3 py-2 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50">
        {submitted ? 'Saved ✓ — update' : 'Send →'}
      </button>
      {submitted && <p className="mt-2 text-[11px] text-violet-500">Thanks — we read every one. 🙌</p>}
    </div>
  )
}

// Single-choice poll: question + options, vote inline, live results.
function SinglePoll({ poll: initial, className, onDismiss, onAnswered }: PollProps) {
  const [poll, setPoll] = useState<Poll>(initial)
  const [busy, setBusy] = useState(false)

  const voted = poll.my_vote != null
  const pct = (n: number) => (poll.total ? Math.round((n / poll.total) * 100) : 0)

  const vote = async (idx: number) => {
    if (busy || idx === poll.my_vote) return
    setBusy(true)
    try {
      const res = await fetch('/api/polls', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poll_id: poll.id, option_idx: idx }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { setPoll({ ...poll, my_vote: d.my_vote, tallies: d.tallies, total: d.total }); onAnswered?.() }
    } finally { setBusy(false) }
  }

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
        {onDismiss && (
          <button onClick={onDismiss} aria-label="Dismiss" className="text-violet-300 hover:text-violet-500 text-lg leading-none flex-shrink-0 px-1">×</button>
        )}
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

// Multi-select poll: pick up to `max_select` options, submit, then see the crowd's share
// (each option's % is out of respondents, so shares can sum past 100%).
function MultiPoll({ poll, className, onDismiss, onAnswered }: PollProps) {
  // Uncapped (no max_select, or a cap ≥ the option count) → "select all that apply".
  const capped = !!(poll.max_select && poll.max_select > 0 && poll.max_select < poll.options.length)
  const max = capped ? (poll.max_select as number) : poll.options.length
  const [selected, setSelected] = useState<number[]>(poll.my_ranking ?? [])
  const [note, setNote] = useState(poll.note ?? '')
  const [submitted, setSubmitted] = useState(poll.my_ranking != null)
  const [tallies, setTallies] = useState<number[]>(poll.tallies ?? [])
  const [total, setTotal] = useState(poll.total)
  const [busy, setBusy] = useState(false)

  // Show a free-text box when the option list has a "Something else" catch-all.
  const hasOther = poll.options.some(o => /something else/i.test(o))

  const atCap = selected.length >= max
  const toggle = (i: number) => {
    setSelected(prev => prev.includes(i) ? prev.filter(x => x !== i) : (prev.length < max ? [...prev, i] : prev))
    setSubmitted(false)   // selection changed → let them re-submit
  }

  const submit = async () => {
    if (busy || !selected.length) return
    setBusy(true)
    try {
      const res = await fetch('/api/polls', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poll_id: poll.id, choices: selected, note: hasOther ? (note.trim() || undefined) : undefined }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { setTallies(d.tallies ?? tallies); setTotal(d.total ?? total); setSubmitted(true); onAnswered?.() }
    } finally { setBusy(false) }
  }

  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0)
  const resultOrder = poll.options.map((_, i) => i).sort((a, b) => (tallies[b] ?? 0) - (tallies[a] ?? 0))

  return (
    <div className={clsx('rounded-xl border border-violet-200 bg-violet-50/70 px-4 py-3.5', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-violet-500">📊 {capped ? `Pick up to ${max}` : 'Select all that apply'}</p>
          <p className="text-sm font-bold text-violet-950 mt-0.5 leading-snug">{poll.question}</p>
          {poll.description && (
            <p className="text-xs text-violet-700/90 mt-1 leading-relaxed whitespace-pre-line break-words">{poll.description}</p>
          )}
        </div>
        {onDismiss && (
          <button onClick={onDismiss} aria-label="Dismiss" className="text-violet-300 hover:text-violet-500 text-lg leading-none flex-shrink-0 px-1">×</button>
        )}
      </div>

      {/* Selectable options (toggle up to `max`) */}
      <div className="mt-3 space-y-1.5">
        {poll.options.map((opt, i) => {
          const isMine = selected.includes(i)
          const disabled = busy || (!isMine && atCap)
          return (
            <button key={i} type="button" onClick={() => toggle(i)} disabled={disabled}
              className={clsx(
                'relative w-full text-left rounded-lg border px-3 py-2 text-sm font-semibold overflow-hidden transition-colors',
                isMine ? 'border-violet-400 bg-violet-100 ring-1 ring-violet-300' : 'border-violet-200 bg-white hover:bg-violet-100',
                disabled && !isMine && 'opacity-40 cursor-not-allowed',
              )}>
              <span className="flex items-center gap-2">
                <span className={clsx('flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border text-[10px]',
                  isMine ? 'border-violet-500 bg-violet-500 text-white' : 'border-violet-300 text-transparent')}>✓</span>
                <span className={clsx('truncate', isMine ? 'text-violet-900' : 'text-gray-700')}>{opt}</span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Free-text box for the "Something else" catch-all option */}
      {hasOther && (
        <input
          type="text" value={note} onChange={e => setNote(e.target.value)} maxLength={280}
          placeholder="Something else? Name it…"
          className="mt-2.5 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-violet-400 focus:outline-none"
        />
      )}

      <button type="button" onClick={submit} disabled={busy || !selected.length}
        className="mt-2.5 w-full rounded-lg bg-violet-600 px-3 py-2 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50">
        {submitted ? 'Update my answers' : `Submit${selected.length ? ` (${selected.length}${capped ? `/${max}` : ''})` : ''} →`}
      </button>

      {/* Results — share of respondents who picked each option */}
      {submitted && total > 0 && (
        <div className="mt-3 border-t border-violet-100 pt-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-violet-500">What everyone picked</p>
          <div className="mt-2 space-y-1.5">
            {resultOrder.map(i => {
              const share = pct(tallies[i] ?? 0)
              const mine = selected.includes(i)
              return (
                <div key={i} className="relative overflow-hidden rounded-lg border border-violet-200 bg-white px-3 py-1.5">
                  <span className="absolute inset-y-0 left-0 bg-violet-200/70" style={{ width: `${share}%` }} aria-hidden />
                  <span className="relative flex items-center justify-between gap-2">
                    <span className={clsx('truncate text-sm', mine ? 'font-semibold text-violet-900' : 'text-gray-700')}>{mine ? '✓ ' : ''}{poll.options[i]}</span>
                    <span className="flex-shrink-0 text-xs font-bold text-violet-700 tabular-nums">{share}%</span>
                  </span>
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-[11px] text-violet-500">{total} {total === 1 ? 'person' : 'people'} answered · change anytime</p>
        </div>
      )}
    </div>
  )
}

// Ranked poll: order the options by importance (tap ▲▼ to move), optional free-text note,
// then submit. Results show the crowd's average rank per option (lower = more important).
function RankPoll({ poll, className, onAnswered }: PollProps) {
  const n = poll.options.length
  // Current order as a list of option indices. Seed from the user's saved ranking, else natural order.
  const seed = poll.my_ranking && poll.my_ranking.length === n ? poll.my_ranking : poll.options.map((_, i) => i)
  const [order, setOrder] = useState<number[]>(seed)
  const [note, setNote] = useState(poll.note ?? '')
  const [submitted, setSubmitted] = useState(poll.my_ranking != null)
  const [rankAvg, setRankAvg] = useState<(number | null)[] | null>(poll.rank_avg ?? null)
  const [total, setTotal] = useState(poll.total)
  const [busy, setBusy] = useState(false)

  const move = (pos: number, dir: -1 | 1) => {
    const to = pos + dir
    if (to < 0 || to >= n) return
    setOrder(prev => { const next = [...prev]; [next[pos], next[to]] = [next[to], next[pos]]; return next })
    setSubmitted(false)   // order changed → let them re-submit
  }

  const submit = async () => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/polls', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poll_id: poll.id, ranking: order, note: note.trim() || undefined }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { setRankAvg(d.rank_avg ?? null); setTotal(d.total ?? total); setSubmitted(true); onAnswered?.() }
    } finally { setBusy(false) }
  }

  // Options sorted by crowd average rank (nulls last) — for the results view.
  const resultOrder = rankAvg
    ? poll.options.map((_, i) => i).sort((a, b) => (rankAvg[a] ?? 99) - (rankAvg[b] ?? 99))
    : []

  return (
    <div className={clsx('rounded-xl border border-violet-200 bg-violet-50/70 px-4 py-3.5', className)}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-violet-500">📊 Rank these</p>
      <p className="text-sm font-bold text-violet-950 mt-0.5 leading-snug">{poll.question}</p>
      {poll.description && (
        <p className="text-xs text-violet-700/90 mt-1 leading-relaxed whitespace-pre-line break-words">{poll.description}</p>
      )}

      {/* Reorderable list — your current order (1 = most important) */}
      <ol className="mt-3 space-y-1.5">
        {order.map((optIdx, pos) => (
          <li key={optIdx} className="flex items-center gap-2 rounded-lg border border-violet-200 bg-white px-2.5 py-2">
            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-violet-600 text-[11px] font-bold text-white tabular-nums">{pos + 1}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-700">{poll.options[optIdx]}</span>
            <span className="flex flex-shrink-0 flex-col">
              <button type="button" onClick={() => move(pos, -1)} disabled={pos === 0 || busy}
                aria-label="Move up" className="px-1 text-violet-400 hover:text-violet-700 disabled:opacity-25 leading-none text-[11px]">▲</button>
              <button type="button" onClick={() => move(pos, 1)} disabled={pos === n - 1 || busy}
                aria-label="Move down" className="px-1 text-violet-400 hover:text-violet-700 disabled:opacity-25 leading-none text-[11px]">▼</button>
            </span>
          </li>
        ))}
      </ol>

      {/* Optional free-text note (e.g. their 'Other' cause) */}
      <input
        type="text" value={note} onChange={e => setNote(e.target.value)} maxLength={280}
        placeholder="Something else? Name the cause…"
        className="mt-2.5 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-violet-400 focus:outline-none"
      />

      <button type="button" onClick={submit} disabled={busy}
        className="mt-2.5 w-full rounded-lg bg-violet-600 px-3 py-2 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-60">
        {submitted ? 'Update my ranking' : 'Submit ranking →'}
      </button>

      {/* Results — the crowd's average rank per option */}
      {submitted && rankAvg && total > 0 && (
        <div className="mt-3 border-t border-violet-100 pt-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-violet-500">How everyone ranked it</p>
          <div className="mt-2 space-y-1.5">
            {resultOrder.map((optIdx, i) => {
              const avg = rankAvg[optIdx]
              const share = avg != null ? ((n - avg + 1) / n) * 100 : 0   // better avg → longer bar
              return (
                <div key={optIdx} className="relative overflow-hidden rounded-lg border border-violet-200 bg-white px-3 py-1.5">
                  <span className="absolute inset-y-0 left-0 bg-violet-200/70" style={{ width: `${share}%` }} aria-hidden />
                  <span className="relative flex items-center justify-between gap-2">
                    <span className="truncate text-sm text-gray-700"><span className="font-bold text-violet-700">{i + 1}.</span> {poll.options[optIdx]}</span>
                    {avg != null && <span className="flex-shrink-0 text-xs font-bold text-violet-700 tabular-nums">avg {avg.toFixed(1)}</span>}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-[11px] text-violet-500">{total} {total === 1 ? 'person' : 'people'} ranked · reorder and update anytime</p>
        </div>
      )}
    </div>
  )
}
