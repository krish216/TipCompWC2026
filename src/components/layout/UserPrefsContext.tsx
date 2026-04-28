'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { type RoundConfig, buildScoringConfig, type TournamentScoringConfig, getDefaultScoringConfig } from '@/types'
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
  id:          string
  name:        string
  logo_url?:   string | null
  invite_code?: string | null
  tournament_id?: string | null
}

export type TeamEntry = { fifa_code: string; flag_emoji: string }
export type TeamsMap  = Record<string, TeamEntry>

interface UserPrefsCtx {
  activeTournaments:  Tournament[]
  tournsComps:        Comp[]
  selectedTournId:    string | null
  selectedCompId:     string | null
  selectedTourn:      Tournament | null
  selectedComp:       Comp | null
  isCompAdmin:        boolean
  adminComps:         { id: string; name: string; logo_url?: string | null; invite_code?: string }[]
  roundConfigs:       RoundConfig[]
  scoringConfig:      TournamentScoringConfig
  teamsMap:           TeamsMap
  flag:               (name: string) => string
  code:               (name: string) => string
  pickTournament:     (id: string) => Promise<void>
  pickComp:           (comp: Comp) => Promise<void>
  updateComp:         (id: string, patch: Partial<Comp>) => void
  refreshComps:       (preferredCompId?: string) => Promise<void>
  hasTribe:           boolean | null   // null = loading, true/false = resolved
  selectedTribeId:    string | null
  refreshHasTribe:    () => Promise<void>
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
  const [roundConfigs,      setRoundConfigs]      = useState<RoundConfig[]>([])
  const [scoringConfig,     setScoringConfig]     = useState<TournamentScoringConfig>(getDefaultScoringConfig)
  // Admin comp IDs fetched once at load — isCompAdmin is derived from selectedCompId
  const [adminCompIds,  setAdminCompIds]  = useState<Set<string>>(new Set())
  const [adminComps,    setAdminComps]    = useState<{id:string;name:string;logo_url?:string|null;invite_code?:string}[]>([])
  const [teamsMap,      setTeamsMap]      = useState<TeamsMap>({})
  const [hasTribe,        setHasTribe]        = useState<boolean | null>(null)
  const [selectedTribeId, setSelectedTribeId] = useState<string | null>(null)

  const fetchHasTribe = useCallback(async (compId: string) => {
    try {
      const res = await fetch(`/api/tribes?comp_id=${compId}`)
      const d   = await res.json()
      setHasTribe(!!d.data)
      setSelectedTribeId((d.data as any)?.id ?? null)
    } catch { setHasTribe(false); setSelectedTribeId(null) }
  }, [])

  // Reactively re-check tribe membership whenever the selected comp changes
  useEffect(() => {
    if (!session || !selectedCompId) { setHasTribe(null); return }
    fetchHasTribe(selectedCompId)
  }, [session, selectedCompId, fetchHasTribe])

  const refreshHasTribe = useCallback(async () => {
    if (selectedCompId) await fetchHasTribe(selectedCompId)
  }, [selectedCompId, fetchHasTribe])

  const loadTeams = useCallback(async (tournId: string) => {
    try {
      const res  = await fetch(`/api/tournament-teams?tournament_id=${tournId}`)
      const data = await res.json()
      const map: TeamsMap = {}
      for (const t of data.teams ?? []) map[t.name] = { fifa_code: t.fifa_code, flag_emoji: t.flag_emoji }
      setTeamsMap(map)
    } catch { /* non-critical — UI falls back to '🏳️' / 3-letter abbrev */ }
  }, [])

  const flag = useCallback((name: string) => teamsMap[name]?.flag_emoji ?? '🏳️', [teamsMap])
  const code = useCallback((name: string) => teamsMap[name]?.fifa_code  ?? name.slice(0, 3).toUpperCase(), [teamsMap])

