'use client'

import { useEffect, useRef, useState } from 'react'

// Queen Neve's portrait — tappable for a little "boop" of joy (floating hearts +
// a personal counter in localStorage). Pure client-side, no backend.
// Falls back to a friendly placeholder until public/QueenNeve.jpeg exists.
const BOOP_EMOJIS = ['💛', '💚', '🐾', '🦴', '⭐']

export function NeveAvatar() {
  const [err, setErr] = useState(false)
  const [count, setCount] = useState(0)
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number; e: string }[]>([])
  const idRef = useRef(0)

  useEffect(() => {
    try { const n = parseInt(localStorage.getItem('neve_boops') || '0', 10); if (!Number.isNaN(n)) setCount(n) } catch {}
  }, [])

  const spawn = (x: number, y: number) => {
    const id = ++idRef.current
    const e = BOOP_EMOJIS[Math.floor(Math.random() * BOOP_EMOJIS.length)]
    setHearts(h => [...h, { id, x, y, e }])
    setTimeout(() => setHearts(h => h.filter(p => p.id !== id)), 900)
    setCount(c => { const n = c + 1; try { localStorage.setItem('neve_boops', String(n)) } catch {}; return n })
  }

  const onClick = (ev: React.MouseEvent<HTMLDivElement>) => {
    const r = ev.currentTarget.getBoundingClientRect()
    spawn(ev.clientX - r.left, ev.clientY - r.top)
  }
  const onKeyDown = (ev: React.KeyboardEvent<HTMLDivElement>) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault()
      const r = ev.currentTarget.getBoundingClientRect()
      spawn(r.width / 2, r.height / 2)
    }
  }

  return (
    <div>
      <div
        onClick={onClick}
        onKeyDown={onKeyDown}
        role="button"
        tabIndex={0}
        aria-label="Boop Queen Neve"
        title="Boop!"
        className="relative w-full aspect-[4/5] rounded-2xl overflow-hidden border border-emerald-200 shadow-sm bg-gradient-to-b from-emerald-100 to-amber-100 cursor-pointer select-none active:scale-[0.99] transition-transform focus:outline-none focus:ring-2 focus:ring-emerald-400">
        {err ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-emerald-700">
            <span className="text-7xl">🐶</span>
            <span className="text-xs font-semibold">Drop <code>QueenNeve.jpeg</code> in /public</span>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/QueenNeve.jpeg"
            alt="Queen Neve — Chief Morale Officer, in her green-and-gold Socceroos scarf"
            onError={() => setErr(true)}
            className="absolute inset-0 w-full h-full object-cover object-[50%_20%] scale-[1.2]"
          />
        )}

        {hearts.map(h => (
          <span key={h.id} style={{ left: h.x, top: h.y }}
            className="neve-boop pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-2xl">
            {h.e}
          </span>
        ))}

        <style>{`
          @keyframes neveBoop {
            0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.4); }
            15%  { opacity: 1; }
            100% { opacity: 0; transform: translate(-50%, -180%) scale(1.5); }
          }
          .neve-boop { animation: neveBoop 0.9s ease-out forwards; }
        `}</style>
      </div>

      <p className="text-center text-[11px] text-gray-400 mt-2">
        {count > 0
          ? <>You&apos;ve booped Neve <strong className="text-emerald-600">{count}</strong> time{count === 1 ? '' : 's'} 🐶</>
          : <>Pssst — tap Neve to boop her 👆</>}
      </p>
    </div>
  )
}
