'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import { fmtCents } from '@/lib/sweep/prizes'
import { prizeLabel } from '@/lib/sweep/podium'

type Runner = { id: string; number: number; name: string; position: number; holder: string | null; mine: boolean }
type Winner = { places: number[]; horseNumber: number; horseName: string; holder: string; cents: number | null }

const WINNER_MS = 13_000   // the winner crosses the line ~13s in at 1×

// "#7 Vauban (Greg's)" — horses called with whoever holds them in this pool.
const say = (r?: { number: number; name: string; holder: string | null }) =>
  r ? `#${r.number} ${r.name}${r.holder ? ` (${r.holder.split(' ')[0]}'s)` : ''}` : ''

type Called = { number: number; name: string; holder: string | null; mine: boolean }
// The caller's script — `at` is how far through the race (of the winner's time) each call comes.
const CALLS: { at: number; line: (o: Called[]) => string }[] = [
  { at: 0,    line: () => "And they're away in the Practice Cup! 🏁" },
  { at: 0.14, line: o => `${say(o[0])} shoots to the lead, ${say(o[1])} tucked in behind.` },
  { at: 0.34, line: o => `Down the back it's ${say(o[0])}, from ${say(o[1])} and ${say(o[2])}.` },
  { at: 0.54, line: o => `Approaching the turn — ${say(o[0])} still in front, ${say(o[3])} starting to improve!` },
  { at: 0.72, line: o => `Into the straight! ${say(o[0])} kicks clear — ${say(o[1])} chasing hard!` },
  { at: 0.88, line: o => `200 to go — ${say(o[0])} and ${say(o[1])} locked together!` },
]
// "…and look at yours, #12 Buckaroo!" when your horse is in the first four at a call.
function mineShout(order: Called[]): string {
  const yours = order.slice(0, 4).find(r => r.mine)
  return yours && order[0] !== yours ? ` And look at yours — ${say({ ...yours, holder: null })} is right there!` : ''
}

// The optional voice: the browser's own speech, an Australian voice where there is one.
function speak(text: string, speed: number) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text.replace(/#(\d+)/g, 'number $1').replace(/[🏁🏆]/gu, ''))
  u.voice = window.speechSynthesis.getVoices().find(v => v.lang === 'en-AU') ?? null
  u.lang = 'en-AU'
  u.rate = Math.min(2, 1.15 * speed)
  window.speechSynthesis.speak(u)
}
const GAP_MS    = 220      // each later finisher a beat behind

// Seeded so a horse's run doesn't change between frames (or between Watch-again replays).
function rng(seed: number) {
  let x = seed || 1
  return () => { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646 }
}

// A PRACTICE race, acted out. The result was already decided by the server (one random full
// order — /api/comps/:id/sweep/practice-race); this only animates it, so the horses jostle
// and swap places but always cross the line in that order. Never used for the real Cup —
// next to official results, a cartoon race could pass for live coverage.
export function PracticeRaceModal({ runners, winners, onClose }: {
  runners: Runner[]; winners: Winner[]; onClose: () => void
}) {
  const [speed, setSpeed] = useState<1 | 2>(1)
  const [simMs, setSimMs] = useState(0)
  const speedRef = useRef(speed)
  speedRef.current = speed
  const finished = useRef(false)

  // Per horse: when it finishes, and a wobble around a steady pace so places change mid-race.
  const plans = useMemo(() => runners.map(r => {
    const rand = rng(r.number * 7919 + r.position)
    return {
      id: r.id,
      finishMs: WINNER_MS + (r.position - 1) * GAP_MS,
      amp: 0.05 + rand() * 0.07, freq: 1 + rand() * 1.5, phase: rand() * Math.PI * 2,
    }
  }), [runners])
  const endMs = Math.max(...plans.map(p => p.finishMs)) + 400

  useEffect(() => {
    let frame = 0, last: number | null = null
    const tick = (now: number) => {
      const dt = last == null ? 0 : now - last
      last = now
      setSimMs(t => Math.min(endMs, t + dt * speedRef.current))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [endMs])

  const done = simMs >= endMs
  useEffect(() => {
    if (!done || finished.current) return
    finished.current = true
    confetti({ particleCount: 140, spread: 80, origin: { y: 0.35 }, zIndex: 9999 })
  }, [done])

  // 0 → 1 along the track. The wobble fades to nothing at both ends, so every horse starts
  // together and crosses exactly on its planned time.
  const progress = (id: string) => {
    const p = plans.find(x => x.id === id)!
    const x = Math.min(1, simMs / p.finishMs)
    return Math.min(1, Math.max(0, x + p.amp * Math.sin(x * Math.PI * 2 * p.freq + p.phase) * x * (1 - x) * 4))
  }

  // ── The race caller ──────────────────────────────────────────────────────────────
  // A call at each stage of the race, built from the order AT that moment — names the
  // horses (and who holds them), and gives your own horse a shout when it's in the action.
  // The winner's call comes as it crosses the line, not when the last horse does.
  const callIdx = simMs >= WINNER_MS ? CALLS.length : CALLS.filter(c => simMs >= c.at * WINNER_MS).length - 1
  const [call, setCall] = useState('')
  const [voice, setVoice] = useState(false)   // 🔊 off by default — offices, and autoplay rules
  const lastCalled = useRef(-2)
  useEffect(() => {
    if (callIdx === lastCalled.current) return
    lastCalled.current = callIdx
    const order = [...runners].sort((a, b) => progress(b.id) - progress(a.id))
    const byFinish = [...runners].sort((a, b) => a.position - b.position)
    const text = callIdx >= CALLS.length
      ? `${say(byFinish[0])} wins the Practice Cup! ${say(byFinish[1])} second, ${say(byFinish[2])} third.`
      : CALLS[Math.max(0, callIdx)].line(order) + mineShout(order)
    setCall(text)
    if (voice) speak(text, speed)
  }, [callIdx])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (typeof window !== 'undefined') window.speechSynthesis?.cancel() }, [])

  const lanes = [...runners].sort((a, b) => a.number - b.number)

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-3">
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: 'linear-gradient(160deg, #0a2e1c 0%, #153d26 50%, #0d3320 100%)' }}>
        <div className="px-4 pt-4 pb-2 flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-widest text-amber-300">🧪 Practice race</p>
          {!done && (
            <div className="flex gap-1.5">
              <button onClick={() => { const on = !voice; setVoice(on); if (on) speak(call, speed); else window.speechSynthesis?.cancel() }}
                aria-label={voice ? 'Mute the race caller' : 'Hear the race caller'}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${voice ? 'bg-amber-400 text-emerald-950' : 'text-white/70 border border-white/25'}`}>
                {voice ? '🔊' : '🔇'}
              </button>
              {([1, 2] as const).map(v => (
                <button key={v} onClick={() => setSpeed(v)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${speed === v ? 'bg-amber-400 text-emerald-950' : 'text-white/70 border border-white/25'}`}>
                  {v}×
                </button>
              ))}
              <button onClick={() => setSimMs(endMs)} className="text-[11px] font-bold px-2.5 py-1 rounded-full text-white/70 border border-white/25">
                Skip ⏭
              </button>
            </div>
          )}
        </div>
        <p className="px-4 pb-3 text-white font-black text-base min-h-[3rem]" aria-live="polite">🎙️ {call}</p>

        {!done ? (
          <div className="px-3 pb-4 space-y-1 max-h-[65vh] overflow-y-auto">
            {lanes.map(r => {
              const p = progress(r.id)
              return (
                <div key={r.id} className={`relative h-6 rounded-md ${r.mine ? 'bg-emerald-400/25 ring-1 ring-emerald-300/60' : 'bg-white/[0.06]'}`}>
                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-white/60 truncate max-w-[45%]">
                    #{r.number}{r.holder ? ` · ${r.holder}` : ''}
                  </span>
                  {/* finish post */}
                  <span className="absolute right-6 top-0 bottom-0 w-px bg-white/40" />
                  {/* 🏇 faces left — mirrored so the field runs left to right */}
                  <span className="absolute top-1/2 text-base leading-none"
                    style={{ left: `calc(${p * 100}% - ${p * 1.6}rem)`, transform: 'translateY(-50%) scaleX(-1)' }}>🏇</span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="px-4 pb-4">
            <div className="bg-white rounded-xl p-4 space-y-2">
              {winners.length === 0 && <p className="text-sm text-gray-500">No horse in this pool placed.</p>}
              {winners.map(w => (
                <div key={w.horseNumber} className="flex items-start justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block font-semibold text-gray-900">{prizeLabel(w.places)} — {w.holder}</span>
                    <span className="block text-xs text-gray-500">#{w.horseNumber} {w.horseName}</span>
                  </span>
                  {w.cents != null && <span className="font-bold text-amber-700 whitespace-nowrap">{fmtCents(w.cents)}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="px-4 pb-4 flex justify-end gap-2">
          {done && (
            <button onClick={() => { finished.current = false; lastCalled.current = -2; setSimMs(0) }} className="text-sm font-bold text-white/80 px-3 py-2">
              ▶ Watch again
            </button>
          )}
          <button onClick={() => { window.speechSynthesis?.cancel(); onClose() }} className="bg-amber-400 hover:bg-amber-300 text-emerald-950 text-sm font-black px-4 py-2 rounded-xl">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
