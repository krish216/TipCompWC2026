'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import type { LeaderboardEntry } from '@/types'

export function useLeaderboard(scope: 'global' | 'tribe' = 'global') {
  const { supabase, session } = useSupabase()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [myEntry, setMyEntry] = useState<LeaderboardEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchLeaderboard = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/leaderboard?scope=${scope}`)
      const { data, my_entry, error: apiErr } = await res.json()
      if (apiErr) { setError(apiErr); return }
      setEntries(data ?? [])
      setMyEntry(my_entry ?? null)
    } catch {
      setError('Failed to load leaderboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (session) fetchLeaderboard() }, [scope, session])

  // Realtime: refresh leaderboard when any prediction is scored
  useEffect(() => {
    if (!session) return
    const channel = supabase
      .channel('leaderboard-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'predictions' },
        () => fetchLeaderboard() // re-fetch on any score update
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase, session, scope])

  return { entries, myEntry, loading, error, refetch: fetchLeaderboard }
}
