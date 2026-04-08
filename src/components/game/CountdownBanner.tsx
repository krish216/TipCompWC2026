'use client'

import { useEffect, useState } from 'react'

const KICKOFF = new Date('2026-06-11T19:00:00Z')

interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
  started: boolean
}

function calcTimeLeft(): TimeLeft {
  const diff = KICKOFF.getTime() - Date.now()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, started: true }
  return {
    days:    Math.floor(diff / 86_400_000),
    hours:   Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1_000),
    started: false,
  }
}

function Digit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center bg-green-800 rounded-lg px-3 py-2 min-w-[52px]">
      <span className="text-xl font-semibold text-white tabular-nums leading-none">
        {String(value).padStart(2, '0')}
      </span>
      <span className="text-[9px] text-green-300 mt-1 uppercase tracking-wider">{label}</span>
    </div>
  )
}

export function CountdownBanner() {
  const [t, setT] = useState<TimeLeft>(calcTimeLeft)

  useEffect(() => {
    const id = setInterval(() => setT(calcTimeLeft()), 1_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="bg-green-900 rounded-xl px-4 py-3 mb-4 flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wc2026-logo.png" alt="FIFA World Cup 2026"
          className="w-8 h-auto flex-shrink-0 drop-shadow object-contain" />
        <div>
          <p className="text-sm font-semibold text-white">FIFA World Cup 2026</p>
          <p className="text-[11px] text-green-300">
            {t.started
              ? 'Tournament is underway · 104 matches'
              : 'Mexico vs South Africa · Estadio Azteca · Jun 11'}
          </p>
        </div>
      </div>

      {t.started ? (
        <span className="px-3 py-1.5 bg-red-500 text-white text-xs font-semibold rounded-full animate-pulse">
          LIVE NOW
        </span>
      ) : (
        <div className="flex gap-2">
          <Digit value={t.days}    label="Days" />
          <Digit value={t.hours}   label="Hrs" />
          <Digit value={t.minutes} label="Mins" />
          <Digit value={t.seconds} label="Secs" />
        </div>
      )}
    </div>
  )
}
