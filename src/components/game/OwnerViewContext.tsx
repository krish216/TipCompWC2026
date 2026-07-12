'use client'

import { createContext, useContext, useState } from 'react'
import { useSupabase } from '@/components/layout/SupabaseProvider'

// Shared owner-view state for /chief/[id]: is the viewer the profile owner, and are they
// previewing the public view? Lets the owner bar, inline editors and private-comps fold
// all coordinate — so "Preview as Tipster" hides EVERY owner affordance at once.
type Ctx = { isOwner: boolean; preview: boolean; setPreview: (v: boolean) => void }
const OwnerViewContext = createContext<Ctx>({ isOwner: false, preview: false, setPreview: () => {} })

export const useOwnerView = () => useContext(OwnerViewContext)

export function OwnerViewProvider({ profileId, children }: { profileId: string; children: React.ReactNode }) {
  const { session } = useSupabase()
  const [preview, setPreview] = useState(false)
  const isOwner = session?.user?.id === profileId
  return (
    <OwnerViewContext.Provider value={{ isOwner, preview, setPreview }}>
      {children}
    </OwnerViewContext.Provider>
  )
}
