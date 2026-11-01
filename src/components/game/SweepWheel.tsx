'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type Horse = { id: string; number: number; name: string; scratched: boolean; finish_position: number | null }
type PickResult = { ok: boolean; horse?: Horse; error?: string }

// TribePicks brand: the dark-green hero card, emerald slices, gold for the "pick" moment.
const BRAND_BG = 'linear-gradient(160deg, #0a2e1c 0%, #153d26 50%, #0d3320 100%)'
const SLICES   = ['#16a34a', '#0f6b34']   // alternating emerald, light / deep
const GOLD     = '#fbbf24'
const UNLOCK_CLIP = '/race-calls/sfx/bell.mp3'   // any small clip — played muted, only to unlock sound on phones

// Smoothstep ease — natural accel/decel, no overshoot.
const smoothstep = (x: number) => x * x * (3 - 2 * x)

/** A spin-the-wheel horse draw, in the TribePicks greens. Starts slow (field is readable), accelerates
 *  until it's spinning too fast to track, then prompts a tap. The tap asks the SERVER to
 *  draw (onDraw — a uniform random pick; the client never chooses the horse), and the wheel
 *  then eases the slice under the gold pointer to a stop — that's your horse. `slots` is how many horses are still undrawn —
 *  only a count, never which ones: every segment is an identical horse icon, so the wheel
 *  can't reveal the undrawn field. You see the horse you drew; who drew what across the
 *  pool stays hidden until the pool closes. */
