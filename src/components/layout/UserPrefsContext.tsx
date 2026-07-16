'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import { type RoundConfig, buildScoringConfig, type TournamentScoringConfig, getDefaultScoringConfig } from '@/types'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { flagFor } from '@/lib/team-flags'

// Users allowed to preview not-yet-active tournaments (e.g. EPL) in their switcher, so
// they can trial the new tournament before launch. Global (tournament) admins qualify
// automatically via the is_admin check below; these explicit emails cover non-admin
// partners. This does NOT flip is_active — EPL stays inactive globally, so every
// single-active-tournament lookup elsewhere is unaffected.
const TOURNAMENT_PREVIEW_EMAILS = ['paws@petzbff.com.au']
const PREVIEW_TOURNAMENT_SLUGS  = ['epl-2026-27']

// Columns selected for each tournament. Shared by the initial load and refreshTournaments
// so a targeted refresh returns exactly the same shape.
const TOURN_COLS = 'id, name, slug, status, is_active, logo_url, start_date, end_date, total_matches, total_teams, total_rounds, kickoff_venue, final_venue, final_date, first_match, teams, allow_retroactive_predictions, max_base_pts, max_bonus_pts, enforce_premium, warmup_comp_code, warmup_tribe_code'

export interface Tournament {
  id:             string
  name:           string
  slug:           string
  status:         string
  is_active:      boolean
  logo_url?:      string | null
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
  max_base_pts?:                  number | null
  max_bonus_pts?:                 number | null
  enforce_premium?:               boolean
  allow_retroactive_predictions?: boolean
  warmup_comp_code?:              string | null
  warmup_tribe_code?:             string | null
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
  refreshTournaments: () => Promise<void>
  hasTribe:           boolean | null   // null = loading, true/false = resolved
  selectedTribeId:    string | null
  refreshHasTribe:    () => Promise<void>
  loading:            boolean
  isPremium:          boolean
  isProPaid:          boolean   // user actually PAID for Pro this tournament (≠ isPremium, which is true for all when enforcement is off)
  enforcePremium:     boolean
  isAdFree:           boolean   // paid Pro OR paid ad-free pass — hides ads (independent of enforce_premium)
  adsEnabled:         boolean   // admin master switch (app_settings.ads_enabled); false = no ads site-wide
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
  // Live mirror of the current selection so pickTournament can persist the OUTGOING
  // tournament's comp without a stale closure (its deps don't include these).
  const selectionRef = useRef<{ tournId: string | null; compId: string | null }>({ tournId: null, compId: null })
  useEffect(() => { selectionRef.current = { tournId: selectedTournId, compId: selectedCompId } }, [selectedTournId, selectedCompId])
  const [loading,           setLoading]           = useState(true)
  const [roundConfigs,      setRoundConfigs]      = useState<RoundConfig[]>([])
  const [scoringConfig,     setScoringConfig]     = useState<TournamentScoringConfig>(getDefaultScoringConfig)
  // Admin comp IDs fetched once at load — isCompAdmin is derived from selectedCompId
  const [adminCompIds,  setAdminCompIds]  = useState<Set<string>>(new Set())
  const [adminComps,    setAdminComps]    = useState<{id:string;name:string;logo_url?:string|null;invite_code?:string}[]>([])
  const [teamsMap,      setTeamsMap]      = useState<TeamsMap>({})
  const [hasTribe,        setHasTribe]        = useState<boolean | null>(null)
  const [selectedTribeId, setSelectedTribeId] = useState<string | null>(null)
  const [isPremiumOrg,    setIsPremiumOrg]    = useState(false)
  const [isAdFreeOrg,     setIsAdFreeOrg]     = useState(false)
  const [enforcePremium,  setEnforcePremium]  = useState(false)
  const [adsEnabled,      setAdsEnabled]      = useState(false)  // app_settings.ads_enabled; OFF until admin turns ads on

  // Global ads on/off switch (admin-controlled, app_settings). Public read.
  // Default OFF — ads AND every "remove ads" upsell stay hidden until an admin
  // explicitly flips the switch on (once AdSense is approved + env configured).
  useEffect(() => {
    fetch('/api/app-settings').then(r => r.json())
      .then(d => setAdsEnabled(d.data?.ads_enabled === 'on'))
      .catch(() => {})
  }, [])

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

