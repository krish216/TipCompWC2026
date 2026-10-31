'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import confetti from 'canvas-confetti'
import { fmtCents } from '@/lib/sweep/prizes'
import { ordinal, prizeLabel } from '@/lib/sweep/podium'
import type { DemoScript, Line } from '@/lib/sweep/demo-race-scripts'
import AUDIO from '@/lib/sweep/demo-race-audio.json'
import WORDS from '@/lib/sweep/demo-race-words.json'

type Runner = { id: string; number: number; name: string; position: number; holder: string | null; mine: boolean }
type Winner = { places: number[]; horseNumber: number; horseName: string; holder: string; cents: number | null }
type Clips = { intro: number; race: number[]; outro: number }
// When each word starts (seconds into its clip), per line — line.text.split(' ') order.
type Timings = number[][]
type ClipWords = { intro?: Timings; race?: Timings[]; outro?: Timings }

const RATE = 1.25   // the race calls play brisk (pitch is kept); the banter before and after doesn't
const GAP = 0.012   // track length between one place and the next
const HOLD_MS = 3000 // the field stays up, placings showing, before the results card
const NAMES = { vicky: 'Vicky', gordon: 'Gordo' } as const
const TAG = '7.5rem' // room behind the start for the longest name tag ("⭐ Might And Power")
const POST = '2rem'  // past the post, where 1st / 2nd / 3rd go up
const PLACE_STYLE = ['bg-amber-400 text-emerald-950', 'bg-gray-200 text-gray-800', 'bg-orange-300 text-orange-950']

// One element per sound, started inside the "Run the race" tap (the voice on the intro, the
// effects muted then paused) — mobile Safari only lets an element play once a tap has started
// it, after which the modal can play it freely. Sound is on by default for the same reason.
let voice: HTMLAudioElement | null = null
let crowd: HTMLAudioElement | null = null
let bell: HTMLAudioElement | null = null
let muted = false
const clipUrl = (id: string, clip: string) => `/race-calls/${id}/${clip}.mp3`
const callClip = (i: number) => `call-${String(i).padStart(2, '0')}`
export function primeRaceAudio(script: DemoScript) {
  voice ??= new Audio()
  crowd ??= Object.assign(new Audio('/race-calls/sfx/crowd.mp3'), { loop: true })
  bell ??= new Audio('/race-calls/sfx/bell.mp3')
  play(voice, clipUrl(script.id, 'intro'), 1)
  for (const a of [crowd, bell]) {
    a.muted = true
    a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = muted }).catch(() => {})
  }
  // Warm the cache with the race calls while the banter plays, so each one starts on its cue.
  script.race.forEach((_, i) => fetch(clipUrl(script.id, callClip(i))).catch(() => {}))
  fetch(clipUrl(script.id, 'outro')).catch(() => {})
}
function play(a: HTMLAudioElement | null, src: string, rate: number) {
  if (!a) return
  if (src) a.src = src
  a.currentTime = 0
  a.playbackRate = rate
  a.muted = muted
  a.play().catch(() => {})
}
const stopAll = () => { for (const a of [voice, crowd, bell]) a?.pause() }

// Where the voice is in `src`, in seconds — from the audio itself when it's playing (muted
// counts), else `fallback` (blocked or not loaded yet), so the words still come up on time.
function voiceAt(src: string, fallback: number) {
  if (voice && voice.src.endsWith(src) && (!voice.paused || voice.currentTime > 0)) return voice.currentTime
  return fallback
}

// Without measured timings (demo-race-words.json, from scripts/generate-race-calls.mjs), spread
// the words over the clip by length, with a breath between speakers.
function estimate(lines: Line[], secs: number): Timings {
  const BREATH = 0.4
  const chars = lines.reduce((n, l) => n + l.text.length, 0)
  const perChar = Math.max(0.01, (secs - 0.3 - BREATH * (lines.length - 1)) / chars)
  let t = 0
  return lines.map(l => {
    let off = 0
    const starts = l.text.split(' ').map(w => { const s = t + off * perChar; off += w.length + 1; return s })
    t += l.text.length * perChar + BREATH
    return starts
  })
}

// The order of the field at each call: the horses Vicky names, in her order, then the rest in
// their finishing order — except the back marker, held last until a later call names it.
// Gordo's shout doesn't set an order: the field is already turning while he yells.
function keyframes(script: DemoScript, starts: number[], winnerMs: number) {
  const frames: { t: number; rank: Map<number, number> }[] = []
  const named = new Set<number>()
  let back: number | undefined
  script.race.forEach((line, i) => {
    if (line.back) back = line.back
    line.front.forEach(n => named.add(n))
    if (!line.front.length || line.who === 'gordon') return
    let rest = script.finish.filter(n => !line.front.includes(n))
    if (back && !named.has(back)) rest = [...rest.filter(n => n !== back), back]
    frames.push({ t: starts[i], rank: new Map([...line.front, ...rest].map((n, r) => [n, r])) })
  })
  frames.push({ t: winnerMs, rank: new Map(script.finish.map((n, r) => [n, r])) })
  return frames
}

