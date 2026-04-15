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
  teams?:         string[] | null
}

export interface Comp {
  id:        string
  name:      string
  logo_url?: string | null
}

interface UserPrefsCtx {
  activeTournaments:  Tournament[]
  tournsComps:        Comp[]
  selectedTournId:    string | null
  selectedCompId:     string | null
  selectedTourn:      Tournament | null
  selectedComp:       Comp | null
  isCompAdmin:        boolean
  adminComps:         { id: string; name: string; logo_url?: string | null; invite_code?: string }[]
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
  // Admin comp IDs fetched once at load — isCompAdmin is derived from selectedCompId
  const [adminCompIds,  setAdminCompIds]  = useState<Set<string>>(new Set())
  const [adminComps,    setAdminComps]    = useState<{id:string;name:string;logo_url?:string|null;invite_code?:string}[]>([])

  // Load comps for a given tournament — filtered server-side via ?tournament_id=
  const loadComps = useCallback(async (
    tournId:    string,
    userId:     string,
    prefCompId: string | null = null
  ): Promise<Comp[]> => {
    try {
      // Pass tournament_id to API — filtering done server-side with admin client
      const res  = await fetch(`/api/user-comps?tournament_id=${tournId}`)
      const data = await res.json()

      const comps: Comp[] = data.error ? [] : (data.data as any[])
        .map((uc: any) => {
          const c = Array.isArray(uc.comps) ? uc.comps[0] : uc.comps
          return c ?? null
        })
        .filter((c: any): c is Comp => !!c)

      setTournsComps(comps)

      // Auto-select: stored pref if still in list, else first
      const startComp = (prefCompId && comps.some((c: any) => c.id === prefCompId))
        ? prefCompId
        : comps[0]?.id ?? null
      setSelectedCompId(startComp)
      return comps
    } catch (e) {
      console.error('[loadComps] error:', e)
      return []
    }
  }, [])

  // Initial load
  useEffect(() => {
    if (!session) { setLoading(false); return }
    ;(async () => {
      // 1. Active tournaments (is_active flag)
      const tournRes = await supabase
        .from('tournaments')
        .select('id, name, slug, status, is_active, start_date, end_date, total_matches, total_teams, total_rounds, kickoff_venue, final_venue, final_date, first_match, teams')
        .eq('is_active', true)
        .order('start_date', { ascending: true })
      // Only show tournaments with is_active=true — inactive ones are hidden
      const activeTourns = (tournRes.data ?? []) as Tournament[]
      setActiveTournaments(activeTourns)

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
      if (startTournId) {
        const resolvedComps = await loadComps(startTournId, session.user.id, prefCompId)
        if (!prefCompId && resolvedComps.length > 0) {
          await fetch('/api/user-preferences', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ comp_id: resolvedComps[0].id }),
          })
        }
      }

      // Fetch all comps this user admins — stored as a Set for O(1) lookup
      try {
        const adminData = await fetch('/api/comp-admins').then(r => r.json())
        if (adminData.is_comp_admin && adminData.comps?.length) {
          setAdminCompIds(new Set((adminData.comps as any[]).map((c: any) => c.id)))
          setAdminComps(adminData.comps)
        }
      } catch { /* non-admin — leave defaults */ }

      setLoading(false)
    })()
  }, [session])

  const pickTournament = useCallback(async (id: string) => {
    setSelectedTournId(id)
    setSelectedCompId(null)
    setTournsComps([])
    if (session) await loadComps(id, session.user.id, null)
    await fetch('/api/user-preferences', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournament_id: id, comp_id: null }),
    })
  }, [loadComps])

  const pickComp = useCallback(async (comp: Comp) => {
    setSelectedCompId(comp.id)
    // No async admin check needed — isCompAdmin is derived from adminCompIds Set
    await fetch('/api/user-preferences', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comp_id: comp.id }),
    })
  }, [])

  const selectedTourn = activeTournaments.find(t => t.id === selectedTournId) ?? null
  const selectedComp  = tournsComps.find(c => c.id === selectedCompId) ?? null
  // Derived synchronously — true whenever the selected comp is one the user admins
  const isCompAdmin   = selectedCompId != null && adminCompIds.has(selectedCompId)

  return (
    <UserPrefsContext.Provider value={{
      activeTournaments, tournsComps,
      selectedTournId, selectedCompId,
      selectedTourn, selectedComp,
      isCompAdmin, adminComps,
      pickTournament, pickComp,
      loading,
    }}>
      {children}
    </UserPrefsContext.Provider>
  )
}