// `resultNote` replaces the line under "You drew" (the public demo has no pool to fill).
// `resultAction` — what tapping the wheel does once it's landed, labelled on the hub (the
// public demo's "Run the race"). A click, not a pointerdown: phones only unlock sound on one.
// `announce` — the clip(s) that call out the drawn horse (Vicky's "you drew", then sometimes
// Gordo), played in turn as the wheel lands, or null for none. The taps that spun it unlock
// the element on phones.
export function SweepWheel({ slots, onDraw, resultNote, resultAction, announce }: {
  slots: number; onDraw: () => Promise<PickResult>; resultNote?: string
  resultAction?: { label: string; onClick: () => void }
  announce?: (horse: Horse) => string[] | null
}) {
  const n = slots
  // Drawn segments: at least 2 — a lone 360° segment renders as nothing (an arc that starts
  // and ends at the same point), so the last horse would spin an empty wheel. The segments
  // are identical icons, so an extra one is purely visual; `n` stays the real count.
  const shown = Math.max(n, 2)
  const segments = useMemo(() => Array.from({ length: shown }, (_, i) => i), [shown])
  const wheelRef  = useRef<SVGGElement>(null)
  const frameRef  = useRef<number>(0)
  const startRef  = useRef<number>(0)
  const lastRef   = useRef<number | null>(null)   // last tick timestamp, for dt
  const angleRef  = useRef<number>(0)              // current rotation, degrees
  const velRef    = useRef<number>(30)
  const containerRef = useRef<HTMLDivElement>(null)
  const callRef   = useRef<HTMLAudioElement | null>(null)   // the "you drew" call
  const queueRef  = useRef<string[]>([])                     // what it said, for "Hear it again"

  const [phase, setPhase]   = useState<'idle' | 'spinning' | 'fast' | 'settling' | 'result'>('idle')
  const [spinKey, setSpinKey] = useState(0)   // bumped only by startSpin — the loop's sole trigger
  const [result, setResult] = useState<PickResult | null>(null)
  const [hover, setHover]   = useState(false)

  const segAngle = 360 / shown

  // Keyed on spinKey (bumped only by startSpin) rather than `phase` — the loop itself
  // flips phase to 'fast' partway through, and depending on `phase` here would re-trigger
  // this effect on that flip, resetting startRef and restarting the ramp from zero right
  // when it's supposed to be at full speed. One effect instance per spin, full stop.
  useEffect(() => {
    if (spinKey === 0) return   // idle — nothing started yet
    startRef.current = performance.now()
    lastRef.current  = null
    let fastFired = false

    const RAMP_MS    = 4200
    const MAX_SPEED   = 1250   // deg/s at full tilt
    const PULSE_AMP   = 70
    const PULSE_HZ    = 2.1
    const FAST_SPEED  = 480    // deg/s threshold where it's unreadable -> prompt tap

    function tick(now: number) {
      const t = now - startRef.current
      const progress = Math.min(1, t / RAMP_MS)
      const eased = smoothstep(progress)
      const base = 25 + eased * MAX_SPEED
      const pulse = PULSE_AMP * eased * Math.sin((t / 1000) * PULSE_HZ * 2 * Math.PI)
      const v = Math.max(15, base + pulse)
      velRef.current = v

      const dt = lastRef.current == null ? 1 / 60 : (now - lastRef.current) / 1000
      lastRef.current = now
      angleRef.current = (angleRef.current + v * dt) % 360

      if (wheelRef.current) {
        wheelRef.current.style.transform = `rotate(${angleRef.current}deg)`
      }
      if (containerRef.current) {
        const blur = Math.min(3.5, (v / MAX_SPEED) * 3.5)
        containerRef.current.style.filter = blur > 0.3 ? `blur(${blur}px)` : 'none'
      }

      if (v >= FAST_SPEED && !fastFired) { fastFired = true; setPhase('fast') }
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameRef.current)
  }, [spinKey])

  function startSpin() {
    setResult(null)
    setPhase('spinning')
    setSpinKey(k => k + 1)
  }

  // Tapping the wheel or the prompt below it stops the wheel; the slice under the gold pointer
  // at the top is the one that's "yours" (the slices are identical, so it reveals nothing).
  async function handleTap() {
    if (phase !== 'fast' || n === 0 || !containerRef.current) return
    setPhase('settling')   // blocks a second tap; the wheel keeps spinning while we draw
    const screenAngle = 0   // the pointer, at 12 o'clock

    const res = await onDraw()
    cancelAnimationFrame(frameRef.current)
    if (containerRef.current) containerRef.current.style.filter = 'none'

    // Settle: ease the segment under the pointer onto its centre, so the stop feels
    // intentional rather than an abrupt freeze-frame. Segments are identical horse icons,
    // so where it stops reveals nothing — the drawn horse shows in the result below.
    const idx = res.ok && res.horse ? Math.floor(((screenAngle - angleRef.current) % 360 + 360) % 360 / segAngle) % shown : -1
    if (idx >= 0 && wheelRef.current) {
      const targetRotation = screenAngle - (idx * segAngle + segAngle / 2)
      wheelRef.current.style.transition = 'transform 550ms cubic-bezier(0.17, 0.84, 0.44, 1)'
      wheelRef.current.style.transform = `rotate(${targetRotation}deg)`
      angleRef.current = targetRotation
      await new Promise(r => setTimeout(r, 600))
    }
    setResult(res)
    setPhase('result')
    if (wheelRef.current) wheelRef.current.style.transition = ''
    playCall(res.ok ? res.horse : undefined)
  }

  // Phones only let an element play once a tap has started it: each tap's click starts the
  // call element silently, so it can speak when the wheel lands (after an await, outside the tap).
  // It plays a real (muted) clip: an empty element's play() just waits, and would pause the
  // call itself when that finally loads. And it only pauses if that clip's still the one loaded.
  function unlockCall() {
    if (!announce) return
    const a = (callRef.current ??= new Audio())
    if (!a.paused) return
    a.src = UNLOCK_CLIP
    a.muted = true
    a.play().then(() => { if (a.src.endsWith(UNLOCK_CLIP)) { a.pause(); a.muted = false } }).catch(() => {})
  }
  // Plays the clips one after another on the one unlocked element. `again` replays what was
  // said, rather than drawing a fresh Gordo line.
  function playCall(horse?: Horse, again = false) {
    const clips = again ? queueRef.current : (horse && announce?.(horse)) || []
    const a = callRef.current
    if (!clips.length || !a) return
    queueRef.current = clips
    let i = 0
    const next = () => {
      if (i >= clips.length) { a.onended = null; return }
      a.src = clips[i++]
      a.muted = false
      a.currentTime = 0
      a.play().catch(() => {})
    }
    a.onended = next
    next()
  }
  useEffect(() => () => callRef.current?.pause(), [])

  // Only once a horse is drawn — never during the spin, so the stopping tap can't also fire it.
  const action = phase === 'result' && result?.ok ? resultAction : undefined

  if (n === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">No horses left to pick — the pool's full.</p>
  }

  const r = 150
  const cxp = 160, cyp = 160

  return (
    <div className="flex flex-col items-center">
      {/* The wheel itself is the button: tap to spin it, tap again to stop it — and, with a
          `resultAction`, tap once more for what's next. */}
      <div
        ref={containerRef}
        role="button"
        tabIndex={phase === 'idle' || phase === 'fast' || action ? 0 : -1}
        aria-label={phase === 'idle' ? 'Spin the wheel for your horse' : phase === 'fast' ? 'Stop the wheel' : action ? action.label : 'The wheel'}
        onPointerDown={phase === 'fast' ? handleTap : phase === 'idle' ? startSpin : undefined}
        onClick={() => { unlockCall(); action?.onClick() }}
        onKeyDown={e => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          if (phase === 'fast') handleTap()
          else if (phase === 'idle') startSpin()
          else action?.onClick()
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="relative rounded-3xl overflow-hidden select-none"
        style={{
          width: 320, height: 320,
          background: BRAND_BG,
          cursor: phase === 'fast' || phase === 'idle' || action ? 'pointer' : 'default',
          boxShadow: hover ? '0 10px 40px rgba(10,46,28,0.45)' : '0 8px 32px rgba(10,46,28,0.3)',
          transition: 'box-shadow 300ms ease',
        }}
      >
        {/* The hero card's diagonal texture, so the wheel reads as part of the app. */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.05,
          backgroundImage: 'repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)',
          backgroundSize: '12px 12px',
        }} />

        {/* Wheel */}
        <svg viewBox="0 0 320 320" width={320} height={320} className="absolute inset-0">
          <defs>
            {/* The hub shows the globe only (public/logo-mark.png, cropped from logo.png) — the
                full logo's "TribePicks.com" wordmark is unreadable at hub size. */}
            <clipPath id="sweep-hub-clip"><circle cx={160} cy={160} r={28} /></clipPath>
            <filter id="sweep-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#000" floodOpacity="0.35" />
            </filter>
          </defs>
          <g ref={wheelRef} style={{ transformOrigin: '160px 160px' }}>
            {segments.map(i => {
              const a0 = (i * segAngle - 90) * Math.PI / 180
              const a1 = ((i + 1) * segAngle - 90) * Math.PI / 180
              const x0 = cxp + r * Math.cos(a0), y0 = cyp + r * Math.sin(a0)
              const x1 = cxp + r * Math.cos(a1), y1 = cyp + r * Math.sin(a1)
              const large = segAngle > 180 ? 1 : 0
              // An odd count would put two same-colour slices side by side at the seam.
              const color = shown % 2 && i === shown - 1 ? '#22c55e' : SLICES[i % 2]
              const mid = (a0 + a1) / 2
              // The horse grows with its slice: sized to the slice's width at the icon's radius,
              // capped by the wheel's depth — 24 runners ≈ 14px, the last two ≈ 64px.
              const lr = r * 0.6
              const chord = 2 * lr * Math.sin(Math.min(Math.PI / 2, (segAngle * Math.PI / 180) / 2))
              const iconSize = Math.round(Math.max(12, Math.min(64, chord * 0.55)))
              const lx = cxp + lr * Math.cos(mid), ly = cyp + lr * Math.sin(mid)
              return (
                <g key={i}>
                  <path
                    d={`M${cxp},${cyp} L${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} Z`}
                    fill={color} stroke="#ffffff" strokeOpacity={0.55} strokeWidth={1.5}
                  />
                  {/* A horse icon, never the number — numbers would show which horses are
                      still undrawn. The drawn horse is only revealed after the spin. */}
                  {segAngle > 8 && (
                    <text x={lx} y={ly} fontSize={iconSize}
                      textAnchor="middle" dominantBaseline="middle"
                      transform={`rotate(${(mid * 180 / Math.PI) + 90}, ${lx}, ${ly})`}>
                      🐎
                    </text>
                  )}
                </g>
              )
            })}
          </g>
          {/* Rim, hub (the TribePicks logo) and a gold pointer at the top. */}
          <circle cx={cxp} cy={cyp} r={r} fill="none" stroke={GOLD} strokeWidth={3} filter="url(#sweep-shadow)" />
          <circle cx={cxp} cy={cyp} r={32} fill="#ffffff" stroke={GOLD} strokeWidth={3} filter="url(#sweep-shadow)" />
          <image href="/logo-mark.png" x={cxp - 28} y={cyp - 28} width={56} height={56} clipPath="url(#sweep-hub-clip)" preserveAspectRatio="xMidYMid slice" />
          <path d={`M${cxp - 11},2 L${cxp + 11},2 L${cxp},${cyp - r + 14} Z`} fill={GOLD} stroke="#ffffff" strokeWidth={1.5} filter="url(#sweep-shadow)" />
        </svg>
        {/* On the wheel while it's still — once it moves, the motion blur would smear it. */}
        {(phase === 'idle' || action) && (
          // Centred on the hub. The pulse animates `transform`, so the centring sits on a wrapper.
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <span className="block bg-amber-400 text-emerald-950 text-xs font-black tracking-wide uppercase px-3 py-2 rounded-full shadow-lg whitespace-nowrap ring-2 ring-white"
              style={{ animation: 'sweep-hub 0.9s ease-in-out infinite' }}>
              {phase === 'idle' ? '👆 Tap to spin' : action!.label}
            </span>
          </span>
        )}
      </div>

      {/* Tap prompt — below the wheel, not on it: the container's motion blur would smear it. */}
      {phase === 'fast' && (
        <button type="button" onPointerDown={handleTap}
          className="mt-5 bg-amber-400 text-emerald-950 text-base font-black tracking-widest uppercase px-6 py-3 rounded-xl select-none"
          style={{ animation: 'sweep-prompt 0.7s ease-in-out infinite' }}>
          👆 Tap to stop the wheel!
        </button>
      )}

      {(phase === 'spinning') && (
        <p className="mt-4 text-xs text-gray-400">Watch the field… it'll speed up.</p>
      )}
      {phase === 'settling' && (
        <p className="mt-4 text-xs text-gray-400">Locking it in…</p>
      )}
      {phase === 'result' && result && (
        result.ok && result.horse ? (
          <div className="mt-5 text-center">
            <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wide mb-1">You drew</p>
            <p className="text-xl font-black text-gray-900 flex items-center justify-center gap-2">
              {/* 🏇 faces left — mirrored so it runs the same way as the race */}
              <span className="inline-block text-2xl" style={{ transform: 'scaleX(-1)' }} aria-hidden>🏇</span>
              #{result.horse.number} {result.horse.name}
            </p>
            {queueRef.current.length > 0 && (
              <button onClick={() => playCall(result.horse, true)}   // a tap of its own — no unlock needed (its pause would cut this off)
               
                className="mt-1 text-xs font-semibold text-emerald-700 hover:underline">{queueRef.current.some(c => !c.includes('/gordo/')) ? '🔊 Hear Vicky call it' : '🔊 Hear Gordo again'}</button>
            )}
            {/* Drawing the last horse closes the pool — the full draw is visible right away then. */}
            <p className="text-xs text-gray-500 mt-1">
              {resultNote ?? (n === 1 ? '🎉 That was the last horse — the full draw is now open in the app.' : "🔒 You'll see who drew every horse once the pool fills.")}
            </p>
          </div>
        ) : (
          <div className="mt-5 text-center">
            <p className="text-sm text-red-500 mb-2">{result.error ?? 'Something went wrong'}</p>
            <button onClick={startSpin} className="text-sm font-bold text-emerald-600 hover:underline">Spin again →</button>
          </div>
        )
      )}

      <style jsx>{`
        @keyframes sweep-prompt {
          0%, 100% { opacity: 1;    transform: scale(1.06); box-shadow: 0 0 24px 4px rgba(251,191,36,0.7); }
          50%      { opacity: 0.4;  transform: scale(1);    box-shadow: 0 0 0 0 rgba(251,191,36,0); }
        }
        /* On the hub the label sits over the logo, so it pulses by size and glow, never fading. */
        @keyframes sweep-hub {
          0%, 100% { transform: scale(1.08); box-shadow: 0 0 22px 4px rgba(251,191,36,0.75); }
          50%      { transform: scale(1);    box-shadow: 0 0 0 0 rgba(251,191,36,0); }
        }
      `}</style>
    </div>
  )
}
