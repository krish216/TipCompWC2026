'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

// Captures ?ref= from any landing URL and stores it in sessionStorage so it
// survives navigation to /login before the user registers.
export function RefCapture() {
  const params = useSearchParams()
  useEffect(() => {
    const ref = params.get('ref')
    if (ref) sessionStorage.setItem('tp_ref', ref)
  }, [params])
  return null
}
