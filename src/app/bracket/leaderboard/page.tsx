'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { clsx } from 'clsx'
import { Avatar, Medal, Spinner } from '@/components/ui'

type RoundKey = 'r32' | 'r16' | 'qf' | 'sf' | 'tp' | 'final'
interface Entry {
  user_id: string; display_name: string; avatar_url: string | null; total: number; rank: number
  by_round: Record<RoundKey, number>; correct: Record<RoundKey, number>
}
interface Data {
  entries: Entry[]; total_entrants: number; me: Entry | null; max: number; scoring_started: boolean
}

const ROUND_LABEL: { key: RoundKey; label: string; outOf: number }[] = [
  { key: 'r32', label: 'R32', outOf: 16 },
  { key: 'r16', label: 'R16', outOf: 8 },
  { key: 'qf',  label: 'QF',  outOf: 4 },
  { key: 'sf',  label: 'SF',  outOf: 2 },
  { key: 'tp',  label: '3rd', outOf: 1 },
  { key: 'final', label: 'Final', outOf: 1 },
]

function Row({ e, isMe }: { e: Entry; isMe: boolean }) {
  return (
    <div className={clsx('grid grid-cols-[36px_1fr_56px] gap-2 items-center px-3 py-2.5 border-b border-gray-100 last:border-0', isMe && 'bg-emerald-50')}>
      <div className="flex justify-center"><Medal rank={e.rank} /></div>
      <div className="flex items-center gap-2 min-w-0">
        <Avatar name={e.display_name} src={e.avatar_url} size="xs" />
        <span className={clsx('text-sm font-medium truncate', isMe && 'text-emerald-700')}>{e.display_name}{isMe ? ' (you)' : ''}</span>
      </div>
      <span className="text-right text-sm font-extrabold text-gray-900">{e.total}</span>
    </div>
  )
}

export default function BracketLeaderboardPage() {
  const [data, setData] = useState<Data | null>(null)
  const [err,  setErr]  = useState(false)

  useEffect(() => {
    fetch('/api/bracket/leaderboard')
      .then(r => r.json())
      .then(setData)
      .catch(() => setErr(true))
  }, [])

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 pb-28">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">🏆 Bracket Challenge</h1>
          <p className="text-xs text-gray-500 mt-0.5">Global leaderboard · max {data?.max ?? 80} pts</p>
        </div>
        <Link href="/bracket" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex-shrink-0">Your bracket →</Link>
      </div>

      {!data && !err && <div className="flex justify-center py-16"><Spinner className="w-7 h-7" /></div>}
      {err && <p className="text-center text-sm text-gray-500 py-16">Couldn&apos;t load the leaderboard.</p>}

      {data && (
        <>
          {!data.scoring_started && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              ⏳ Scoring begins at the <strong>Round of 32</strong> — everyone&apos;s on 0 until the knockouts kick off.
            </div>
          )}

          {/* Your position + per-round breakdown */}
          {data.me && (
            <div className="mb-4 rounded-2xl border border-emerald-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-emerald-50/60">
                <div className="flex items-center gap-2">
                  <Avatar name={data.me.display_name} src={data.me.avatar_url} size="sm" />
                  <div>
                    <p className="text-sm font-bold text-gray-900">You · #{data.me.rank} <span className="text-gray-400 font-medium">of {data.total_entrants}</span></p>
                    <p className="text-[11px] text-emerald-700 font-semibold">{data.me.total} / {data.max} pts</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-6 divide-x divide-gray-100 border-t border-gray-100">
                {ROUND_LABEL.map(({ key, label, outOf }) => (
                  <div key={key} className="px-1 py-2 text-center">
                    <p className="text-[10px] text-gray-400 font-semibold uppercase">{label}</p>
                    <p className="text-sm font-bold text-gray-800">{data.me!.by_round[key]}</p>
                    <p className="text-[9px] text-gray-400">{data.me!.correct[key]}/{outOf}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top 12 */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="grid grid-cols-[36px_1fr_56px] gap-2 px-3 py-2 bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-wide">
              <span className="text-center">#</span><span>Player · top 12</span><span className="text-right">Pts</span>
            </div>
            {data.entries.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-8">No entries yet.</p>
            ) : data.entries.map(e => <Row key={e.user_id} e={e} isMe={data.me?.user_id === e.user_id} />)}

            {/* Your position row when outside the top 12 */}
            {data.me && data.me.rank > 12 && (
              <>
                <div className="text-center text-gray-300 py-1">⋯</div>
                <Row e={data.me} isMe />
              </>
            )}
          </div>

          <p className="text-[11px] text-gray-400 text-center mt-3">
            {data.total_entrants} bracket{data.total_entrants === 1 ? '' : 's'} entered · one global pool
          </p>
        </>
      )}
    </div>
  )
}
