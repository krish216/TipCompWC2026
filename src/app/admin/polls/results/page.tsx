'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { clsx } from 'clsx'
import { Spinner } from '@/components/ui'
import { useSupabase } from '@/components/layout/SupabaseProvider'

interface PollResult {
  id: string; topic: string; question: string; active: boolean
  kind: 'single' | 'multi' | 'rank' | 'text'
  options: string[]; total: number
  tallies: number[]; rankAvg: (number | null)[]; notes: string[]
}

const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0)

// Horizontal bar for a single/multi option: label, count, and a proportional fill.
function OptionBar({ label, count, total }: { label: string; count: number; total: number }) {
  const p = pct(count, total)
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 flex-1 text-gray-800">{label}</span>
        <span className="shrink-0 tabular-nums text-gray-500">{count} · {p}%</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full bg-violet-500" style={{ width: `${p}%` }} />
      </div>
    </div>
  )
}

function PollCard({ p }: { p: PollResult }) {
  // Rank: order options best (lowest average rank) first.
  const rankOrder = useMemo(
    () => p.options.map((label, i) => ({ label, avg: p.rankAvg[i] }))
      .sort((a, b) => (a.avg ?? 99) - (b.avg ?? 99)),
    [p.options, p.rankAvg],
  )
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700">{p.topic}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{p.kind}</span>
        {!p.active && <span className="text-[11px] font-semibold text-gray-400">· closed</span>}
        <span className="ml-auto text-[11px] font-semibold text-gray-500 tabular-nums">{p.total} response{p.total === 1 ? '' : 's'}</span>
      </div>
      <h3 className="text-sm font-bold text-gray-900">{p.question}</h3>

      <div className="mt-3">
        {p.total === 0 ? (
          <p className="text-sm text-gray-400">No responses yet.</p>
        ) : p.kind === 'text' ? (
          <ul className="space-y-2">
            {p.notes.map((n, i) => (
              <li key={i} className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">“{n}”</li>
            ))}
          </ul>
        ) : p.kind === 'rank' ? (
          <ol className="space-y-1">
            {rankOrder.map((o, i) => (
              <li key={o.label} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 flex-1 text-gray-800"><span className="mr-2 font-bold text-gray-400 tabular-nums">{i + 1}.</span>{o.label}</span>
                <span className="shrink-0 tabular-nums text-gray-500">avg {o.avg != null ? o.avg.toFixed(2) : '—'}</span>
              </li>
            ))}
          </ol>
        ) : (
          <div>
            {p.options.map((label, i) => <OptionBar key={i} label={label} count={p.tallies[i] ?? 0} total={p.total} />)}
          </div>
        )}

        {/* Free-text extras attached to a single/multi/rank poll ("Something else…") */}
        {p.kind !== 'text' && p.notes.length > 0 && (
          <div className="mt-3 border-t border-gray-100 pt-3">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Other / free text</p>
            <ul className="space-y-1.5">
              {p.notes.map((n, i) => <li key={i} className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">“{n}”</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

export default function PollResultsPage() {
  const { session } = useSupabase()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [polls, setPolls] = useState<PollResult[] | null>(null)
  const [topic, setTopic] = useState<string>('all')

  useEffect(() => {
    if (!session) { setIsAdmin(false); return }
    fetch('/api/admin').then(r => r.json()).then(d => setIsAdmin(!!d.is_admin)).catch(() => setIsAdmin(false))
  }, [session])

  useEffect(() => {
    if (!isAdmin) return
    fetch('/api/admin/polls/results').then(r => r.json()).then(d => setPolls(d.polls ?? [])).catch(() => setPolls([]))
  }, [isAdmin])

  const topics = useMemo(() => ['all', ...Array.from(new Set((polls ?? []).map(p => p.topic)))], [polls])
  const shown = (polls ?? []).filter(p => topic === 'all' || p.topic === topic)

  if (isAdmin === false) return <main className="max-w-2xl mx-auto px-4 py-16 text-center text-sm text-gray-500">Admins only.</main>
  if (isAdmin === null || polls === null) return <main className="flex justify-center py-24"><Spinner className="h-7 w-7" /></main>

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 pb-20">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-black text-gray-900">Poll results</h1>
        <Link href="/admin/polls" className="text-sm font-semibold text-violet-600 hover:underline">Manage polls →</Link>
      </div>

      {topics.length > 2 && (
        <div className="mb-5 flex flex-wrap gap-1.5">
          {topics.map(t => (
            <button
              key={t} type="button" onClick={() => setTopic(t)}
              className={clsx('rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                topic === t ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
            >{t}</button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="text-sm text-gray-400">No polls to show.</p>
      ) : (
        <div className="space-y-4">
          {shown.map(p => <PollCard key={p.id} p={p} />)}
        </div>
      )}
    </main>
  )
}