  // Load comps for a given tournament — filtered server-side via ?tournament_id=
  const loadComps = useCallback(async (
    tournId:    string,
    _userId:    string,
    prefCompId: string | null = null
  ): Promise<Comp[]> => {
    try {
      // Pass tournament_id to API — filtering done server-side with admin client
      let res = await fetch(`/api/user-comps?tournament_id=${tournId}`)
      // 401 can occur right after email verification (race: client session is ready
      // but the auth cookie hasn't propagated to the server yet). Retry once.
      if (res.status === 401) {
        await new Promise(r => setTimeout(r, 1500))
        res = await fetch(`/api/user-comps?tournament_id=${tournId}`)
      }
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

  // Initial load — keyed on user ID, not the full session object.
  // The session object is replaced on every TOKEN_REFRESHED event, which would
  // re-run this effect (and all its fetches) once per refresh cycle if we used
  // [session] directly. Using [session?.user.id] re-runs only on actual
  // login / logout / user-switch events.
  useEffect(() => {
    // Always reset admin state when session changes (prevents stale comp-admin
    // access when a different user logs in after a comp-admin logs out)
    setAdminCompIds(new Set())
    setAdminComps([])
    if (!session) { setLoading(false); return }
    ;(async () => {
      // 1. Active tournaments (is_active flag)
      const tournRes = await supabase
        .from('tournaments')
        .select('id, name, slug, status, is_active, start_date, end_date, total_matches, total_teams, total_rounds, kickoff_venue, final_venue, final_date, first_match, teams, allow_retroactive_predictions')
        .eq('is_active', true)
        .order('start_date', { ascending: true })
      // Only show tournaments with is_active=true — inactive ones are hidden
      const activeTourns = (tournRes.data ?? []) as Tournament[]
      setActiveTournaments(activeTourns)

      // 2. User preferences
      const { data: prefs } = await supabase
        .from('user_preferences').select('tournament_id, comp_id').eq('user_id', session.user.id).maybeSingle()
      const prefTournId = (prefs as any)?.tournament_id ?? null
      const prefCompId  = (prefs as any)?.comp_id ?? null

      // Resolve starting tournament
      const startTournId = prefTournId && activeTourns.some(t => t.id === prefTournId)
        ? prefTournId
        : activeTourns[0]?.id ?? null
      setSelectedTournId(startTournId)

      // 3. Load teams + round configs for starting tournament
      if (startTournId) { loadTeams(startTournId) }

      if (startTournId) {
        try {
          const rr = await fetch(`/api/tournament-rounds?tournament_id=${startTournId}`)
          const rd = await rr.json()
          const rows: RoundConfig[] = rd.data ?? []
          setRoundConfigs(rows)
          if (rows.length > 0) {
            // Merge with fallback defaults — take max pen_bonus to prevent
            // re-running seed migrations from overwriting migration 051 values
            const fallback = getDefaultScoringConfig()
            const merged = rows.map(r => ({
              ...r,
              pen_bonus: Math.max(r.pen_bonus, ( fallback.rounds as any)[r.round_code]?.pen_bonus ?? 0),
            }))
            setScoringConfig(buildScoringConfig(merged))
          }
        } catch { /* use default */ }
      }

      // 4. Load comps for starting tournament
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
        // else: already reset above — user is not a comp admin
      } catch { /* non-admin or fetch failed — adminCompIds already reset above */ }

      setLoading(false)
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id])

  const pickTournament = useCallback(async (id: string) => {
    setSelectedTournId(id)
    setSelectedCompId(null)
    setTournsComps([])
    // Reload round configs for new tournament
    try {
      const rr = await fetch(`/api/tournament-rounds?tournament_id=${id}`)
      const rd = await rr.json()
      const rows: RoundConfig[] = rd.data ?? []
      setRoundConfigs(rows)
      if (rows.length > 0) {
        const fallback = getDefaultScoringConfig()
        const merged = rows.map(r => ({
          ...r,
          pen_bonus: Math.max(r.pen_bonus, ( fallback.rounds as any)[r.round_code]?.pen_bonus ?? 0),
        }))
        setScoringConfig(buildScoringConfig(merged))
      }
    } catch { /* use default */ }
    loadTeams(id)
    if (session) await loadComps(id, session.user.id, null)
    await fetch('/api/user-preferences', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournament_id: id, comp_id: null }),
    })
  }, [loadComps])

  const pickComp = useCallback(async (comp: Comp) => {
    // Add to tournsComps if not already present (e.g. just joined via modal)
    setTournsComps(prev => prev.find(c => c.id === comp.id) ? prev : [...prev, comp])
    setSelectedCompId(comp.id)
    // Update adminCompIds if user is admin for this comp
    await fetch('/api/comp-admins').then(r => r.json()).then(d => {
      if (d.is_comp_admin && d.comps?.length) {
        setAdminCompIds(new Set((d.comps as any[]).map((c: any) => c.id)))
        setAdminComps(d.comps)
      }
    }).catch(() => {})
    await fetch('/api/user-preferences', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comp_id: comp.id }),
    })
  }, [])

  // refreshComps — re-fetches comps for the current tournament (called after joining/creating)
  // Pass preferredCompId to ensure the newly joined/created comp stays selected
  const refreshComps = useCallback(async (preferredCompId?: string) => {
    if (!session || !selectedTournId) return
    await loadComps(selectedTournId, session.user.id, preferredCompId ?? selectedCompId)
  }, [session, selectedTournId, selectedCompId, loadComps])

  const selectedTourn = activeTournaments.find(t => t.id === selectedTournId) ?? null
  const selectedComp  = tournsComps.find(c => c.id === selectedCompId) ?? null

  // Update a specific comp's fields in state (e.g. after saving settings)
  const updateComp = useCallback((id: string, patch: Partial<Comp>) => {
    setTournsComps(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
  }, [])
  // Derived synchronously — true whenever the selected comp is one the user admins
  const isCompAdmin   = selectedCompId != null && adminCompIds.has(selectedCompId)

  return (
    <UserPrefsContext.Provider value={{
      activeTournaments, tournsComps,
      selectedTournId, selectedCompId,
      selectedTourn, selectedComp, updateComp,
      isCompAdmin, adminComps,
      roundConfigs, scoringConfig,
      teamsMap, flag, code,
      pickTournament, pickComp, refreshComps,
      hasTribe, selectedTribeId, refreshHasTribe,
      loading,
    }}>
      {children}
    </UserPrefsContext.Provider>
  )
}
