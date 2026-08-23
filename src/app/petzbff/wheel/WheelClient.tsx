'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type Screen = 'gate' | 'spinning' | 'result'
interface Prize { id: string; label: string; valueCents: number }

// The visual wheel. This is cosmetic — the SERVER decides the prize; we just spin the wheel
// so its pointer lands on a segment whose prizeId matches. Every prize id the server can
// return needs at least one segment here (mat, container, bag, sweet, none).
const SEGMENTS: { id: string; label: string; fill: string; ink: string }[] = [
  { id: 'mat',       label: 'Feeder mat',  fill: '#e08151', ink: '#fff' },
  { id: 'sweet',     label: 'Sweets',      fill: '#c2ccb1', ink: '#1c1c1c' },
  { id: 'bag',       label: 'Bag roll',    fill: '#efddc9', ink: '#1c1c1c' },
  { id: 'container', label: 'Container',   fill: '#d9a066', ink: '#fff' },
  { id: 'sweet',     label: 'Sweets',      fill: '#c2ccb1', ink: '#1c1c1c' },
  { id: 'bag',       label: 'Bag roll',    fill: '#efddc9', ink: '#1c1c1c' },
  { id: 'none',      label: 'So close!',   fill: '#e7ded3', ink: '#1c1c1c' },
  { id: 'bag',       label: 'Bag roll',    fill: '#efddc9', ink: '#1c1c1c' },
]
const N = SEGMENTS.length
const SEG = 360 / N
const SPIN_MS = 4200
const DEVICE_KEY = 'pbff_wheel_played_v1'   // one play per device (belt-and-braces with the per-email server rule)

// SVG helpers: build one wedge path for segment i on a unit-ish circle (radius 100, centre 110).
function wedgePath(i: number): string {
  const c = 110, r = 100
  const a0 = (i * SEG - 90) * (Math.PI / 180)      // -90 so segment 0 starts at the top
  const a1 = ((i + 1) * SEG - 90) * (Math.PI / 180)
  const x0 = c + r * Math.cos(a0), y0 = c + r * Math.sin(a0)
  const x1 = c + r * Math.cos(a1), y1 = c + r * Math.sin(a1)
  return `M ${c} ${c} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`
}
function labelPos(i: number): { x: number; y: number; rot: number } {
  const c = 110, r = 66
  const mid = (i + 0.5) * SEG - 90
  const rad = mid * (Math.PI / 180)
  return { x: c + r * Math.cos(rad), y: c + r * Math.sin(rad), rot: mid }
}

