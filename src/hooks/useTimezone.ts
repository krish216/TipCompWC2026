'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { detectTimezone } from '@/lib/timezone'

/**
 * Returns the player's saved timezone from their profile.
 * Falls back to the browser's detected timezone while loading,
 * and persists to public.users when changed.
 */
export function useTimezone() {
  const { session, supabase } = useSupabase()
  // Start with 'UTC' on both server and client to avoid hydration mismatch.
  // detectTimezone() calls Intl.DateTimeFormat which returns the browser TZ on
  // the client but 'UTC' on the server — using it as initial state causes #418.
  const [timezone, setTimezoneState] = useState<string>('UTC')
  const [loaded,   setLoaded]        = useState(false)

  // Load from profile on mount; fall back to browser-detected timezone
  useEffect(() => {
    if (!session) {
      setTimezoneState(detectTimezone())
      setLoaded(true)
      return
    }
    supabase
      .from('users')
      .select('timezone')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        setTimezoneState((data as any)?.timezone || detectTimezone())
        setLoaded(true)
      })
  }, [session, supabase])

  // Save to profile when changed
  const setTimezone = async (tz: string) => {
    setTimezoneState(tz)
    if (session) {
      await (supabase.from('users') as any)
        .update({ timezone: tz })
        .eq('id', session.user.id)
    }
  }

  return { timezone, setTimezone, loaded }
}
