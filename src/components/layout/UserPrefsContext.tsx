'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { useSupabase } from '@/components/layout/SupabaseProvider'

export interface Tournament {
  id:             string
  name:           string
  slug:           string
  status:         string
  is_active:      boolean
  start_date?:    string | null
  end_date?:      string | null
  total_matches?: number | null
  total_teams?:   number | null
  total_rounds?:  number | null
  kickoff_venue?: string | null
  final_venue?:   string | null
  final_date?:    string | null
  first_match?:   string | null
}

export interface Comp {
  id:        string
  name:      string
  app_name?: string | null
  logo_url?: string | null
}

interface UserPrefsCtx {
  // Loaded data
  activeTournaments:  Tournament[]
  tournsComps:        Comp[]
  // Current selections
  selectedTournId:    string | null
  selectedCompId:     string | null
  // Derived
  selectedTourn:      Tournament | null
  selectedComp:       Comp | null
  // Actions
  pickTournament:     (id: string) => Promise<void>
  pickComp:           (comp: Comp) => Promise<void>
  loading:            boolean
}

const UserPrefsContext = createContext<UserPrefsCtx | null>(null)

export function useUserPrefs() {
  const ctx = useContext(UserPrefsContext)
  if (!ctx) throw new Error('useUserPrefs must be inside UserPrefsProvider')
  return ctx
}

export function UserPrefsProvider({ children }: { children: ReactNode }) {
  const { session, supabase } = useSupabase()

  const [activeTournaments, setActiveTournaments] = useState<Tournament[]>([])
  const [tournsComps,       setTournsComps]       = useState<Comp[]>([])
  const [selectedTournId,   setSelectedTournId]   = useState<string | null>(null)
  const [selectedCompId,    setSelectedCompId]    = useState<string | null>(null)
  const [loading,           setLoading]           = useState(true)

  // Load comps for a given tournament id
  const loadComps = useCallback(async (tournId: string, prefCompId?: string | null) => {
    try {
      const res  = await fetch('/api/user-comps')
      const data = await res.json()

      let comps: Comp[] = []

      if (!data.error && Array.isArray(data.data) && data.data.length > 0) {
        comps = (data.data as any[])
          .map((uc: any) => {
            // Supabase returns nested relation as object or single-element array
            const c = Array.isArray(uc.comps) ? uc.comps[0] : uc.comps
            return c ?? null
          })
          .filter((c: any): c is Comp => !!c && c.tournament_id === tournId)
      }

      // If user_comps returned nothing (table missing or not backfilled),
      // fall back to reading users.comp_id directly
      if (comps.length === 0 && session) {
        const { data: userRow } = await supabase
          .from('users')
          .select('comp_id, comps(id, name, app_name, slug, logo_url, tournament_id)')
          .eq('id', session.user.id)
          .single()
        const c = userRow && (userRow as any).comp_id
          ? (Array.isArray((userRow as any).comps) ? (userRow as any).comps[0] : (userRow as any).comps)
          : null
        if (c && c.tournament_id === tournId) comps = [c]
      }

      setTournsComps(comps)

      // Resolve starting comp: prefer stored pref, else first
      const startComp = prefCompId && comps.some((c: any) => c.id === prefCompId)
        ? prefCompId
        : comps[0]?.id ?? null
      setSelectedCompId(startComp)
      return comps
    } catch (e) {
      console.error('loadComps error:', e)
      return []
    }
  }, [session, supabase])

  // Initial load
  useEffect(() => {
    if (!session) { setLoading(false); return }
    ;(async () => {
      // 1. Active tournaments (is_active flag)
      const [tournRes, enrolledRes] = await Promise.all([
        supabase.from('tournaments').select('id, name, slug, status, is_active, start_date, end_date, total_matches, total_teams, total_rounds, kickoff_venue, final_venue, final_date, first_match')
          .eq('is_active', true).order('start_date', { ascending: true }),
        fetch('/api/user-tournaments'),
      ])
      const dbActive   = (tournRes.data ?? []) as Tournament[]
      const enrollData = await enrolledRes.json()

      // Merge enrolled tournaments (so user always sees their tournament)
      const enrolledTourns: Tournament[] = ((enrollData.data ?? []) as any[])
        .map((ut: any) => Array.isArray(ut.tournaments) ? ut.tournaments[0] : ut.tournaments)
        .filter(Boolean)
      const merged = [...dbActive]
      enrolledTourns.forEach(t => { if (!merged.find(m => m.id === t.id)) merged.push(t) })
      merged.sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? ''))
      setActiveTournaments(merged)

      // 2. User preferences
      const { data: prefs } = await supabase
        .from('user_preferences').select('tournament_id, comp_id').eq('user_id', session.user.id).single()
      const prefTournId = (prefs as any)?.tournament_id ?? null
      const prefCompId  = (prefs as any)?.comp_id ?? null

      // Resolve starting tournament
      const startTournId = prefTournId && merged.some(t => t.id === prefTournId)
        ? prefTournId
        : merged[0]?.id ?? null
      setSelectedTournId(startTournId)

      // 3. Load comps for starting tournament
      if (startTournId) await loadComps(startTournId, prefCompId)

      setLoading(false)
    })()
  }, [session])

  const pickTournament = useCallback(async (id: string) => {
    setSelectedTournId(id)
    setSelectedCompId(null)
    setTournsComps([])
    await loadComps(id, null)
    await fetch('/api/user-preferences', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournament_id: id, comp_id: null }),
    })
  }, [loadComps])

  const pickComp = useCallback(async (comp: Comp) => {
    setSelectedCompId(comp.id)
    await fetch('/api/user-preferences', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comp_id: comp.id }),
    })
  }, [])

  const selectedTourn = activeTournaments.find(t => t.id === selectedTournId) ?? null
  const selectedComp  = tournsComps.find(c => c.id === selectedCompId) ?? null

  return (
    <UserPrefsContext.Provider value={{
      activeTournaments, tournsComps,
      selectedTournId, selectedCompId,
      selectedTourn, selectedComp,
      pickTournament, pickComp,
      loading,
    }}>
      {children}
    </UserPrefsContext.Provider>
  )
}
