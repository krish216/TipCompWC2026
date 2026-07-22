'use client'

import { useEffect, useState } from 'react'
import { useUserPrefs, type Tournament } from '@/components/layout/UserPrefsContext'
import { Spinner } from '@/components/ui'

// Logged-out / no-context fallback (World Cup 2026).
const WC = {
  kickoff: new Date('2026-06-11T19:00:00Z'),
  first:   'Mexico vs South Africa · Estadio Azteca · Jun 11',
  matches: 104,
  name:    'FIFA World Cup 2026',
  logo:    '/wc2026-logo.png',
}

interface TimeLeft { days: number; hours: number; minutes: number; seconds: number; started: boolean }

function calcTimeLeft(kickoff: Date): TimeLeft {
  const diff = kickoff.getTime() - Date.now()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, started: true }
  return {
    days:    Math.floor(diff / 86_400_000),
    hours:   Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1_000),
    started: false,
  }
}

// A tournament's kickoff. There's no kickoff-time column, so use start_date (a date →
// midnight UTC); good enough for the "underway vs countdown" call. WC keeps its precise
// hardcoded kickoff, and it's the logged-out fallback.
const kickoffOf = (t: Tournament | null): Date =>
  t?.slug === 'wc2026' ? WC.kickoff
    : t?.start_date ? new Date(`${t.start_date}T00:00:00Z`)
    : WC.kickoff

const startsLabel = (t: Tournament): string =>
  t.start_date ? `Starts ${new Date(`${t.start_date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'Upcoming'

// A tournament is over once its end_date has passed (a plain date → end of that UTC day).
// Lets the banner swap the perpetual "LIVE NOW" for a completed state once the final's done.
const hasEnded = (t: Tournament | null): boolean =>
  t?.end_date ? new Date(`${t.end_date}T23:59:59Z`).getTime() < Date.now() : false

function Digit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center bg-green-800 rounded-lg px-3 py-2 min-w-[52px]">
      <span className="text-xl font-semibold text-white tabular-nums leading-none">{String(value).padStart(2, '0')}</span>
      <span className="text-[9px] text-green-300 mt-1 uppercase tracking-wider">{label}</span>
    </div>
  )
}

