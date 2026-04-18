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
  const [timezone, setTimezoneState] = useState<string>(detectTimezone())
  const [loaded,   setLoaded]        = useState(false)

  // Load from profile on mount
  useEffect(() => {
    if (!session) { setLoaded(true); return }
    supabase
      .from('users')
      .select('timezone')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        if ((data as any)?.timezone) setTimezoneState((data as any).timezone)
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
