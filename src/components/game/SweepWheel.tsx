'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type Horse = { id: string; number: number; name: string; scratched: boolean; finish_position: number | null }
type PickResult = { ok: boolean; horse?: Horse; error?: string }

const NEON = ['#22d3ee', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#60a5fa']

// Smoothstep ease — natural accel/decel, no overshoot.
const smoothstep = (x: number) => x * x * (3 - 2 * x)

/** A futuristic spin-the-wheel horse draw. Starts slow (field is readable), accelerates
 *  until it's spinning too fast to track, then prompts a tap. The tap asks the SERVER to
 *  draw (onDraw — a uniform random pick; the client never chooses the horse), and the wheel
 *  then eases onto the drawn horse's segment right under the tap point, so it still feels
 *  like "where you tapped is what you got". `slots` is how many horses are still undrawn —
 *  only a count, never which ones: every segment is an identical horse icon, so the wheel
 *  can't reveal the undrawn field. You see the horse you drew; who drew what across the
 *  pool stays hidden until the pool closes. */
export function SweepWheel({ slots, onDraw }: {
  slots: number; onDraw: () => Promise<PickResult>
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

  const [phase, setPhase]   = useState<'idle' | 'spinning' | 'fast' | 'settling' | 'result'>('idle')
  const [spinKey, setSpinKey] = useState(0)   // bumped only by startSpin — the loop's sole trigger
  const [result, setResult] = useState<PickResult | null>(null)
  const [hover, setHover]   = useState(false)

  // Generated once — a lightweight CSS starfield (no canvas needed).
  const stars = useMemo(() => {
    const layers = [1, 2, 3].map(size => {
      const count = size === 1 ? 90 : size === 2 ? 50 : 24
      const shadows: string[] = []
      for (let i = 0; i < count; i++) {
        shadows.push(`${Math.round(Math.random() * 100)}vw ${Math.round(Math.random() * 100)}vh #fff`)
      }
      return { size, boxShadow: shadows.join(',') }
    })
    return layers
  }, [])

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

  // Tapping the wheel or the prompt below it — the angle is always measured from the wheel's
  // centre, so a tap on the prompt picks the segment at the bottom.
  async function handleTap(e: React.PointerEvent<HTMLElement>) {
    if (phase !== 'fast' || n === 0 || !containerRef.current) return
    setPhase('settling')   // blocks a second tap; the wheel keeps spinning while we draw

    const rect = containerRef.current.getBoundingClientRect()
    const dx = e.clientX - (rect.left + rect.width / 2)
    const dy = e.clientY - (rect.top + rect.height / 2)
    const screenAngle = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360

    const res = await onDraw()
    cancelAnimationFrame(frameRef.current)
    if (containerRef.current) containerRef.current.style.filter = 'none'

    // Settle: ease the segment under the tap point onto its centre, so the stop feels
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
  }

  if (n === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">No horses left to pick — the pool's full.</p>
  }

  const r = 150
  const cxp = 160, cyp = 160

  return (
    <div className="flex flex-col items-center">
      <div
        ref={containerRef}
        onPointerDown={phase === 'fast' ? handleTap : undefined}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="relative rounded-3xl overflow-hidden select-none"
        style={{
          width: 320, height: 320,
          background: 'radial-gradient(ellipse at 50% 30%, #0b0a26 0%, #050414 60%, #020208 100%)',
          cursor: phase === 'fast' ? 'pointer' : 'default',
          transform: 'perspective(900px) rotateX(8deg)',
          boxShadow: hover
            ? '0 0 60px 6px rgba(34,211,238,0.35), inset 0 0 40px rgba(167,139,250,0.08)'
            : '0 0 32px 2px rgba(34,211,238,0.18), inset 0 0 30px rgba(167,139,250,0.05)',
          transition: 'box-shadow 300ms ease',
        }}
      >
        {/* Starfield */}
        {stars.map((layer, i) => (
          <div key={i} style={{
            position: 'absolute', top: 0, left: 0, width: 2 * layer.size, height: 2 * layer.size,
            borderRadius: '50%', background: 'transparent', boxShadow: layer.boxShadow,
            opacity: 0.8 - i * 0.15,
            animation: `sweep-twinkle ${3 + i}s ease-in-out infinite alternate`,
          }} />
        ))}

        {/* Wheel */}
        <svg viewBox="0 0 320 320" width={320} height={320} className="absolute inset-0">
          <defs>
            <filter id="sweep-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation={hover ? 4.5 : 2.5} result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g ref={wheelRef} style={{ transformOrigin: '160px 160px' }}>
            {segments.map(i => {
              const a0 = (i * segAngle - 90) * Math.PI / 180
              const a1 = ((i + 1) * segAngle - 90) * Math.PI / 180
              const x0 = cxp + r * Math.cos(a0), y0 = cyp + r * Math.sin(a0)
              const x1 = cxp + r * Math.cos(a1), y1 = cyp + r * Math.sin(a1)
              const large = segAngle > 180 ? 1 : 0
              const color = NEON[i % NEON.length]
              const mid = (a0 + a1) / 2
              const lx = cxp + r * 0.68 * Math.cos(mid), ly = cyp + r * 0.68 * Math.sin(mid)
              return (
                <g key={i}>
                  <path
                    d={`M${cxp},${cyp} L${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} Z`}
                    fill={color} fillOpacity={0.14} stroke={color} strokeOpacity={0.85}
                    strokeWidth={1.25} filter="url(#sweep-glow)"
                  />
                  {/* A horse icon, never the number — numbers would show which horses are
                      still undrawn. The drawn horse is only revealed after the spin. */}
                  {segAngle > 8 && (
                    <text x={lx} y={ly} fontSize={segAngle > 20 ? 18 : 13}
                      textAnchor="middle" dominantBaseline="middle"
                      transform={`rotate(${(mid * 180 / Math.PI) + 90}, ${lx}, ${ly})`}>
                      🐎
                    </text>
                  )}
                </g>
              )
            })}
          </g>
          {/* Hub */}
          <circle cx={cxp} cy={cyp} r={22} fill="#0a0a1f" stroke="#22d3ee" strokeWidth={1.5}
            filter="url(#sweep-glow)" style={{ animation: 'sweep-pulse 1.6s ease-in-out infinite' }} />
        </svg>
      </div>

      {/* Tap prompt — below the wheel, not on it: the container's motion blur would smear it. */}
      {phase === 'fast' && (
        <button type="button" onPointerDown={handleTap}
          className="mt-5 bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-white text-base font-black tracking-widest uppercase px-6 py-3 rounded-xl select-none"
          style={{ animation: 'sweep-prompt 0.7s ease-in-out infinite' }}>
          👆 Tap the wheel to pick!
        </button>
      )}

      {phase === 'idle' && (
        <button onClick={startSpin}
          className="mt-5 bg-gradient-to-r from-cyan-500 to-fuchsia-500 hover:brightness-110 text-white text-sm font-black px-6 py-3 rounded-xl shadow-lg">
          Spin for your horse →
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
            <p className="text-xs text-emerald-400 font-semibold uppercase tracking-wide mb-1">You drew</p>
            <p className="text-xl font-black text-gray-900">#{result.horse.number} {result.horse.name}</p>
            {/* Drawing the last horse closes the pool — the full draw is visible right away then. */}
            <p className="text-xs text-gray-500 mt-1">
              {n === 1 ? '🎉 That was the last horse — the full draw is now open in the app.' : "🔒 You'll see who drew every horse once the pool fills."}
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
        @keyframes sweep-twinkle { from { opacity: 0.25; } to { opacity: 0.9; } }
        @keyframes sweep-pulse {
          0%, 100% { filter: url(#sweep-glow) drop-shadow(0 0 2px #22d3ee); }
          50%      { filter: url(#sweep-glow) drop-shadow(0 0 10px #22d3ee); }
        }
        @keyframes sweep-prompt {
          0%, 100% { opacity: 1;    transform: scale(1.06); box-shadow: 0 0 24px 4px rgba(34,211,238,0.7); }
          50%      { opacity: 0.35; transform: scale(1);    box-shadow: 0 0 0 0 rgba(34,211,238,0); }
        }
      `}</style>
    </div>
  )
}
