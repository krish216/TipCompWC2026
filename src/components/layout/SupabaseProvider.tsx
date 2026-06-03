'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type SupabaseContext = {
  supabase: SupabaseClient<Database>
  session: Session | null
}

const Context = createContext<SupabaseContext | undefined>(undefined)

export function SupabaseProvider({
  children,
  initialSession,
}: {
  children: React.ReactNode
  initialSession: Session | null
}) {
  const [supabase] = useState(() => createClient())
  const [session, setSession] = useState<Session | null>(initialSession)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        // Supabase re-fires SIGNED_IN / INITIAL_SESSION every time the tab regains
        // focus, handing back a fresh session object with the same token. Keeping the
        // previous reference when nothing actually changed avoids re-rendering every
        // consumer (and re-running their effects) on every tab switch.
        setSession(prev =>
          prev?.access_token === newSession?.access_token ? prev : newSession
        )
      }
    )
    return () => subscription.unsubscribe()
  }, [supabase])

  return (
    <Context.Provider value={{ supabase: supabase as any, session }}>
      {children}
    </Context.Provider>
  )
}

export function useSupabase() {
  const ctx = useContext(Context)
  if (!ctx) throw new Error('useSupabase must be used inside SupabaseProvider')
  return ctx
}