export default function PetzBffWheelClient() {
  const [screen, setScreen]   = useState<Screen>('gate')
  const [email, setEmail]     = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState('')
  const [rotation, setRot]    = useState(0)
  const [prize, setPrize]     = useState<Prize | null>(null)
  const [already, setAlready] = useState(false)

  const sessionId = useRef<string>('')
  if (!sessionId.current && typeof crypto !== 'undefined') sessionId.current = crypto.randomUUID()

  const source = useMemo(() => {
    if (typeof window === 'undefined') return undefined
    return new URLSearchParams(window.location.search).get('ref') || 'wheel'
  }, [])

  // One play per device: if this browser has already spun, show that result straight away
  // rather than the gate, so the same phone can't be replayed with a fresh email. The server's
  // one-spin-per-email rule is the real guard; this closes the easy same-device loophole.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DEVICE_KEY)
      if (saved) {
        setPrize(JSON.parse(saved) as Prize)
        setAlready(true)
        setScreen('result')
      }
    } catch { /* private mode — fall back to the server's per-email guard */ }
  }, [])

  const spin = async () => {
    const addr = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(addr)) { setError('That email does not look right. Mind checking it?'); return }
    if (!consent) { setError('Tick the box to spin.'); return }

    setBusy(true); setError('')
    let res: any
    try {
      const r = await fetch('/api/petzbff-wheel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addr, consent, sessionId: sessionId.current, source }),
      })
      res = await r.json().catch(() => ({}))
      if (!r.ok || !res?.ok) throw new Error(res?.error || `http_${r.status}`)
    } catch (e: any) {
      setBusy(false)
      setError(e?.message === 'closed'
        ? 'The wheel is not open right now — come see us at the stand.'
        : e?.message === 'rate_limited'
          ? 'Steady on. Give it a moment and try again.'
          : 'Something went wrong spinning the wheel. Have another go in a moment.')
      return
    }

    const won: Prize = res.prize
    setPrize(won); setAlready(!!res.already)
    // Remember on this device so a refresh (or a second email) can't spin again.
    try { localStorage.setItem(DEVICE_KEY, JSON.stringify(won)) } catch { /* private mode */ }

    // Land the pointer (fixed at top) on a segment matching the won prize. Pick the segment
    // index, then rotate several full turns plus the offset that brings its centre to the top,
    // with a little jitter so repeat wins don't stop in the identical spot.
    let seg = SEGMENTS.findIndex(s => s.id === won.id)
    if (seg < 0) seg = 0
    const centre = (seg + 0.5) * SEG
    const jitter = (Math.floor((won.valueCents % (SEG - 8)) - (SEG - 8) / 2))  // deterministic-ish, no Math.random needed
    const target = rotation + 360 * 6 + (360 - centre) + jitter
    setScreen('spinning')
    setRot(target)
    window.setTimeout(() => { setScreen('result'); setBusy(false) }, SPIN_MS + 150)
  }

  const won = prize && prize.id !== 'none'

  return (
    <main className="mx-auto flex min-h-screen max-w-[560px] flex-col px-4 py-8 text-[#121212]">
      <div className="mb-5 rounded-2xl bg-gradient-to-r from-[#efddc9] to-[#c2ccb1] px-6 py-6 text-center">
        <p className="mb-1 text-xs font-bold uppercase tracking-[0.14em] opacity-75">PetzBFF</p>
        <h1 className="text-3xl font-black uppercase leading-tight sm:text-4xl">Spin to win</h1>
        <p className="mt-1 text-[15px]">Every spin wins a prize. Good luck! 🐾</p>
      </div>

      {/* The wheel — always visible, pointer pinned at the top */}
      <div className="relative mx-auto mb-6 w-full max-w-[320px]">
        <div className="absolute left-1/2 top-[-6px] z-10 -translate-x-1/2"
             style={{ width: 0, height: 0, borderLeft: '13px solid transparent', borderRight: '13px solid transparent', borderTop: '22px solid #121212' }} />
        <svg viewBox="0 0 220 220" className="w-full drop-shadow-sm"
             style={{ transform: `rotate(${rotation}deg)`, transition: screen === 'spinning' ? `transform ${SPIN_MS}ms cubic-bezier(.17,.67,.32,1)` : 'none' }}>
          <circle cx="110" cy="110" r="104" fill="#fff" stroke="#121212" strokeOpacity="0.15" strokeWidth="4" />
          {SEGMENTS.map((s, i) => (
            <path key={i} d={wedgePath(i)} fill={s.fill} stroke="#fff" strokeWidth="1.5" />
          ))}
          {SEGMENTS.map((s, i) => {
            const p = labelPos(i)
            return (
              <text key={`t${i}`} x={p.x} y={p.y} fill={s.ink} fontSize="10" fontWeight="700"
                    textAnchor="middle" dominantBaseline="middle"
                    transform={`rotate(${p.rot + 90} ${p.x} ${p.y})`}>{s.label}</text>
            )
          })}
          <circle cx="110" cy="110" r="14" fill="#121212" />
          <circle cx="110" cy="110" r="6" fill="#e08151" />
        </svg>
      </div>

      {screen === 'gate' && (
        <div className="rounded-2xl border border-black/10 bg-[#fdf8f2] p-5 sm:p-6">
          <label htmlFor="pbw-email" className="mb-1.5 block text-sm font-bold">Enter your email to spin</label>
          <input
            id="pbw-email" type="email" value={email} inputMode="email" autoComplete="email"
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void spin() }}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-black/50 bg-white px-3.5 py-3 text-base outline-none focus:ring-2 focus:ring-[#e08151]" />
          <label className="mt-3 flex items-start gap-2.5 text-[13.5px] leading-snug">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
                   className="mt-0.5 h-4 w-4 accent-[#e08151]" />
            <span>Yes, email me my prize and add me to the PetzBFF list. Unsubscribe any time.</span>
          </label>
          {error && <p role="alert" className="mt-2.5 text-[13.5px] font-bold text-[#b8543c]">{error}</p>}
          <button type="button" onClick={() => void spin()} disabled={busy}
            className="mt-4 w-full rounded-xl bg-[#e08151] px-5 py-4 text-[17px] font-bold uppercase tracking-wide text-white transition hover:opacity-90 disabled:opacity-50">
            {busy ? 'Spinning…' : 'Spin the wheel'}
          </button>
          <p className="mt-3 text-xs opacity-70">One spin per person. Your prize shows on screen — show it at the stand to collect.</p>
        </div>
      )}

      {screen === 'spinning' && (
        <p className="text-center text-lg font-bold text-[#e08151]">Round and round it goes… 🎡</p>
      )}

      {screen === 'result' && prize && (
        <div className="rounded-2xl border border-black/10 bg-[#fdf8f2] p-6 text-center">
          {won ? (
            <>
              <p className="mb-1 text-xs font-bold uppercase tracking-[0.14em] opacity-75">
                {already ? 'You already played' : 'You won'}
              </p>
              <h2 className="mb-1 text-2xl font-black">{prize.label}</h2>
              <div className="my-2 text-5xl">🎉</div>
              <p className="mb-2 text-[15px] font-semibold">
                {already ? 'This is the prize from your spin — show it at the stand to collect.'
                         : 'Show this screen at the PetzBFF stand to collect it.'}
              </p>
              {!already && <p className="text-[13.5px] opacity-70">We’ve also emailed it to you.</p>}
            </>
          ) : (
            <>
              <p className="mb-1 text-xs font-bold uppercase tracking-[0.14em] opacity-75">So close!</p>
              <h2 className="mb-1 text-2xl font-black">No prize this time</h2>
              <div className="my-2 text-5xl">🐾</div>
              <p className="text-[15px]">Come and say hi at the PetzBFF stand anyway — we’d love to meet your dog.</p>
            </>
          )}
        </div>
      )}
    </main>
  )
}
