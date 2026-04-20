'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { CountdownBanner } from '@/components/game/CountdownBanner'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'
import { MatchRow } from '@/components/game/MatchRow'
import { RoundScoreBar } from '@/components/game/RoundScoreBar'
import { StatCard, EmptyState, Spinner } from '@/components/ui'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { calcPoints, getDefaultScoringConfig, type RoundId, type Fixture, type MatchScore } from '@/types'
import { useTimezone } from '@/hooks/useTimezone'
import toast from 'react-hot-toast'

type PredMap    = Record<number, { home: number; away: number; outcome?: 'H'|'D'|'A'|null; pen_winner?: string|null }>
type ResultMap  = Record<number, MatchScore & { pen_winner?: string|null; result_outcome?: string|null }>
type FixtureMap = Partial<Record<RoundId, Fixture[]>>
import { buildRoundTabs, getScoringForTab, type RoundTabConfig } from './round-tab-utils'
type RoundTab = string

export default function PredictPage() {
  const { session, supabase } = useSupabase()
  const { timezone } = useTimezone()
  const { selectedTourn, scoringConfig: ctxScoringConfig } = useUserPrefs()
  const scoringConfig = ctxScoringConfig  // alias for clarity

  // Build round tabs dynamically from tournament_rounds (via scoringConfig).
  // Use useState+useEffect instead of useMemo to avoid SSR/client hydration mismatch:
  // server renders with default config, client loads real config — keeping them in sync
  // via state means React never sees a mismatch between server and client HTML.
  const defaultRoundTabState = buildRoundTabs(getDefaultScoringConfig())
  const [roundTabState, setRoundTabState] = useState(defaultRoundTabState)
  const { tabs: ROUND_TABS, tabLabel: ROUND_TAB_LABEL, tabToRounds: TAB_TO_ROUNDS } = roundTabState
  const defaultTab = ROUND_TABS[0] ?? defaultRoundTabState.tabs[0] ?? 'gs'
  const [fixtures,      setFixtures]      = useState<FixtureMap>({})
  const [predictions,   setPredictions]   = useState<PredMap>({})
  const [results,       setResults]       = useState<ResultMap>({})
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState<Set<number>>(new Set())
  const [activeRound,   setActiveRound]   = useState<RoundTab>(defaultTab)
  const [favouriteTeam, setFavouriteTeam] = useState<string | null>(null)
  const [roundLocks,    setRoundLocks]    = useState<Record<string, boolean>>({})
  const [editingFixture, setEditingFixture] = useState<number | null>(null)
  const [celebrationFixture, setCelebrationFixture] = useState<number | null>(null)
  const [challenges,    setChallenges]    = useState<Record<number, {prize:string;sponsor?:string|null}>>({})

  const saveTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const next = buildRoundTabs(scoringConfig)
    setRoundTabState(next)
    // Keep activeRound in sync — if current tab doesn't exist in new config, use first
    setActiveRound(prev => next.tabs.includes(prev) ? prev : (next.tabs[0] ?? defaultTab))
  }, [scoringConfig])

  // ── Load all data ─────────────────────────────────────────
  useEffect(() => {
    if (!session) return
    const load = async () => {
      setLoading(true)
      try {
        const [fxRes, predRes, resRes, locksRes, userRes] = await Promise.all([
          fetch('/api/fixtures'),
          fetch('/api/predictions'),
          fetch('/api/results'),
          fetch('/api/round-locks'),
          fetch('/api/user-tournaments'),
        ])

        const [fxData, predData, resData, locksData] = await Promise.all([
          fxRes.json(), predRes.json(), resRes.json(), locksRes.json(),
        ])

        // Fixtures by round
        const byRound: FixtureMap = {}
        for (const f of (fxData.data ?? []) as Fixture[]) {
          if (!byRound[f.round]) byRound[f.round] = []
          byRound[f.round]!.push(f)
        }
        setFixtures(byRound)
        // Set active round to the first round that has fixtures (by kickoff order)
        const firstRoundWithFixtures = Object.keys(byRound)
          .sort((a, b) => {
            const aFirst = (byRound as any)[a]?.[0]?.kickoff_utc ?? ''
            const bFirst = (byRound as any)[b]?.[0]?.kickoff_utc ?? ''
            return aFirst.localeCompare(bFirst)
          })[0]
        if (firstRoundWithFixtures) {
          // Map round_code to tab_group
          const tabGroup = (byRound as any)[firstRoundWithFixtures]?.[0]?.tab_group ?? firstRoundWithFixtures
          setActiveRound(tabGroup)
        }

        // Predictions map
        const pm: PredMap = {}
        for (const p of (predData.data ?? []) as any[]) {
          pm[p.fixture_id] = { home: p.home, away: p.away, outcome: p.outcome ?? null, pen_winner: p.pen_winner ?? null }
        }
        setPredictions(pm)

        // Results map
        const rm: ResultMap = {}
        for (const r of (resData.data ?? []) as any[]) {
          if (r.home_score != null) rm[r.id] = {
            home:           r.home_score,
            away:           r.away_score,
            pen_winner:     r.pen_winner     ?? null,
            result_outcome: r.result_outcome ?? null,
          }
        }
        setResults(rm)

        // Round locks
        const locks: Record<string, boolean> = locksData.data ?? {}
        setRoundLocks(locks)

        // User tournament prefs (favourite team)
        const userTournData = (await userRes.json().catch(() => ({}))) as any
        if (userTournData?.data?.length) {
          const ut = userTournData.data[0]
          setFavouriteTeam((ut as any).favourite_team ?? null)
        }

      } catch (e) {
        console.error('[predict] load error', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [session])

  const celebrateSavedFixture = useCallback((fixtureId: number) => {
    if (editingFixture !== null) return
    setCelebrationFixture(fixtureId)
    if (celebrationTimer.current) clearTimeout(celebrationTimer.current)
    celebrationTimer.current = setTimeout(() => {
      setCelebrationFixture(null)
      celebrationTimer.current = null
    }, 1500)
  }, [editingFixture])

  const onPenWinner = useCallback(async (fixtureId: number, team: string) => {
    setPredictions(prev => ({
      ...prev,
      [fixtureId]: { ...(prev[fixtureId] ?? { home: 0, away: 0 }), pen_winner: team }
    }))
    const p = predictions[fixtureId]
    if (!p) return
    setSaving(prev => new Set(prev).add(fixtureId))
    let saved = false
    try {
      // Save outcome + pen_winner together (this is the completing action for knockout draws)
      const res = await fetch('/api/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ predictions: [{ fixture_id: fixtureId, outcome: p.outcome ?? null, pen_winner: team }] }),
      })
      saved = res.ok
    } catch { toast.error('Network error — penalty pick not saved') }
    finally {
      setSaving(prev => { const s = new Set(prev); s.delete(fixtureId); return s })
      if (saved) celebrateSavedFixture(fixtureId)
    }
  }, [celebrateSavedFixture, predictions])

  const onOutcome = useCallback(async (fixtureId: number, outcome: 'H' | 'D' | 'A') => {
    // Look up round for this fixture
    const allFx = Object.values(fixtures).flat() as Fixture[]
    const fx = allFx.find(f => f.id === fixtureId)
    const isKnockout = fx ? scoringConfig.knockout_rounds.includes(fx.round) : false
    const needsPen = isKnockout && outcome === 'D'

    // Always update local state immediately
    setPredictions(prev => ({
      ...prev,
      [fixtureId]: {
        ...(prev[fixtureId] ?? { home: 0, away: 0 }),
        outcome,
        pen_winner: outcome !== 'D' ? null : prev[fixtureId]?.pen_winner ?? null,
      }
    }))

    // For knockout draws: don't save yet — wait for pen winner selection
    if (needsPen) return

    setSaving(prev => new Set(prev).add(fixtureId))
    let saved = false
    try {
      const res = await fetch('/api/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ predictions: [{ fixture_id: fixtureId, outcome, pen_winner: null }] }),
      })
      saved = res.ok
    } catch { toast.error('Network error — prediction not saved') }
    finally {
      setSaving(prev => { const s = new Set(prev); s.delete(fixtureId); return s })
      if (saved) celebrateSavedFixture(fixtureId)
    }
  }, [fixtures, celebrateSavedFixture])

  const persistPrediction = useCallback(async (fixtureId: number, home: number, away: number) => {
    setSaving(prev => new Set(prev).add(fixtureId))
    let saved = false
    try {
      const res = await fetch('/api/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ predictions: [{ fixture_id: fixtureId, home, away, outcome: null, pen_winner: null }] }),
      })
      saved = res.ok
    } catch { /* silent — user sees saving indicator */ }
    finally {
      setSaving(prev => { const s = new Set(prev); s.delete(fixtureId); return s })
      if (saved) celebrateSavedFixture(fixtureId)
    }
  }, [celebrateSavedFixture])

  const onPredict = useCallback((fixtureId: number, side: 'home' | 'away', value: number) => {
    setPredictions(prev => {
      const current = prev[fixtureId] ?? { home: -1, away: -1 }
      const updated  = { ...current, [side]: value }
      if (updated.home >= 0 && updated.away >= 0) {
        const timer = saveTimers.current.get(fixtureId)
        if (timer) clearTimeout(timer)
        saveTimers.current.set(fixtureId, setTimeout(() => {
          persistPrediction(fixtureId, updated.home, updated.away)
        }, 600))
      }
      return { ...prev, [fixtureId]: updated }
    })
  }, [persistPrediction])

  // ── Derived data ──────────────────────────────────────────
  const allFixtures = useMemo(() => Object.values(fixtures).flat() as Fixture[], [fixtures])

  const isRoundOpen = useCallback((roundId: RoundId) => {
    const hasLocks = Object.keys(roundLocks).length > 0
    if (!hasLocks) return (TAB_TO_ROUNDS[defaultTab] ?? []).includes(roundId)
    // Use tab_group from scoringConfig as the lock key fallback
    const tabGroup = scoringConfig.rounds[roundId]?.tab_group ?? roundId
    return !!roundLocks[roundId] || !!roundLocks[tabGroup]
  }, [roundLocks, scoringConfig, TAB_TO_ROUNDS, defaultTab])

  const isLocked = useCallback((f: Fixture) => {
    if (!isRoundOpen(f.round)) return true
    const minsToKickoff = (new Date(f.kickoff_utc).getTime() - Date.now()) / 60000
    return minsToKickoff <= 5
  }, [isRoundOpen])

  // Current open round tab
  const safeActiveRound = ROUND_TABS.includes(activeRound) ? activeRound : defaultTab

  const currentRoundTab = useMemo(() => {
    const hasLocks = Object.keys(roundLocks).length > 0
    if (!hasLocks) return defaultTab
    return ROUND_TABS.find(tab => {
      const rounds = TAB_TO_ROUNDS[tab] ?? []
      return rounds.some(r => {
        const tabGroup = scoringConfig.rounds[r]?.tab_group ?? r
        return !!roundLocks[r] || !!roundLocks[tabGroup]
      })
    }) ?? defaultTab
  }, [roundLocks, ROUND_TABS, TAB_TO_ROUNDS, scoringConfig])

  // Per-tab prediction counts
  const roundPredCounts = useMemo(() => {
    const counts: Record<string, { entered: number; total: number }> = {}
    for (const tab of ROUND_TABS) {
      const fs = (TAB_TO_ROUNDS[tab] ?? []).flatMap(rid => fixtures[rid] ?? [])
      const entered = fs.filter(f => {
        const p = predictions[f.id]
        if (scoringConfig.outcome_rounds.includes(f.round)) return p && (p as any).outcome != null
        return p && p.home >= 0 && p.away >= 0
      }).length
      counts[tab] = { entered, total: fs.length }
    }
    return counts
  }, [fixtures, predictions])

  // Global stats
  const globalStats = useMemo(() => {
    let totalPts = 0, exactCt = 0, correctCt = 0, notEnteredCt = 0
    for (const f of allFixtures) {
      const sc      = scoringConfig.rounds[f.round]
      const p       = predictions[f.id]
      const r       = results[f.id]
      const hasPred = p != null && p.home >= 0 && p.away >= 0
      const isFav   = !!(favouriteTeam && (f.home === favouriteTeam || f.away === favouriteTeam))
      const pts     = hasPred ? calcPoints(p, r ?? null, f.round, isFav, scoringConfig) : null

      if (r && pts !== null) {
        totalPts += pts
        if (pts === sc.exact_bonus)                       exactCt++
        else if (pts === sc.result_pts && pts > 0)      correctCt++
      }

      // Count not-entered only for the current open tab's rounds
      const tabForRound: RoundTab = f.tab_group ?? f.round
      if (tabForRound === currentRoundTab && !hasPred && !r && isRoundOpen(f.round)) {
        notEnteredCt++
      }
    }
    return { totalPts, exactCt, correctCt, notEnteredCt }
  }, [allFixtures, predictions, results, currentRoundTab, isRoundOpen])

  // Current prediction streak: consecutive correct predictions from most recent backwards
  const currentStreak = useMemo(() => {
    // Get all fixtures with results, sorted by kickoff (most recent first)
    const completed = allFixtures
      .filter(f => results[f.id])
      .sort((a, b) => new Date(b.kickoff_utc).getTime() - new Date(a.kickoff_utc).getTime())
    
    let streak = 0
    for (const f of completed) {
      const p = predictions[f.id]
      const r = results[f.id]
      const isFav = !!(favouriteTeam && (f.home === favouriteTeam || f.away === favouriteTeam))
      const pts = calcPoints(p, r, f.round, isFav, scoringConfig)
      
      // Count consecutive fixtures with points earned
      if (pts && pts > 0) {
        streak++
      } else {
        break // Stop at first incorrect prediction
      }
    }
    return streak
  }, [allFixtures, predictions, results, favouriteTeam, scoringConfig])

  // Points per tab
  const roundPoints = useMemo(() => {
    const rp: Record<string, number> = {}
    for (const f of allFixtures) {
      const p       = predictions[f.id]
      const r       = results[f.id]
      const hasPred = p != null && p.home >= 0 && p.away >= 0
      const isFav   = !!(favouriteTeam && (f.home === favouriteTeam || f.away === favouriteTeam))
      const pts     = hasPred ? calcPoints(p, r ?? null, f.round, isFav, scoringConfig) : null
      if (pts !== null && r) {
        const tab = f.tab_group ?? f.round
        rp[tab]   = (rp[tab] ?? 0) + pts
      }
    }
    return rp
  }, [allFixtures, predictions, results])

  // Score bar props for active tab
  const roundScoreBarProps = useMemo(() => {
    const sc  = getScoringForTab(safeActiveRound, scoringConfig)
    const fs  = (TAB_TO_ROUNDS[safeActiveRound] ?? []).flatMap(rid => fixtures[rid] ?? [])
    let pts = 0, exactCt = 0, correctCt = 0, played = 0
    for (const f of fs) {
      const r = results[f.id]
      if (!r) continue
      played++
      const p       = predictions[f.id]
      const hasPred = p != null && p.home >= 0 && p.away >= 0
      const isFav   = !!(favouriteTeam && (f.home === favouriteTeam || f.away === favouriteTeam))
      const v       = hasPred ? (calcPoints(p, r, f.round, isFav, scoringConfig) ?? 0) : 0
      pts += v
      if (v === sc.exact_bonus)                  exactCt++
      else if (v === sc.result_pts && v > 0)   correctCt++
    }
    return { played, total: fs.length, pts, exactCount: exactCt, correctCount: correctCt }
  }, [fixtures, safeActiveRound, predictions, results])

  // Fixtures sorted chronologically (no filtering)
  const visibleFixtures = useMemo(() => {
    const fs = (TAB_TO_ROUNDS[safeActiveRound] ?? []).flatMap(rid => fixtures[rid] ?? [])
    const sorted = [...fs].sort((a, b) =>
      new Date(a.kickoff_utc).getTime() - new Date(b.kickoff_utc).getTime()
    )
    return sorted
  }, [fixtures, safeActiveRound])

  // Group fixtures by date label for section headers
  const fixturesByDate = useMemo(() => {
    const map: Record<string, Fixture[]> = {}
    for (const f of visibleFixtures) {
      const date = new Date(f.kickoff_utc).toLocaleDateString('en-AU', {
        timeZone: timezone || 'UTC',
        weekday: 'long', day: 'numeric', month: 'long'
      })
      if (!map[date]) map[date] = []
      map[date].push(f)
    }
    return map
  }, [visibleFixtures, timezone])

  // First fixture that needs a prediction (not locked, no result, no prediction)
  const nextUnpredictedId = useMemo(() => {
    return visibleFixtures.find(f => {
      if (results[f.id] || isLocked(f)) return false
      const p = predictions[f.id]
      if (!p) return true
      const isKnockout = scoringConfig.knockout_rounds.includes(f.round)
      const isOutcome  = scoringConfig.outcome_rounds.includes(f.round)
      if (isKnockout && isOutcome && (p as any).outcome === 'D' && !(p as any).pen_winner) return true
      return false
    })?.id ?? null
  }, [visibleFixtures, results, predictions, roundLocks, scoringConfig])

  useEffect(() => {
    if (celebrationFixture === null) return
    if (!nextUnpredictedId || nextUnpredictedId === celebrationFixture) return
    const timer = window.setTimeout(() => {
      document.getElementById(`fixture-row-${nextUnpredictedId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
    return () => window.clearTimeout(timer)
  }, [celebrationFixture, nextUnpredictedId])

  const renderMatchRow = (f: Fixture) => (
    <MatchRow
      key={f.id}
      fixture={f}
      round={f.round}
      prediction={predictions[f.id] ?? null}
      result={results[f.id] ?? null}
      locked={isLocked(f)}
      saving={saving.has(f.id)}
      celebrating={celebrationFixture === f.id}
      isFavourite={!!favouriteTeam && (f.home === favouriteTeam || f.away === favouriteTeam)}
      scoringConfig={scoringConfig}
      timezone={timezone}
      challenge={challenges[f.id] ?? null}
      onPredict={onPredict}
      onOutcome={onOutcome}
      onPenWinner={onPenWinner}
      onFocusScore={() => setEditingFixture(f.id)}
      onBlurScore={() => setEditingFixture(null)}
    />
  )

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Spinner className="w-8 h-8" />
    </div>
  )

  const activeRoundId: RoundId = (TAB_TO_ROUNDS[safeActiveRound]?.[0] ?? safeActiveRound) as RoundId

  return (
    <div className="max-w-3xl mx-auto px-4 py-4">
      <CountdownBanner />

      {/* Tournament metadata footer */}
      {selectedTourn && (selectedTourn.kickoff_venue || selectedTourn.final_venue || selectedTourn.total_matches) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 px-1 text-xs text-gray-400">
          {selectedTourn.total_matches != null && (
            <span>📅 {selectedTourn.total_matches} matches</span>
          )}
          {selectedTourn.kickoff_venue && (
            <span>🏟 {selectedTourn.kickoff_venue}</span>
          )}
          {selectedTourn.final_date && selectedTourn.final_venue && (
            <span>🏆 Final: {new Date(selectedTourn.final_date + 'T00:00:00').toLocaleDateString('en-AU', { day:'numeric', month:'short' })}, {selectedTourn.final_venue}</span>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
        <StatCard label="Total pts"  value={globalStats.totalPts}    accent="green" />
        <StatCard label="Exact"      value={globalStats.exactCt}     accent="blue"  />
        <StatCard label="Correct"    value={globalStats.correctCt} />
        <StatCard label="🔥 Streak"  value={currentStreak}           accent={currentStreak > 2 ? 'blue' : undefined} />
        <StatCard
          label={`To predict (${ROUND_TAB_LABEL[currentRoundTab]})`}
          value={globalStats.notEnteredCt}
          accent={globalStats.notEnteredCt > 0 ? 'amber' : undefined}
        />
      </div>

      {/* Not entered banner */}
      {globalStats.notEnteredCt > 0 && (
        <div className="mb-3 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
          <span>
            <strong>{globalStats.notEnteredCt}</strong> match{globalStats.notEnteredCt !== 1 ? 'es' : ''} in
            the <strong>{ROUND_TAB_LABEL[currentRoundTab]}</strong> still need your prediction
          </span>
        </div>
      )}

      {/* Favourite team banner */}
      {favouriteTeam && (
        <div className="mb-3 flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 text-xs text-purple-700">
          <span className="text-base">⭐</span>
          <span>
            Double points on <strong>{favouriteTeam}</strong> matches
            {scoringConfig.fav_team_rounds.length > 0 && (
              <span> — {scoringConfig.fav_team_rounds
                .map(r => scoringConfig.rounds[r]?.round_name ?? r)
                .join(' & ')} only</span>
            )}
          </span>
        </div>
      )}

      {/* Round tabs */}
      <div className="flex gap-1.5 flex-wrap mb-3">
        {ROUND_TABS.map(tab => {
          const cnt      = roundPredCounts[tab]
          const pts      = roundPoints[tab]
          const isActive = activeRound === tab
          const allDone  = cnt && cnt.total > 0 && cnt.entered === cnt.total
          return (
            <button
              key={tab}
              onClick={() => setActiveRound(tab)}
              className={clsx(
                'relative px-3 py-1.5 text-xs font-medium border rounded-full transition-colors whitespace-nowrap',
                isActive ? 'bg-green-600 border-green-700 text-white' : 'border-gray-300 text-gray-500 hover:bg-gray-50'
              )}
            >
              {ROUND_TAB_LABEL[tab]}
              {pts != null && pts > 0 && (
                <span className={clsx(
                  'absolute -top-1.5 -right-1.5 text-[9px] font-semibold rounded-full px-1 min-w-[16px] text-center',
                  isActive ? 'bg-amber-400 text-amber-900' : 'bg-amber-100 text-amber-700'
                )}>
                  {pts}
                </span>
              )}
              {cnt && cnt.total > 0 && (
                <span className={clsx(
                  'block text-[9px] mt-0.5 font-normal',
                  isActive ? 'text-green-200' : allDone ? 'text-green-500' : 'text-gray-400'
                )}>
                  {cnt.entered}/{cnt.total}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Round score bar */}
      <RoundScoreBar
        round={activeRoundId}
        {...roundScoreBarProps}
      />

      {/* Fixtures — chronological, grouped by date */}
      {visibleFixtures.length === 0 ? (
        <EmptyState
          title="No fixtures for this round yet"
          description="Check back once the previous round is complete."
        />
      ) : (
        Object.entries(fixturesByDate).map(([date, dayFixtures]) => (
          <div key={date}>
            {/* Date header */}
            <div className="flex items-center gap-3 mt-5 mb-2">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">
                {date}
              </span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>
            {dayFixtures.map(f => (
              <div key={f.id} id={`fixture-row-${f.id}`}>
                {/* "Predict next" indicator — first unpredicted fixture */}
                {f.id === nextUnpredictedId && (
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                      Predict next
                    </span>
                  </div>
                )}
                {renderMatchRow(f)}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  )
}
