'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { track } from '@vercel/analytics'
import { SweepWheel } from '@/components/game/SweepWheel'
import { ordinal } from '@/lib/sweep/podium'
import { DEMO_SCRIPTS, type DemoScript } from '@/lib/sweep/demo-race-scripts'
import { ScriptedRaceModal, primeRaceAudio } from './ScriptedRaceModal'

// The practice field (migration 200) — past Cup winners, never this year's runners.
const FIELD = [
  'Phar Lap', 'Makybe Diva', 'Think Big', 'Rain Lover', 'Might And Power', 'Vintage Crop',
  'Saintly', 'Efficient', 'Gold And Black', 'Archer', 'Light Fingers', 'Van Der Hum',
].map((name, i) => ({ id: `demo-${i + 1}`, number: i + 1, name }))

// A made-up office for the other eleven tickets, so the results have people to pay.
const OFFICE = ['Shaz', 'Dave', 'Priya', 'Macca', 'Jess', 'Tom', 'Linh', 'Bec', 'Raj', 'Kylie', 'Hamish']
const TICKET_CENTS = 500
const SPLIT = [70, 20, 10]

function shuffle<T>(a: T[]): T[] {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] }
  return b
}

type Race = {
  script: DemoScript
  runners: { id: string; number: number; name: string; position: number; holder: string | null; mine: boolean }[]
  winners: { places: number[]; horseNumber: number; horseName: string; holder: string; cents: number | null }[]
}

// One pretend office sweep: you've drawn `yours`, the office gets the rest, and one of the
// pre-recorded races (src/lib/sweep/demo-race-scripts.ts) decides the order. Nothing is stored.
function newRace(yours: (typeof FIELD)[number], script: DemoScript): Race {
  const others = shuffle(FIELD.filter(h => h.id !== yours.id))
  const holder = new Map<string, string | null>([[yours.id, null], ...others.map((h, i) => [h.id, OFFICE[i]] as [string, string])])
  const runners = FIELD.map(h => ({
    ...h, position: script.finish.indexOf(h.number) + 1, holder: holder.get(h.id) ?? null, mine: h.id === yours.id,
  }))
  // Every horse is sold and there are no dead heats, so the first three home take 70/20/10.
  const pot = TICKET_CENTS * FIELD.length
  const winners = script.finish.slice(0, 3).map((n, i) => {
    const h = FIELD[n - 1]
    return {
      places: [i + 1], horseNumber: n, horseName: h.name,
      holder: h.id === yours.id ? 'You 🎉' : holder.get(h.id)!, cents: Math.round(pot * SPLIT[i] / 100),
    }
  })
  return { script, runners, winners }
}

// Spin the real wheel (a local random pick stands in for the server draw), then race.
export function DemoRace() {
  const [spin, setSpin] = useState(0)                       // re-keys the wheel for a fresh spin
  const [yours, setYours] = useState<(typeof FIELD)[number] | null>(null)
  const [race, setRace] = useState<Race | null>(null)
  const [last, setLast] = useState<Race | null>(null)
  const played = useRef<string[]>([])                       // work through all six before repeating

  const draw = async () => {
    const h = FIELD[Math.floor(Math.random() * FIELD.length)]
    setTimeout(() => setYours(h), 650)   // after the wheel settles, like the real draw
    track('demo_race_spin')
    return { ok: true, horse: { ...h, scratched: false, finish_position: null } }
  }
  const run = () => {
    if (!yours) return
    let fresh = DEMO_SCRIPTS.filter(s => !played.current.includes(s.id))
    if (!fresh.length) { played.current = played.current.slice(-1); fresh = DEMO_SCRIPTS.filter(s => !played.current.includes(s.id)) }
    const script = fresh[Math.floor(Math.random() * fresh.length)]
    played.current.push(script.id)
    primeRaceAudio(script)   // inside the tap, so phones allow the sound
    const r = newRace(yours, script)
    setRace(r); setLast(r)
    track('demo_race_start', { again: !!last, script: script.id })
  }
  const respin = () => { setYours(null); setLast(null); setSpin(s => s + 1) }

  const step = yours ? 2 : 1
  return (
    <>
      <ol className="flex items-center justify-center gap-2 mb-4 text-sm font-bold">
        {['Spin for your horse', 'Run the race'].map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            {i > 0 && <span className="text-gray-300">→</span>}
            <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${step === i + 1 ? 'bg-emerald-600 text-white' : step > i + 1 ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
              <span>{step > i + 1 ? '✓' : i + 1}</span>{label}
            </span>
          </li>
        ))}
      </ol>
      {/* Step 2 lives on the wheel's hub, like "Tap to spin" — the wheel is the one thing to tap. */}
      <SweepWheel key={spin} slots={FIELD.length} onDraw={draw}
        resultAction={{ label: last ? '🔁 Race Replay' : '🏁 Run the race', onClick: run }}
        resultNote="The rest of the field went to the office. Tap the wheel to race 🔊" />
      {last && !race && yours && (
        <p className="mt-3 text-sm text-gray-600 text-center">
          #{yours.number} {yours.name} ran <strong>{ordinal(last.runners.find(r => r.mine)!.position)}</strong>.{' '}
          <button onClick={respin} className="font-bold text-emerald-700 hover:underline">Spin for a new horse</button>
        </p>
      )}
      {race && (
        <ScriptedRaceModal script={race.script} runners={race.runners} winners={race.winners} onClose={() => setRace(null)}
          cta={
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-center">
              <p className="text-sm font-bold text-gray-900">Run this for your office sweep — free</p>
              <p className="text-xs text-gray-600 mt-0.5">Share a link, everyone spins for their horse, you see who&apos;s paid.</p>
              <Link href="/melbourne-cup?src=race_demo" onClick={() => track('demo_race_cta', { where: 'modal' })}
                className="inline-block mt-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4 py-2 rounded-lg">
                Start a sweep →
              </Link>
            </div>
          } />
      )}
    </>
  )
}
