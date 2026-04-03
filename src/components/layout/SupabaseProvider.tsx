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
      (_event, session) => setSession(session)
    )
    return () => subscription.unsubscribe()
  }, [supabase])

  return (
    <Context.Provider value={{ supabase, session }}>
      {children}
    </Context.Provider>
  )
}

export function useSupabase() {
  const ctx = useContext(Context)
  if (!ctx) throw new Error('useSupabase must be used inside SupabaseProvider')
  return ctx
}