export function CountdownBanner() {
  let selectedTourn: Tournament | null = null
  let tournaments: Tournament[] = []
  let pick: ((id: string) => Promise<void> | void) | null = null
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const prefs = useUserPrefs()
    selectedTourn = prefs.selectedTourn
    tournaments   = prefs.activeTournaments
    pick          = prefs.pickTournament
  } catch { /* no context (e.g. logged out) — use WC defaults */ }

  const kickoff    = kickoffOf(selectedTourn)
  const name       = selectedTourn?.name ?? WC.name
  const matches    = selectedTourn?.total_matches ?? WC.matches
  // Don't borrow WC's first-match line for another tournament that has none — fall back
  // to a kickoff date instead.
  const firstMatch = selectedTourn
    ? (selectedTourn.first_match ?? `Season kicks off ${kickoff.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`)
    : WC.first
  // Per-tournament logo; only fall back to the WC crest when there's no tournament at all.
  const logo       = selectedTourn?.logo_url ?? (selectedTourn ? null : WC.logo)
  const canSwitch  = tournaments.length > 1
  const ended      = hasEnded(selectedTourn)

  const [t, setT]     = useState<TimeLeft>(() => calcTimeLeft(kickoff))
  const [sheet, setSheet] = useState(false)

  useEffect(() => {
    setT(calcTimeLeft(kickoff))
    const id = setInterval(() => setT(calcTimeLeft(kickoff)), 1_000)
    return () => clearInterval(id)
  }, [kickoff.getTime()])

  const identity = (
    <div className="flex items-center gap-3 min-w-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {logo
        ? <img src={logo} alt={name} className="w-8 h-auto max-h-8 flex-shrink-0 drop-shadow object-contain" />
        : <span className="w-8 h-8 flex items-center justify-center text-lg flex-shrink-0">⚽</span>}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white flex items-center gap-1.5 truncate">
          {name}
          {canSwitch && <span className="text-green-300 text-[11px] leading-none">▾</span>}
        </p>
        <p className="text-[11px] text-green-300 truncate">
          {ended ? `Tournament complete · ${matches} matches` : t.started ? `Tournament is underway · ${matches} matches` : firstMatch}
        </p>
      </div>
    </div>
  )

  return (
    <>
      <div className="bg-green-900 rounded-xl px-4 py-3 mb-4 flex items-center justify-between flex-wrap gap-3">
        {canSwitch
          ? <button type="button" onClick={() => setSheet(true)} aria-label="Switch tournament"
              className="flex items-center gap-3 min-w-0 text-left rounded-lg hover:opacity-90 active:opacity-80 transition-opacity">{identity}</button>
          : identity}

        {ended ? (
          <span className="px-3 py-1.5 bg-white/10 text-white text-xs font-semibold rounded-full whitespace-nowrap">✓ Completed</span>
        ) : t.started ? (
          <span className="px-3 py-1.5 bg-red-500 text-white text-xs font-semibold rounded-full animate-pulse">LIVE NOW</span>
        ) : (
          <div className="flex gap-2">
            <Digit value={t.days} label="Days" />
            <Digit value={t.hours} label="Hrs" />
            <Digit value={t.minutes} label="Mins" />
            <Digit value={t.seconds} label="Secs" />
          </div>
        )}
      </div>

      {sheet && pick && (
        <TournamentSheet tournaments={tournaments} currentId={selectedTourn?.id ?? null} onPick={pick} onClose={() => setSheet(false)} />
      )}
    </>
  )
}

// ── Switch-tournament bottom sheet ──────────────────────────────────────────────
function TournamentSheet({ tournaments, currentId, onPick, onClose }: {
  tournaments: Tournament[]; currentId: string | null
  onPick: (id: string) => Promise<void> | void; onClose: () => void
}) {
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const choose = async (id: string) => {
    if (id === currentId) { onClose(); return }
    setBusyId(id)
    try { await onPick(id) } finally { onClose() }
  }

  const now = Date.now()
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col justify-end sm:justify-center sm:items-center"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white w-full sm:w-[420px] sm:max-w-[96vw] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[70vh]">
        <div className="sm:hidden flex justify-center pt-3 pb-1 flex-shrink-0"><div className="w-10 h-1 rounded-full bg-gray-300" /></div>
        <div className="flex items-center justify-between px-4 pt-2 pb-3 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">Switch tournament</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none p-1" aria-label="Close">×</button>
        </div>
        <div className="overflow-y-auto p-2">
          {tournaments.map(t => {
            const ended = hasEnded(t)
            const started = t.start_date ? new Date(`${t.start_date}T00:00:00Z`).getTime() <= now : true
            const isCur = t.id === currentId
            return (
              <button key={t.id} type="button" onClick={() => choose(t.id)} disabled={!!busyId}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors disabled:opacity-60 ${isCur ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {t.logo_url
                  ? <img src={t.logo_url} alt="" className="w-8 h-8 rounded object-contain flex-shrink-0" />
                  : <span className="w-8 h-8 flex items-center justify-center text-lg flex-shrink-0">⚽</span>}
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-gray-900 truncate">{t.name}</span>
                  <span className={`text-[11px] font-semibold ${ended ? 'text-gray-400' : started ? 'text-red-500' : 'text-gray-400'}`}>{ended ? '✓ Complete' : started ? '● Live' : startsLabel(t)}</span>
                </span>
                {busyId === t.id ? <Spinner className="w-4 h-4" /> : isCur ? <span className="text-emerald-600 font-bold flex-shrink-0">✓</span> : null}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
