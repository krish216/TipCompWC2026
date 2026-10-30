'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { DRAW_OPENS_LABEL } from '@/lib/sweep/field'

const LOCK_LEAD_MS = 30 * 60 * 1000   // pools lock 30 minutes before the jump (sweep-auto-lock)
const MELBOURNE = 'Australia/Melbourne'

// "2d 21h" / "5h 12m" / "18m"
function fmtUntil(ms: number): string {
  const mins = Math.max(1, Math.ceil(ms / 60_000))
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`
}

// The viewer's own time, with Melbourne's alongside when they're somewhere else.
function fmtTime(d: Date, withDay: boolean): string {
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', ...(withDay ? { weekday: 'short', day: 'numeric', month: 'short' } : {}) }
  const local = d.toLocaleString('en-AU', opts)
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  return tz === MELBOURNE ? local : `${local} (${d.toLocaleString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: MELBOURNE })} Melbourne)`
}

// A slim race-day strip for a real sweep (never practice — no race time): it changes with
// the stage — draw not open yet, counting down, pools locked, race run, results in — so the
// "pools lock 30 minutes before the jump" rule is in front of people before it bites.
// Ticks once a minute; no seconds.
// `dark` — a quieter line for inside the dark sweep card on /tribe.
export function RaceCountdown({ raceStartAt, drawOpen, resultsIn, resultsHref, dark = false, className = '' }: {
  raceStartAt: string; drawOpen: boolean; resultsIn: boolean; resultsHref?: string; dark?: boolean; className?: string
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  const start = new Date(raceStartAt)
  const lockAt = new Date(start.getTime() - LOCK_LEAD_MS)
  const toStart = start.getTime() - now

  let tone = dark ? 'bg-white/10 text-white' : 'bg-gray-900 text-white'
  let body: ReactNode
  if (resultsIn) {
    tone = dark ? 'bg-amber-400/20 text-amber-200' : 'bg-amber-100 text-amber-900'
    body = resultsHref
      ? <Link href={resultsHref} className="font-bold hover:underline">🏆 Results are in → see your pool</Link>
      : <span className="font-bold">🏆 Results are in</span>
  } else if (toStart <= 0) {
    body = <><span className="font-bold">🏁 Race run</span> · results soon</>
  } else if (now >= lockAt.getTime()) {
    tone = 'bg-amber-500 text-white'
    body = <><span className="font-bold">🔒 Pools locked</span> · they jump in {fmtUntil(toStart)}</>
  } else if (!drawOpen) {
    body = <><span className="font-bold">🎟️ Draw opens {DRAW_OPENS_LABEL}</span> · race in {fmtUntil(toStart)}</>
  } else {
    body = (
      <>
        <span className="font-bold">🏇 Race in {fmtUntil(toStart)}</span>
        <span className="opacity-70"> · {fmtTime(start, true)} · pools lock {fmtTime(lockAt, false)}</span>
      </>
    )
  }

  return (
    <div className={`${dark ? 'rounded-lg px-3 py-1.5 text-xs text-left' : 'rounded-xl px-4 py-2.5 text-sm text-center'} ${tone} ${className}`}>{body}</div>
  )
}
