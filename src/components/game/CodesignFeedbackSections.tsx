'use client'

import { useEffect, useState } from 'react'
import { clsx } from 'clsx'

// The two feedback-enabled buckets on /epl/guide. Each item has a stable `key` (persisted
// with the feedback), an icon, a title and a blurb.
const NEW_FEATURES = [
  { key: 'matchweeks', icon: '🗓️', title: '38 weekly matchweeks', body: 'League format, no knockouts. Tip Home / Draw / Away on all 10 games each week — seconds to play.' },
  { key: 'tiered-scoring', icon: '📈', title: 'Tiered scoring (1→4)', body: 'Correct tips are worth more as the season runs: 1pt (MW1–9), 2pt (MW10–19), 3pt (MW20–28), 4pt (MW29–38). A slow start is never fatal.' },
  { key: 'focus-pick', icon: '⭐', title: 'Favourite-club focus pick', body: 'For your bonus club’s match, predict the exact score for bonus points — and it locks once you enter it.' },
  { key: 'table-predictor', icon: '🪜', title: 'Table Predictor (Top 5 & Bottom 3)', body: 'Call the top 5 and bottom 3 at four checkpoints — after MW9 / 19 / 28 / 38. Each quarter is scored on its own; join any quarter.' },
  { key: 'warm-up', icon: '🔥', title: 'Warm-up Round + Practice Mode', body: 'Try the whole thing risk-free before the season kicks off.' },
]

const OPEN = [
  { key: 'rewards-tools', icon: '🎁', title: 'Rewards & prize tools', body: 'Comp-Chiefs set the prizes for their own comps — so what prize & reward tools should we build for them?' },
  { key: 'engagement', icon: '💬', title: 'Tribe & engagement', body: 'Chat, rivalries, reminders — what keeps people tipping week to week?' },
  { key: 'feature-priorities', icon: '🧭', title: 'Feature priorities', body: 'Of everything we could build, what matters first?' },
  { key: 'giving', icon: '🐾', title: 'The giving angle', body: 'Which cause we back, and how it shows up in the game.' },
  { key: 'mini-leaderboards', icon: '🏁', title: 'Checkpoint mini-leaderboards', body: 'Worth adding fresh standings each quarter (MW9/19/28/38), or keep it season-long?' },
  { key: 'first-week', icon: '🚪', title: 'The first-week experience', body: 'Onboarding, the warm-up, joining a comp — where does it snag?' },
]

const REACTIONS: { value: string; label: string }[] = [
  { value: 'love', label: '🔥 Love it' },
  { value: 'good', label: '👍 Good' },
  { value: 'needs_work', label: '🤔 Needs work' },
]

type FB = { reaction: string | null; comment: string | null }
type Item = { key: string; icon: string; title: string; body: string }

export function CodesignFeedbackSections() {
  const [fb, setFb] = useState<Record<string, FB>>({})

  useEffect(() => {
    fetch('/api/codesign-feedback').then(r => r.json())
      .then(d => setFb(d.feedback ?? {}))
      .catch(() => {})
  }, [])

  const onSaved = (key: string, v: FB) => setFb(prev => ({ ...prev, [key]: v }))

  return (
    <>
      {/* 2 — New with EPL */}
      <section className="mt-9">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-black text-gray-900">🆕 New with EPL</h2>
          <span className="text-xs text-gray-400">— rolled out for the Premier League</span>
        </div>
        <p className="mt-1 text-sm text-gray-600">Fresh for the EPL season. Give these a spin in the warm-up — <strong className="font-semibold text-gray-700">we want your feedback on each one.</strong></p>
        <div className="mt-4 grid gap-2.5">
          {NEW_FEATURES.map(it => (
            <ItemCard key={it.key} item={it} accent="emerald" allowReaction value={fb[it.key]} onSaved={v => onSaved(it.key, v)} />
          ))}
        </div>
      </section>

      {/* 3 — Your call */}
      <section className="mt-9 rounded-2xl border-2 border-purple-300 bg-purple-50 px-5 py-6 sm:px-7">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-black text-purple-900">🙌 Your call</h2>
          <span className="text-xs text-purple-500">— genuinely open, you steer this</span>
        </div>
        <p className="mt-1 text-sm text-purple-800">Nothing here is decided. Drop your take on each — this is what we need the crew on.</p>
        <div className="mt-4 grid gap-2.5">
          {OPEN.map(it => (
            <ItemCard key={it.key} item={it} accent="purple" allowReaction={false} value={fb[it.key]} onSaved={v => onSaved(it.key, v)} />
          ))}
        </div>
      </section>
    </>
  )
}

