'use client'

import { useState } from 'react'

// Dog photo with a graceful 🐶 fallback — so the pack renders fine before real photos are
// dropped into public/dogs/, and never shows a broken image.
export function DogAvatar({ photo, name, className }: { photo: string; name: string; className?: string }) {
  const [broken, setBroken] = useState(false)
  if (broken || !photo) {
    return (
      <span className={`flex items-center justify-center bg-amber-100 text-2xl ${className ?? ''}`} aria-label={name} title={name}>🐶</span>
    )
  }
  return (
    <img src={photo} alt={name} onError={() => setBroken(true)}
      className={`object-cover ${className ?? ''}`} />
  )
}