  // Prefer the DB flag; fall back to the alias-aware team-flags lib so knockout
  // fixtures using alternate spellings (Cape Verde, Congo DR, United States…) still
  // render a flag instead of 🏳️.
  const flag = useCallback((name: string) => teamsMap[name]?.flag_emoji || flagFor(name), [teamsMap])
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
      // Persist the per-tournament comp memory only when auto-select landed on a comp
      // DIFFERENT from the one requested (a genuine change). The common "restored the
      // requested comp" case needs no write — it already matches the stored value
      // (seeded by pickComp, the switch restore, or the migration-154 backfill). Avoids
      // a write on every page load.
      if (startComp && startComp !== prefCompId) {
        fetch('/api/user-tournaments', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tournament_id: tournId, selected_comp_id: startComp }),
        }).catch(() => { /* non-critical */ })
      }
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
      // 1+2. Fetch user preferences + admin status in parallel, then the tournaments.
      // Preview users (global/tournament admins, plus the allow-listed emails) see active
      // tournaments PLUS the preview slugs (EPL); everyone else sees only active ones.
      // is_active is never changed here — the public still sees only active tournaments.
      const emailAllow = TOURNAMENT_PREVIEW_EMAILS.includes((session.user.email ?? '').toLowerCase())

      const [{ data: prefs }, adminRes, { data: myComps }] = await Promise.all([
        supabase.from('user_preferences').select('tournament_id, comp_id').eq('user_id', session.user.id).maybeSingle(),
        emailAllow
          ? Promise.resolve({ is_admin: true })
          : fetch('/api/admin').then(r => r.json()).catch(() => ({ is_admin: false })),
        // Tournaments the user belongs to a comp in — so a member of a not-yet-active
        // tournament's comp (e.g. the EPL co-design cohort) can see and play it. This is
        // visibility only: they already joined a comp, so it grants no new join/enrol path.
        supabase.from('user_comps').select('comps(tournament_id)').eq('user_id', session.user.id),
      ])
      const canPreview = emailAllow || !!(adminRes as any)?.is_admin
      const memberTournIds = Array.from(new Set(
        ((myComps ?? []) as any[])
          .map(r => (Array.isArray(r.comps) ? r.comps[0] : r.comps)?.tournament_id)
          .filter(Boolean)
      )) as string[]

      // Visible tournaments: active always; preview slugs for admins/allow-list; plus any
      // tournament the user is a member of a comp in. is_active is never changed here.
      const orParts = ['is_active.eq.true']
      if (canPreview)            orParts.push(`slug.in.(${PREVIEW_TOURNAMENT_SLUGS.join(',')})`)
      if (memberTournIds.length) orParts.push(`id.in.(${memberTournIds.join(',')})`)
      const tournRes = await supabase.from('tournaments').select(TOURN_COLS)
        .or(orParts.join(','))
        .order('start_date', { ascending: true })
      const activeTourns = (tournRes.data ?? []) as Tournament[]
      setActiveTournaments(activeTourns)
      const prefTournId = (prefs as any)?.tournament_id ?? null

      // Resolve starting tournament
      const startTournId = prefTournId && activeTourns.some(t => t.id === prefTournId)
        ? prefTournId
        : activeTourns[0]?.id ?? null
      setSelectedTournId(startTournId)

      // 3. Load teams + round configs for starting tournament
      if (startTournId) {
        // Set enforce_premium from the fetched tournament row
        const startTourn = activeTourns.find(t => t.id === startTournId)
        setEnforcePremium(startTourn?.enforce_premium ?? false)

        // Per-tournament state (the source of truth): the comp last used in THIS tournament +
        // premium/ad-free flags. The comp seed comes from user_tournaments.selected_comp_id,
        // NOT the global user_preferences.comp_id (which may belong to another tournament).
        const { data: utStart } = await supabase.from('user_tournaments')
          .select('selected_comp_id, is_premium, is_ad_free')
          .eq('user_id', session.user.id).eq('tournament_id', startTournId).maybeSingle()
        setIsPremiumOrg(!!(utStart as any)?.is_premium)
        setIsAdFreeOrg(!!(utStart as any)?.is_ad_free)
        const startComp = (utStart as any)?.selected_comp_id ?? null

        // Fire teams (non-blocking), round configs, comps + admin check in parallel
        loadTeams(startTournId)
        const [roundsData, resolvedComps, adminData] = await Promise.all([
          fetch(`/api/tournament-rounds?tournament_id=${startTournId}`).then(r => r.json()).catch(() => ({ data: [] })),
          loadComps(startTournId, session.user.id, startComp),
          fetch('/api/comp-admins').then(r => r.json()).catch(() => ({})),
        ])

        const rows: RoundConfig[] = roundsData.data ?? []
        setRoundConfigs(rows)
        if (rows.length > 0) {
          // tournament_rounds is the source of truth (the scoring trigger reads
          // rc.pen_bonus straight from it), so honour the stored value — including a
          // value lower than the default. Fall back to the default only when a row
          // genuinely omits pen_bonus, so the UI never silently shows the wrong figure.
          const fallback = getDefaultScoringConfig()
          const merged = rows.map((r: RoundConfig) => ({
            ...r,
            pen_bonus: r.pen_bonus ?? (fallback.rounds as any)[r.round_code]?.pen_bonus ?? 0,
          }))
          setScoringConfig(buildScoringConfig(merged))
        }

        // (Per-tournament comp memory is persisted inside loadComps via user_tournaments;
        // we no longer write a global user_preferences.comp_id.)
        void resolvedComps

        if (adminData.is_comp_admin && adminData.comps?.length) {
          setAdminCompIds(new Set((adminData.comps as any[]).map((c: any) => c.id)))
          setAdminComps(adminData.comps)
        }
      }

      setLoading(false)
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id])

  const pickTournament = useCallback(async (id: string) => {
    // Persist where we're leaving: save the outgoing tournament's current comp as its
    // per-tournament memory, so returning restores it (covers auto-selected comps that
    // pickComp never explicitly saved).
    const leaving = selectionRef.current
    if (session && leaving.tournId && leaving.compId && leaving.tournId !== id) {
      fetch('/api/user-tournaments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournament_id: leaving.tournId, selected_comp_id: leaving.compId }),
      }).catch(() => { /* non-critical */ })
    }
    setSelectedTournId(id)
    setSelectedCompId(null)
    setTournsComps([])
    // Refresh premium state for new tournament
    setActiveTournaments(prev => {
      const t = prev.find(t => t.id === id)
      setEnforcePremium(t?.enforce_premium ?? false)
      return prev
    })
    // Per-tournament state: premium/ad-free flags + the comp last used in THIS tournament,
    // so switching restores where you were instead of clearing the comp selection.
    let rememberedComp: string | null = null
    if (session) {
      try {
        const { data } = await supabase.from('user_tournaments')
          .select('is_premium, is_ad_free, selected_comp_id')
          .eq('user_id', session.user.id).eq('tournament_id', id).maybeSingle()
        setIsPremiumOrg(!!(data as any)?.is_premium)
        setIsAdFreeOrg(!!(data as any)?.is_ad_free)
        rememberedComp = (data as any)?.selected_comp_id ?? null
      } catch { /* non-critical */ }
    }
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
          pen_bonus: r.pen_bonus ?? (fallback.rounds as any)[r.round_code]?.pen_bonus ?? 0,
        }))
        setScoringConfig(buildScoringConfig(merged))
      }
    } catch { /* use default */ }
    loadTeams(id)
    // loadComps selects rememberedComp if it's still one of the user's comps, else none.
    if (session) await loadComps(id, session.user.id, rememberedComp)
    // Persist ONLY the selected tournament globally; the comp is per-tournament memory
    // (user_tournaments.selected_comp_id), written by loadComps / pickComp.
    await fetch('/api/user-preferences', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournament_id: id }),
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
    // Persist the comp as THIS tournament's selection (per-tournament, in user_tournaments) —
    // never a global user_preferences.comp_id — so switching away and back restores it.
    if (selectedTournId) {
      fetch('/api/user-tournaments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournament_id: selectedTournId, selected_comp_id: comp.id }),
      }).catch(() => { /* non-critical */ })
    }
  }, [selectedTournId])

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

  // Re-fetch the currently-visible tournaments' columns and merge fresh values in place,
  // without disturbing the current tournament/comp selection. Lets an admin action (e.g.
  // toggling practice mode) reflect immediately without a full page reload — the tournament
  // rows are otherwise loaded only once per session.
  const refreshTournaments = useCallback(async () => {
    if (!session || activeTournaments.length === 0) return
    const ids = activeTournaments.map(t => t.id)
    const { data } = await supabase.from('tournaments').select(TOURN_COLS).in('id', ids)
    if (!data) return
    const freshById = new Map((data as Tournament[]).map(t => [t.id, t]))
    setActiveTournaments(cur => cur.map(t => freshById.get(t.id) ?? t))
  }, [session, supabase, activeTournaments])
  // Derived synchronously — true whenever the selected comp is one the user admins
  const isCompAdmin = selectedCompId != null && adminCompIds.has(selectedCompId)
  // isPremium: true when enforcement is off (everyone free) OR user has paid for this tournament
  const isPremium   = !enforcePremium || isPremiumOrg
  // isAdFree: ONLY true for users who actually paid (Pro or ad-free pass) — NOT tied to
  // enforce_premium, so free users still see ads regardless of the premium-feature switch.
  const isAdFree    = isPremiumOrg || isAdFreeOrg

  return (
    <UserPrefsContext.Provider value={{
      activeTournaments, tournsComps,
      selectedTournId, selectedCompId,
      selectedTourn, selectedComp, updateComp,
      isCompAdmin, adminComps,
      roundConfigs, scoringConfig,
      teamsMap, flag, code,
      pickTournament, pickComp, refreshComps, refreshTournaments,
      hasTribe, selectedTribeId, refreshHasTribe,
      loading,
      isPremium, isProPaid: isPremiumOrg, enforcePremium,
      isAdFree, adsEnabled,
    }}>
      {children}
    </UserPrefsContext.Provider>
  )
}