// The public demo's race, acted out to Vicky and Gordo's pre-recorded call: the banter before
// the jump, then each call plays back to back while the field moves into the order she's
// calling, then the banter after the line over the results. The caption shows the line being
// spoken, a word at a time. Practice only, like PracticeRaceModal — never the real Cup.
export function ScriptedRaceModal({ script, runners, winners, onClose, cta }: {
  script: DemoScript; runners: Runner[]; winners: Winner[]; onClose: () => void; cta?: ReactNode
}) {
  const clips = (AUDIO as unknown as Record<string, Clips>)[script.id]
  const [phase, setPhase] = useState<'intro' | 'race' | 'done'>('intro')
  const [run, setRun] = useState(0)     // bumped by Watch again — restarts the race clock
  const [ms, setMs] = useState(0)       // time into the current phase
  const [sound, setSound] = useState(!muted)

  const starts = useMemo(() => {
    let t = 0
    return clips.race.map(s => { const at = t; t += (s * 1000) / RATE; return at })
  }, [clips])
  const winnerMs = starts[starts.length - 1] + (clips.race[clips.race.length - 1] * 1000) / RATE - 300
  const finishMs = winnerMs * (1 + (runners.length - 1) * GAP)   // the last horse home
  const frames = useMemo(() => keyframes(script, starts, winnerMs), [script, starts, winnerMs])
  const timings = useMemo(() => {
    const words = (WORDS as unknown as Record<string, ClipWords>)[script.id] ?? {}
    return {
      intro: words.intro ?? estimate(script.intro, clips.intro),
      race: script.race.map((l, i) => words.race?.[i] ?? estimate([l], clips.race[i])),
      outro: words.outro ?? estimate(script.outro, clips.outro),
    }
  }, [script, clips])

  // One clock for every phase, restarted at each.
  useEffect(() => {
    setMs(0)
    let frame = 0, last: number | null = null
    const tick = (now: number) => {
      const dt = last == null ? 0 : now - last
      last = now
      setMs(t => t + dt)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [phase, run])

  // Before the jump: the banter (already started by the tap — restarted only if something
  // stopped it, e.g. React's dev double-mount), then they're off when it ends.
  useEffect(() => {
    if (phase === 'intro' && voice?.paused) play(voice, clipUrl(script.id, 'intro'), 1)
  }, [phase, script.id])
  useEffect(() => {
    if (phase === 'intro' && ms >= clips.intro * 1000 + 400) setPhase('race')
  }, [phase, ms, clips])

  const simMs = phase === 'race' ? Math.min(ms, finishMs) : 0
  const lastPlayed = useRef(-1)
  useEffect(() => {
    if (phase !== 'race') return
    lastPlayed.current = -1
    play(bell, '', 1)
    if (crowd) { crowd.volume = 0.25; play(crowd, '', 1) }
  }, [phase, run])

  // Each call starts on its slot, back to back.
  const callIdx = phase === 'race' ? starts.filter(s => simMs >= s).length - 1 : -1
  useEffect(() => {
    if (callIdx < 0 || callIdx === lastPlayed.current || ms > finishMs) return
    lastPlayed.current = callIdx
    play(voice, clipUrl(script.id, callClip(callIdx)), RATE)
  }, [callIdx, script.id, ms, finishMs])

  useEffect(() => {
    if (phase === 'race' && ms >= finishMs + HOLD_MS) setPhase('done')
  }, [phase, ms, finishMs])
  useEffect(() => {
    if (phase !== 'done') return
    confetti({ particleCount: 140, spread: 80, origin: { y: 0.35 }, zIndex: 9999 })
    play(voice, clipUrl(script.id, 'outro'), 1)
    const t = setTimeout(() => crowd?.pause(), 3000)
    return () => clearTimeout(t)
  }, [phase, script.id])
  useEffect(() => stopAll, [])

  // Place (0 = leading) of horse `n` at time t — eased between the called orders.
  const rankAt = (n: number, t: number) => {
    const k = frames.findIndex(f => f.t > t)
    if (k === 0) return frames[0].rank.get(n)!
    if (k === -1) return frames[frames.length - 1].rank.get(n)!
    const a = frames[k - 1], b = frames[k]
    const x = (t - a.t) / (b.t - a.t), e = x * x * (3 - 2 * x)
    return a.rank.get(n)! + (b.rank.get(n)! - a.rank.get(n)!) * e
  }
  // Steady pace for the leader; everyone else a place-sized gap behind, opening up after the jump.
  const progress = (n: number) => {
    if (phase === 'intro') return 0
    if (phase === 'done') return 1
    const spread = Math.min(1, simMs / (0.1 * winnerMs))
    return Math.min(1, Math.max(0, simMs / winnerMs - rankAt(n, simMs) * GAP * spread))
  }

  // The caption: which line is being spoken, and how far into it the voice is.
  const caption = (() => {
    if (phase === 'race') {
      const i = Math.max(0, callIdx)
      const fallback = ((simMs - starts[i]) / 1000) * RATE
      return { line: script.race[i], at: timings.race[i][0], t: voiceAt(clipUrl(script.id, callClip(i)), fallback) }
    }
    const [lines, at, clip] = phase === 'intro'
      ? [script.intro, timings.intro, 'intro'] : [script.outro, timings.outro, 'outro']
    const t = voiceAt(clipUrl(script.id, clip), ms / 1000)
    const k = Math.max(0, at.findLastIndex(w => w[0] <= t))
    return { line: lines[k], at: at[k], t }
  })()

  const lanes = [...runners].sort((a, b) => a.number - b.number)
  const mine = runners.find(r => r.mine)
  const minePlace = mine && phase === 'race' && simMs > 0
    ? [...runners].sort((a, b) => progress(b.number) - progress(a.number)).findIndex(r => r.mine) + 1 : 0

  const toggleSound = () => {
    muted = sound
    for (const a of [voice, crowd, bell]) if (a) a.muted = muted
    setSound(!muted)
  }
  const skip = () => {
    voice?.pause()
    if (phase === 'intro') setPhase('race')
    else { lastPlayed.current = starts.length; setMs(finishMs) }
  }
  const restart = () => { setPhase('race'); setRun(r => r + 1) }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-3">
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl max-h-[95vh] overflow-y-auto"
        style={{ background: 'linear-gradient(160deg, #0a2e1c 0%, #153d26 50%, #0d3320 100%)' }}>
        <div className="px-4 pt-4 pb-2 flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-widest text-amber-300">🧪 Practice race</p>
          <div className="flex gap-1.5">
            <button onClick={toggleSound} aria-label={sound ? 'Mute the callers' : 'Hear the callers'}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${sound ? 'bg-amber-400 text-emerald-950' : 'text-white/70 border border-white/25'}`}>
              {sound ? '🔊' : '🔇'}
            </button>
            {phase !== 'done' && (
              <button onClick={skip}
                className="text-[11px] font-bold px-2.5 py-1 rounded-full text-white/70 border border-white/25">
                {phase === 'intro' ? 'To the jump ⏭' : 'Skip ⏭'}
              </button>
            )}
          </div>
        </div>

        {/* One line at a time, each word showing as it's said — the unsaid ones hold their
            place (invisible), so the line doesn't reflow as it fills in. */}
        <div className="px-4 pb-3 min-h-[5rem]">
          <p className="text-white font-black text-base" aria-label={`${NAMES[caption.line.who]}: ${caption.line.text}`}>
            <span className={caption.line.who === 'gordon' ? 'text-amber-300' : 'text-emerald-300'}>
              {caption.line.who === 'gordon' ? '🍺' : '🎙️'} {NAMES[caption.line.who]}:
            </span>{' '}
            {caption.line.text.split(' ').map((w, i) => (
              <span key={i} aria-hidden className={`transition-opacity duration-150 ${(caption.at[i] ?? 0) <= caption.t ? 'opacity-100' : 'opacity-0'}`}>{w} </span>
            ))}
          </p>
          {minePlace > 0 && mine && (
            <p className="text-xs text-emerald-200 mt-1">Yours: #{mine.number} {mine.name} — running {ordinal(minePlace)}</p>
          )}
        </div>

        {phase !== 'done' ? (
          <div className="px-3 pb-4 space-y-1">
            {lanes.map(r => {
              const p = progress(r.number)
              const placed = p >= 1 && r.position <= 3
              return (
                <div key={r.id} className={`relative h-6 rounded-md overflow-hidden ${r.mine ? 'bg-emerald-400/25 ring-1 ring-emerald-300/60' : 'bg-white/[0.06]'}`}>
                  <span className="absolute top-0 bottom-0 w-px bg-white/40" style={{ right: POST }} />
                  {placed && (
                    <span className={`absolute right-1 top-1/2 -translate-y-1/2 text-[10px] font-black px-1 py-0.5 rounded leading-none ${PLACE_STYLE[r.position - 1]}`}>
                      {ordinal(r.position)}
                    </span>
                  )}
                  {/* The name rides with its horse: the field starts a gutter in so every tag fits
                      behind it, and runs to the post. 🏇 faces left — mirrored to run left to right. */}
                  <span className="absolute top-1/2 -translate-y-1/2 leading-none"
                    style={{ left: `calc(${TAG} + ${p} * (100% - ${TAG} - ${POST} - 1.25rem))` }}>
                    <span className={`absolute right-full mr-0.5 top-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] ${r.mine ? 'font-black text-emerald-200' : 'text-white/70'}`}>
                      {r.mine ? '⭐ ' : ''}{r.name}
                    </span>
                    <span className="inline-block text-base" style={{ transform: 'scaleX(-1)' }}>🏇</span>
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="px-4 pb-4 space-y-3">
            <div className="bg-white rounded-xl p-4 space-y-2">
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
            {cta}
          </div>
        )}

        <div className="px-4 pb-4 flex justify-end gap-2">
          {phase === 'done' && (
            <button onClick={restart} className="text-sm font-bold text-white/80 px-3 py-2">▶ Watch again</button>
          )}
          <button onClick={() => { stopAll(); onClose() }} className="bg-amber-400 hover:bg-amber-300 text-emerald-950 text-sm font-black px-4 py-2 rounded-xl">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
