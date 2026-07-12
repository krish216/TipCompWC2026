'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { Spinner } from '@/components/ui'
import { TeamBadge } from '@/components/game/TeamBadge'

interface TeamT { name: string; code: string; logo: string | null; flag: string }
interface Quarter {
  quarter: number; label: string; checkpoint_games: number; locks_at: string
  top_n: number; bottom_n: number; points_per_correct: number
  state: 'open' | 'locked' | 'settled'; entrants: number
  my: { top_teams: string[]; bottom_teams: string[]; points: number | null } | null
  actual_top?: string[]; actual_bottom?: string[]
}
interface Data {
  tournament: { slug: string; name: string }
  enrollment_open: boolean
  teams: TeamT[]
  quarters: Quarter[]
  leaderboard: { name: string; flag: string; total_points: number; is_me: boolean }[]
  logged_in: boolean
}

const fmtLock = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export function TablePredictorView({ slug }: { slug: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState(false)
  const [activeQ, setActiveQ] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/standings?tournament=${encodeURIComponent(slug)}`, { cache: 'no-store' })
      if (!r.ok) { setErr(true); return }
      const d: Data = await r.json()
      setData(d)
      setActiveQ(prev => prev ?? (d.quarters.find(q => q.state === 'open')?.quarter ?? d.quarters[0]?.quarter ?? null))
    } catch { setErr(true) }
  }, [slug])
  useEffect(() => { load() }, [load])

  if (err) return <div className="max-w-xl mx-auto px-4 py-20 text-center text-sm text-gray-500">Couldn’t load the predictor.</div>
  if (!data) return <div className="flex justify-center py-24"><Spinner className="w-7 h-7" /></div>
  if (!data.quarters.length) return <div className="max-w-xl mx-auto px-4 py-20 text-center"><div className="text-4xl mb-3">📊</div><p className="text-sm text-gray-500">No table predictor for this tournament.</p></div>

  const q = data.quarters.find(x => x.quarter === activeQ) ?? data.quarters[0]

  return (
    <div className="max-w-xl mx-auto px-4 py-5 pb-24">
      <h1 className="text-2xl font-black text-gray-900">{data.tournament.name} — Table Predictor</h1>
      <p className="mt-1.5 text-sm text-gray-600">Predict the <strong>top {q.top_n}</strong> and <strong>bottom {q.bottom_n}</strong> at each checkpoint. Each quarter locks at its start — join any quarter.</p>

      {!data.enrollment_open && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-800">
          🔒 Predictions open soon — you can browse the quarters now.
        </div>
      )}

      {/* Quarter tabs */}
      <div className="flex gap-2 mt-4 overflow-x-auto pb-1">
        {data.quarters.map(x => (
          <button key={x.quarter} onClick={() => setActiveQ(x.quarter)}
            className={clsx('flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold border transition-colors',
              x.quarter === q.quarter ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50')}>
            <span>{x.label}</span>
            <span className={clsx('ml-1.5 text-[9px] uppercase', x.quarter === q.quarter ? 'text-emerald-100' : 'text-gray-400')}>
              {x.state === 'settled' ? '✓ done' : x.state === 'locked' ? '🔒' : 'open'}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-2 text-[11px] text-gray-400">
        After {q.checkpoint_games} games · {q.state === 'open' ? `locks ${fmtLock(q.locks_at)}` : q.state === 'locked' ? 'locked — awaiting the checkpoint' : 'settled'} · {q.entrants} {q.entrants === 1 ? 'entry' : 'entries'}
      </div>

      {q.state === 'open'
        ? <Picker key={q.quarter} slug={slug} q={q} teams={data.teams} loggedIn={data.logged_in} open={data.enrollment_open} onSaved={load} />
        : <Result q={q} teams={data.teams} />}

      {/* Season leaderboard */}
      {data.leaderboard.length > 0 && (
        <section className="mt-8">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Season leaderboard</p>
          <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 overflow-hidden">
            {data.leaderboard.map((e, i) => (
              <div key={i} className={clsx('flex items-center gap-3 px-4 py-2.5', e.is_me && 'bg-emerald-50/60')}>
                <span className="w-6 text-center text-sm font-bold text-gray-400 flex-shrink-0">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
                <span className="flex-1 text-sm font-semibold text-gray-800 truncate">{e.flag ? `${e.flag} ` : ''}{e.name}{e.is_me && ' (you)'}</span>
                <span className="text-sm font-black tabular-nums text-emerald-700">{e.total_points}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ── Picker (open quarter) ──────────────────────────────────────────────────────
function Picker({ slug, q, teams, loggedIn, open, onSaved }: { slug: string; q: Quarter; teams: TeamT[]; loggedIn: boolean; open: boolean; onSaved: () => void }) {
  const [top, setTop] = useState<string[]>(q.my?.top_teams ?? [])
  const [bottom, setBottom] = useState<string[]>(q.my?.bottom_teams ?? [])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const assign = (name: string, bucket: 'top' | 'bottom') => {
    setMsg(null)
    if (bucket === 'top') {
      if (top.includes(name)) return setTop(top.filter(n => n !== name))
      if (top.length >= q.top_n) return
      setBottom(b => b.filter(n => n !== name)); setTop([...top.filter(n => n !== name), name])
    } else {
      if (bottom.includes(name)) return setBottom(bottom.filter(n => n !== name))
      if (bottom.length >= q.bottom_n) return
      setTop(t => t.filter(n => n !== name)); setBottom([...bottom.filter(n => n !== name), name])
    }
  }

  const full = top.length === q.top_n && bottom.length === q.bottom_n
  const submit = async () => {
    if (!loggedIn) { setMsg('Sign in to enter.'); return }
    setSaving(true); setMsg(null)
    const r = await fetch('/api/standings/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tournament: slug, quarter: q.quarter, top_teams: top, bottom_teams: bottom }) })
    const d = await r.json().catch(() => ({}))
    setSaving(false)
    if (!r.ok) { setMsg(d.error ?? 'Save failed'); return }
    setMsg('Saved ✓'); onSaved()
  }

  return (
    <div className="mt-4">
      <div className="flex gap-3 text-xs font-bold mb-2">
        <span className={clsx('px-2 py-1 rounded-lg', top.length === q.top_n ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500')}>Top {top.length}/{q.top_n}</span>
        <span className={clsx('px-2 py-1 rounded-lg', bottom.length === q.bottom_n ? 'bg-rose-100 text-rose-700' : 'bg-gray-100 text-gray-500')}>Bottom {bottom.length}/{q.bottom_n}</span>
      </div>
      <ul className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 overflow-hidden">
        {teams.map(tm => {
          const inTop = top.includes(tm.name), inBottom = bottom.includes(tm.name)
          return (
            <li key={tm.code} className={clsx(
              'flex items-center gap-3 px-3 py-2 transition-colors',
              inTop ? 'bg-emerald-50' : inBottom ? 'bg-rose-50' : 'bg-white'
            )}>
              <TeamBadge flag={tm.flag} logo={tm.logo} name={tm.name} size={22} />
              <span className="flex-1 min-w-0 text-sm font-semibold text-gray-800 truncate">{tm.name}</span>
              <button onClick={() => assign(tm.name, 'top')} disabled={!inTop && top.length >= q.top_n}
                className={clsx('text-[11px] font-bold rounded-lg px-2.5 py-1 border transition-colors disabled:opacity-30',
                  inTop ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-gray-200 text-emerald-700 hover:bg-emerald-50')}>▲ Top</button>
              <button onClick={() => assign(tm.name, 'bottom')} disabled={!inBottom && bottom.length >= q.bottom_n}
                className={clsx('text-[11px] font-bold rounded-lg px-2.5 py-1 border transition-colors disabled:opacity-30',
                  inBottom ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white border-gray-200 text-rose-600 hover:bg-rose-50')}>▼ Bot</button>
            </li>
          )
        })}
      </ul>
      <div className="sticky bottom-16 sm:bottom-2 mt-3">
        <button onClick={submit} disabled={!full || saving || !open}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-bold px-4 py-3 rounded-xl transition-all">
          {saving && <Spinner className="w-4 h-4 text-white" />}
          {!open ? 'Opens soon' : q.my ? 'Update my prediction' : 'Lock in my prediction'}
        </button>
        {msg && <p className={clsx('text-center text-xs mt-1.5', msg.includes('✓') ? 'text-emerald-600' : 'text-rose-500')}>{msg}</p>}
      </div>
    </div>
  )
}

// ── Result (locked / settled quarter) ──────────────────────────────────────────
function Result({ q, teams }: { q: Quarter; teams: TeamT[] }) {
  const badge = (name: string) => { const tm = teams.find(t => t.name === name); return tm ? <TeamBadge flag={tm.flag} logo={tm.logo} name={name} size={20} /> : null }
  if (!q.my) {
    return <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">
      {q.state === 'locked' ? 'This quarter is locked — you didn’t enter.' : 'You didn’t enter this quarter.'}
    </div>
  }
  const settled = q.state === 'settled'
  const row = (title: string, picks: string[], actual: string[] | undefined) => (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {picks.map(n => {
          const correct = settled && actual?.includes(n)
          return (
            <span key={n} className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border',
              !settled ? 'bg-white border-gray-200 text-gray-700'
                : correct ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-gray-50 border-gray-200 text-gray-400 line-through')}>
              {badge(n)}{n}{settled && (correct ? ' ✓' : ' ✗')}
            </span>
          )
        })}
      </div>
    </div>
  )
  return (
    <div className="mt-4 space-y-4">
      {settled && (
        <div className="rounded-xl bg-emerald-600 text-white px-4 py-3 text-center">
          <p className="text-[11px] uppercase tracking-widest text-emerald-100">Your score</p>
          <p className="text-2xl font-black">{q.my.points} pts</p>
        </div>
      )}
      {row(`Your top ${q.top_n}`, q.my.top_teams, q.actual_top)}
      {row(`Your bottom ${q.bottom_n}`, q.my.bottom_teams, q.actual_bottom)}
      {!settled && <p className="text-[11px] text-gray-400">Locked in. Scored once {q.checkpoint_games} games are played.</p>}
    </div>
  )
}
