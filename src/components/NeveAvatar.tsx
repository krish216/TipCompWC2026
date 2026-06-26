'use client'

import { useState } from 'react'

// Queen Neve's portrait. Falls back to a friendly placeholder until the image
// is dropped in at public/neve.jpg (so the page never looks broken).
export function NeveAvatar() {
  const [err, setErr] = useState(false)
  return (
    <div className="relative w-full aspect-[4/5] rounded-2xl overflow-hidden border border-emerald-200 shadow-sm bg-gradient-to-b from-emerald-100 to-amber-100">
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
    </div>
  )
}
