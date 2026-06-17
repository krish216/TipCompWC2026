'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { clsx } from 'clsx'
import { Avatar, Medal, Spinner } from '@/components/ui'
import { BracketEntryModal } from '@/components/game/BracketEntryModal'

type RoundKey = 'r32' | 'r16' | 'qf' | 'sf' | 'tp' | 'final'
interface Entry {
  user_id: string; display_name: string; avatar_url: string | null; total: number; rank: number
  by_round: Record<RoundKey, number>; correct: Record<RoundKey, number>
}
interface Data {
  entries: Entry[]; total_entrants: number; me: Entry | null; max: number; scoring_started: boolean; simulated?: boolean
}

const ROUND_LABEL: { key: RoundKey; label: string; outOf: number }[] = [
  { key: 'r32', label: 'R32', outOf: 16 },
  { key: 'r16', label: 'R16', outOf: 8 },
  { key: 'qf',  label: 'QF',  outOf: 4 },
  { key: 'sf',  label: 'SF',  outOf: 2 },
  { key: 'tp',  label: '3rd', outOf: 1 },
  { key: 'final', label: 'Final', outOf: 1 },
]

function closesLabel(iso: string): string {
  const d = new Date(iso)
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000)
  const date = d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
  return days > 1 ? `close ${date} · ${days} days` : `close ${date}`
}

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
  const [es,   setEs]   = useState<any | null>(null)   // entry status (/api/bracket/enter)
  const [cfg,  setCfg]  = useState<any | null>(null)   // sponsor co-branding (/api/bracket/config)
  const [showEnter, setShowEnter] = useState(false)

  const loadEntry = () => fetch('/api/bracket/enter').then(r => r.json()).then(setEs).catch(() => {})

  useEffect(() => {
    fetch('/api/bracket/leaderboard').then(r => r.json()).then(setData).catch(() => setErr(true))
    fetch('/api/bracket/config').then(r => r.json()).then(setCfg).catch(() => {})
    loadEntry()
  }, [])

  const coBranded = !!(cfg?.enabled && (cfg.sponsor_name || cfg.sponsor_logo))

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 pb-28">
      {coBranded ? (
        <div className="mb-4">
          <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-900 text-white p-4 shadow">
            <div className="flex items-center justify-between gap-3">
              {(() => {
                const mark = cfg.sponsor_logo
                  ? <img src={cfg.sponsor_logo} alt={cfg.sponsor_name || 'Sponsor'} className="h-9 bg-white rounded-lg px-3 py-1.5 object-contain" />
                  : <span className="font-extrabold text-lg">{cfg.sponsor_name}</span>
                return cfg.sponsor_url
                  ? <a href={cfg.sponsor_url} target="_blank" rel="noopener noreferrer sponsored">{mark}</a>
                  : mark
              })()}
              <div className="text-right leading-none">
                <div className="text-[9px] uppercase tracking-widest opacity-75 mb-1">powered by</div>
                <div className="font-extrabold text-sm">TribePicks</div>
              </div>
            </div>
            <h1 className="text-xl font-black mt-3">Bracket Challenge 🏆</h1>
            {cfg.prize && <p className="text-sm mt-1 opacity-95">Win <strong className="text-amber-300">{cfg.prize}</strong></p>}
          </div>
          <div className="flex items-center justify-between mt-2 px-1">
            <p className="text-xs text-gray-500">Global leaderboard · max {data?.max ?? 80} pts</p>
            <Link href="/bracket" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700">Your bracket →</Link>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-lg font-bold text-gray-900">🏆 Bracket Challenge</h1>
            <p className="text-xs text-gray-500 mt-0.5">Global leaderboard · max {data?.max ?? 80} pts</p>
          </div>
          <Link href="/bracket" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex-shrink-0">Your bracket →</Link>
        </div>
      )}

      {/* Entry status / CTA */}
      {es && es.available && (
        es.locked ? (
          <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-600">🔒 Entries closed — the knockouts have started.</div>
        ) : !es.logged_in ? (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800 flex items-center justify-between gap-2">
            <span>Log in to enter the Bracket Challenge.</span>
            <a href="/login" className="font-semibold underline whitespace-nowrap">Log in →</a>
          </div>
        ) : es.entered ? (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800">
            ✓ You&apos;re in the draw! Tie-breakers — Final <strong>{es.entry?.final_goals}</strong> goal{es.entry?.final_goals === 1 ? '' : 's'} · 3rd place <strong>{es.entry?.tp_goals}</strong> goal{es.entry?.tp_goals === 1 ? '' : 's'}.
          </div>
        ) : !es.has_bracket ? (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 flex items-center justify-between gap-2">
            <span>Pick your champion to complete your bracket, then enter.</span>
            <a href="/bracket" className="font-semibold underline whitespace-nowrap">Finish bracket →</a>
          </div>
        ) : (
          <div className="mb-4 rounded-xl border-2 border-emerald-300 bg-emerald-50 px-3 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-emerald-900">🎯 Enter to win</p>
              <p className="text-[11px] text-emerald-700 mt-0.5">{es.closes_at ? `Entries ${closesLabel(es.closes_at)}` : 'Open now'}</p>
            </div>
            <button onClick={() => setShowEnter(true)} className="flex-shrink-0 px-4 py-2 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white">Enter →</button>
          </div>
        )
      )}

      {!data && !err && <div className="flex justify-center py-16"><Spinner className="w-7 h-7" /></div>}
      {err && <p className="text-center text-sm text-gray-500 py-16">Couldn&apos;t load the leaderboard.</p>}

      {data && (
        <>
          {data.simulated && (
            <div className="mb-4 rounded-xl border border-purple-300 bg-purple-50 px-3 py-2.5 text-xs font-semibold text-purple-800">
              🧪 Simulation mode — these standings are a test simulation, not live results.
            </div>
          )}
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

      {showEnter && (
        <BracketEntryModal onClose={() => setShowEnter(false)} onEntered={() => { setShowEnter(false); loadEntry() }} />
      )}
    </div>
  )
}