function ItemCard({ item, accent, allowReaction, value, onSaved }: {
  item: Item; accent: 'emerald' | 'purple'; allowReaction: boolean
  value: FB | undefined; onSaved: (v: FB) => void
}) {
  const [open, setOpen] = useState(false)
  const [reaction, setReaction] = useState<string | null>(value?.reaction ?? null)
  const [comment, setComment] = useState(value?.comment ?? '')
  const [busy, setBusy] = useState(false)

  // Sync local editor with the fetched value once it arrives.
  useEffect(() => { setReaction(value?.reaction ?? null); setComment(value?.comment ?? '') }, [value?.reaction, value?.comment])

  const A = accent === 'emerald'
    ? { card: 'border-emerald-200 bg-emerald-50/60', title: 'text-emerald-900', body: 'text-emerald-800/80', accentText: 'text-emerald-700', save: 'bg-emerald-600 hover:bg-emerald-700' }
    : { card: 'border-purple-200 bg-white', title: 'text-purple-900', body: 'text-purple-700/80', accentText: 'text-purple-700', save: 'bg-purple-600 hover:bg-purple-700' }

  const hasFeedback = !!(value?.reaction || value?.comment)
  const reactionLabel = REACTIONS.find(r => r.value === value?.reaction)?.label

  const save = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/codesign-feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_key: item.key, reaction: allowReaction ? reaction : null, comment: comment.trim() || null }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { onSaved({ reaction: d.reaction ?? null, comment: d.comment ?? null }); setOpen(false) }
    } finally { setBusy(false) }
  }

  return (
    <div className={clsx('rounded-xl border px-4 py-3', A.card)}>
      <div className="flex gap-3">
        <span className="text-xl flex-shrink-0" aria-hidden>{item.icon}</span>
        <span className="min-w-0">
          <span className={clsx('block text-sm font-bold', A.title)}>{item.title}</span>
          <span className={clsx('block text-[13px] leading-snug mt-0.5', A.body)}>{item.body}</span>
        </span>
      </div>

      {open ? (
        <div className="mt-3 border-t border-black/5 pt-3">
          {allowReaction && (
            <div className="flex flex-wrap gap-1.5">
              {REACTIONS.map(r => (
                <button key={r.value} type="button" onClick={() => setReaction(reaction === r.value ? null : r.value)}
                  className={clsx('rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors',
                    reaction === r.value ? 'border-gray-800 bg-gray-800 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50')}>
                  {r.label}
                </button>
              ))}
            </div>
          )}
          <textarea value={comment} onChange={e => setComment(e.target.value)} maxLength={1000} rows={2}
            placeholder={allowReaction ? 'What works, what doesn’t? (optional)' : 'Your take…'}
            className="mt-2 w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none" />
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={save} disabled={busy || (!comment.trim() && !reaction)}
              className={clsx('rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40', A.save)}>Save</button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100">Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)}
          className={clsx('mt-2 inline-flex items-center gap-1.5 text-xs font-semibold', A.accentText)}>
          {hasFeedback
            ? <>✓ Your feedback{reactionLabel ? ` · ${reactionLabel}` : ''} · <span className="underline">edit</span></>
            : <>💬 Give feedback →</>}
        </button>
      )}
    </div>
  )
}
