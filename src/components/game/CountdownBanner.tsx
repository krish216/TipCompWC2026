'use client'

import { useEffect, useState } from 'react'
import { useUserPrefs, type Tournament } from '@/components/layout/UserPrefsContext'
import { TournamentSheet } from '@/components/game/TournamentSwitcher'

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
  const isSweep    = (selectedTourn as any)?.format === 'sweep'
  // Don't borrow WC's first-match line for another tournament that has none — fall back
  // to a kickoff date instead. A sweep is one race, not a season of matches.
  const firstMatch = selectedTourn
    ? (selectedTourn.first_match ?? (isSweep
        ? `Race day: ${kickoff.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
        : `Season kicks off ${kickoff.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`))
    : WC.first
  // Per-tournament logo; only fall back to the WC crest when there's no tournament at all.
  const logo       = selectedTourn?.logo_url ?? (selectedTourn ? null : WC.logo)
  // The sheet also lists upcoming sweeps, so it's worth opening even with a single football
  // tournament — otherwise someone who sees only one (e.g. just EPL) has no way to reach
  // /sweep from here at all.
  const canSwitch  = !!pick && tournaments.length > 0
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
        : <span className="w-8 h-8 flex items-center justify-center text-lg flex-shrink-0">{isSweep ? '🐎' : '⚽'}</span>}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white flex items-center gap-2 min-w-0">
          <span className="truncate">{name}</span>
          {/* A labelled chip, not just a ▾ — the whole banner is the switcher (and the only
              way to reach Sweeps), but on its own it reads as a heading, not a control. */}
          {canSwitch && (
            <span className="flex-shrink-0 text-[10px] font-bold text-white bg-white/15 border border-white/25 rounded-full px-2 py-0.5 leading-none">
              Switch ⇄
            </span>
          )}
        </p>
        <p className="text-[11px] text-green-300 truncate">
          {isSweep
            ? (ended ? 'Race complete' : t.started ? 'Race day is here' : firstMatch)
            : (ended ? `Tournament complete · ${matches} matches` : t.started ? `Tournament is underway · ${matches} matches` : firstMatch)}
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
