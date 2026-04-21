'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  const [roundTabState, setRoundTabState] = useState(() => buildRoundTabs(getDefaultScoringConfig()))
  useEffect(() => {
    const next = buildRoundTabs(scoringConfig)
    setRoundTabState(next)
    // Keep activeRound in sync — if current tab doesn't exist in new config, use first
    setActiveRound(prev => next.tabs.includes(prev) ? prev : (next.tabs[0] ?? 'gs'))
  }, [scoringConfig])
  const { tabs: ROUND_TABS, tabLabel: ROUND_TAB_LABEL, tabToRounds: TAB_TO_ROUNDS } = roundTabState

  const [fixtures,      setFixtures]      = useState<FixtureMap>({})
  const [predictions,   setPredictions]   = useState<PredMap>({})
  const [results,       setResults]       = useState<ResultMap>({})
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState<Set<number>>(new Set())
  const [activeRound,   setActiveRound]   = useState<RoundTab>('gs') // updated to ROUND_TABS[0] after hydration
  const [favouriteTeam, setFavouriteTeam] = useState<string | null>(null)
  const [roundLocks,    setRoundLocks]    = useState<Record<string, boolean>>({})
  const [showFilter,    setShowFilter]    = useState<'pending' | 'all'>('pending')
  const [challenges,    setChallenges]    = useState<Record<number, {prize:string;sponsor?:string|null}>>({})

  const saveTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

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

  const onPenWinner = useCallback(async (fixtureId: number, team: string) => {
    setPredictions(prev => ({
      ...prev,
      [fixtureId]: { ...(prev[fixtureId] ?? { home: 0, away: 0 }), pen_winner: team }
    }))
    const p = predictions[fixtureId]
    if (!p) return
    setSaving(prev => new Set(prev).add(fixtureId))
    try {
      // Save outcome + pen_winner together (this is the completing action for knockout draws)
      await fetch('/api/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ predictions: [{ fixture_id: fixtureId, outcome: p.outcome ?? null, pen_winner: team }] }),
      })
    } catch { toast.error('Network error — penalty pick not saved') }
    finally { setSaving(prev => { const s = new Set(prev); s.delete(fixtureId); return s }) }
  }, [predictions])

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
    try {
      await fetch('/api/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ predictions: [{ fixture_id: fixtureId, outcome, pen_winner: null }] }),
      })
    } catch { toast.error('Network error — prediction not saved') }
    finally { setSaving(prev => { const s = new Set(prev); s.delete(fixtureId); return s }) }
  }, [fixtures])

  const persistPrediction = useCallback(async (fixtureId: number, home: number, away: number) => {
    setSaving(prev => new Set(prev).add(fixtureId))
    try {
      await fetch('/api/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ predictions: [{ fixture_id: fixtureId, home, away, outcome: null, pen_winner: null }] }),
      })
    } catch { /* silent — user sees saving indicator */ }
    finally { setSaving(prev => { const s = new Set(prev); s.delete(fixtureId); return s }) }
  }, [])

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

  // Track streak via prediction count changes
  const predCountRef = React.useRef(0)
  useEffect(() => {
    const count = Object.keys(predictions).length
    if (count > predCountRef.current) {
      predCountRef.current = count
      setStreakCount(s => s + 1)
    }
  }, [predictions])

  useEffect(() => {
    if (streakCount >= 3) {
      setShowStreakBurst(true)
      const t = setTimeout(() => setShowStreakBurst(false), 2000)
      return () => clearTimeout(t)
    }
  }, [streakCount])

  const isRoundOpen = useCallback((roundId: RoundId) => {
    const hasLocks = Object.keys(roundLocks).length > 0
    if (!hasLocks) return roundId === (ROUND_TABS[0] ?? 'gs')
    // Use tab_group from scoringConfig as the lock key fallback
    const tabGroup = scoringConfig.rounds[roundId]?.tab_group ?? roundId
    return !!roundLocks[roundId] || !!roundLocks[tabGroup]
  }, [roundLocks, scoringConfig, ROUND_TABS])

  const isLocked = useCallback((f: Fixture) => {
    if (!isRoundOpen(f.round)) return true
    const minsToKickoff = (new Date(f.kickoff_utc).getTime() - Date.now()) / 60000
    return minsToKickoff <= 5
  }, [isRoundOpen])

  // Current open round tab
  const currentRoundTab = useMemo(() => {
    const hasLocks = Object.keys(roundLocks).length > 0
    if (!hasLocks) return ROUND_TABS[0] ?? 'gs'
    return ROUND_TABS.find(tab => {
      const rounds = TAB_TO_ROUNDS[tab] ?? []
      return rounds.some(r => {
        const tabGroup = scoringConfig.rounds[r]?.tab_group ?? r
        return !!roundLocks[r] || !!roundLocks[tabGroup]
      })
    }) ?? (ROUND_TABS[0] ?? 'gs')
  }, [roundLocks, ROUND_TABS, TAB_TO_ROUNDS, scoringConfig])

  // Per-tab prediction counts
  const roundPredCounts = useMemo(() => {
    const counts: Record<string, { entered: number; total: number }> = {}
    for (const tab of ROUND_TABS) {
      const fs = TAB_TO_ROUNDS[tab].flatMap(rid => fixtures[rid] ?? [])
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
        if (pts === sc.exact)                       exactCt++
        else if (pts === sc.result && pts > 0)      correctCt++
      }

      // Count not-entered only for the current open tab's rounds
      const tabForRound: RoundTab = f.tab_group ?? f.round
      if (tabForRound === currentRoundTab && !hasPred && !r && isRoundOpen(f.round)) {
        notEnteredCt++
      }
    }
    return { totalPts, exactCt, correctCt, notEnteredCt }
  }, [allFixtures, predictions, results, currentRoundTab, isRoundOpen])

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
    const sc  = getScoringForTab(activeRound, scoringConfig)
    const fs  = TAB_TO_ROUNDS[activeRound].flatMap(rid => fixtures[rid] ?? [])
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
      if (v === sc.exact)                  exactCt++
      else if (v === sc.result && v > 0)   correctCt++
    }
    return { played, total: fs.length, pts, exactCt, correctCt }
  }, [fixtures, activeRound, predictions, results])

  // Fixtures sorted chronologically, with optional pending filter
  const visibleFixtures = useMemo(() => {
    const fs = TAB_TO_ROUNDS[activeRound].flatMap(rid => fixtures[rid] ?? [])
    const sorted = [...fs].sort((a, b) =>
      new Date(a.kickoff_utc).getTime() - new Date(b.kickoff_utc).getTime()
    )
    if (showFilter === 'all') return sorted
    // 'pending': unlocked fixtures with no prediction, OR knockout draw awaiting pen winner
    const isIncomplete = (f: Fixture) => {
      if (results[f.id] || isLocked(f)) return false
      const p = predictions[f.id]
      if (!p) return true  // no prediction at all
      // Knockout draw with no pen winner selected = incomplete
      const isKnockout = scoringConfig.knockout_rounds.includes(f.round)
      const isOutcome  = scoringConfig.outcome_rounds.includes(f.round)
      if (isKnockout && isOutcome && (p as any).outcome === 'D' && !(p as any).pen_winner) return true
      return false
    }
    const pending = sorted.filter(isIncomplete)
    // If nothing pending, fall back to showing all so page isn't empty
    return pending.length > 0 ? pending : sorted
  }, [fixtures, activeRound, showFilter, results, predictions, roundLocks])

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
  // Fixtures that have been predicted but have no result yet — shown in completed tray
  const completedFixtures = useMemo(() => {
    const fs = TAB_TO_ROUNDS[activeRound].flatMap(rid => (fixtures as any)[rid] ?? []) as Fixture[]
    return fs.filter(f => {
      if (results[f.id] || isLocked(f)) return false  // exclude resulted/locked
      const p = predictions[f.id]
      if (!p) return false
      const isScoreRound = !scoringConfig.outcome_rounds.includes(f.round)
      if (isScoreRound && (p.home < 0 || p.away < 0)) return false  // partial score
      if (isScoreRound && saving.has(f.id)) return false
      const isKnockout = scoringConfig.knockout_rounds.includes(f.round)
      const isOutcome  = scoringConfig.outcome_rounds.includes(f.round)
      if (isKnockout && isOutcome && (p as any).outcome === 'D' && !(p as any).pen_winner) return false
      if (isScoreRound && isKnockout && p.home === p.away && p.home >= 0 && !(p as any).pen_winner) return false
      return true  // fully predicted
    }).sort((a, b) => new Date(a.kickoff_utc).getTime() - new Date(b.kickoff_utc).getTime())
  }, [fixtures, activeRound, predictions, results, saving, scoringConfig, TAB_TO_ROUNDS])

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
  }, [visibleFixtures, results, predictions, roundLocks])

  const renderMatchRow = (f: Fixture) => (
    <MatchRow
      key={f.id}
      fixture={f}
      round={f.round}
      prediction={predictions[f.id] ?? null}
      result={results[f.id] ?? null}
      locked={isLocked(f)}
      saving={saving.has(f.id)}
      isFavourite={!!favouriteTeam && (f.home === favouriteTeam || f.away === favouriteTeam)}
      scoringConfig={scoringConfig}
      timezone={timezone}
      challenge={challenges[f.id] ?? null}
      onPredict={onPredict}
      onOutcome={onOutcome}
      onPenWinner={onPenWinner}
    />
  )

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Spinner className="w-8 h-8" />
    </div>
  )

  const activeRoundId: RoundId = (TAB_TO_ROUNDS[activeRound]?.[0] ?? activeRound) as RoundId

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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <StatCard label="Total pts"  value={globalStats.totalPts}    accent="green" />
        <StatCard label="Exact"      value={globalStats.exactCt}     accent="blue"  />
        <StatCard label="Correct"    value={globalStats.correctCt} />
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

      {/* Streak burst — appears after 3+ consecutive picks */}
      {showStreakBurst && (
        <div className="mb-3 flex items-center justify-center gap-2 bg-green-600 rounded-xl px-4 py-2.5 animate-bounce">
          <span className="text-lg">🔥</span>
          <span className="text-sm font-bold text-white">
            {streakCount} in a row — you're on fire!
          </span>
        </div>
      )}

      {/* Ongoing streak indicator (subtle, always visible after first pick) */}
      {streakCount > 0 && !showStreakBurst && (
        <div className="mb-3 flex items-center gap-1.5 px-1">
          {Array.from({ length: Math.min(streakCount, 8) }).map((_, i) => (
            <div key={i} className="w-2 h-2 rounded-full bg-green-400 opacity-80" />
          ))}
          {streakCount > 8 && <span className="text-xs text-green-500 font-semibold">+{streakCount - 8}</span>}
          <span className="text-xs text-green-600 font-medium ml-1">
            {streakCount === 1 ? '1 pick made' : `${streakCount} picks — keep going`}
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

      {/* Round tabs — horizontal scroll, segmented, DB-driven via tab_group/tab_label/MAX(round_order) */}
      <div className="mb-4 -mx-4 px-4 overflow-x-auto scrollbar-hide">
        <div className="flex gap-0 min-w-max border border-gray-200 rounded-xl overflow-hidden bg-gray-100 p-1">
          {ROUND_TABS.map(tab => {
            const cnt      = roundPredCounts[tab]
            const pts      = roundPoints[tab]
            const isActive = activeRound === tab
            const allDone  = cnt && cnt.total > 0 && cnt.entered === cnt.total
            const hasUnsaved = cnt && cnt.total > 0 && cnt.entered < cnt.total

            return (
              <button
                key={tab}
                onClick={() => { setActiveRound(tab); setShowFilter('pending') }}
                className={clsx(
                  'relative flex flex-col items-center justify-center',
                  'px-3.5 py-2 rounded-lg transition-all duration-200 whitespace-nowrap',
                  'text-xs font-semibold min-w-[72px]',
                  isActive
                    ? 'bg-white text-green-800 shadow-sm border border-gray-200'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-white/60'
                )}
              >
                {/* Tab label from DB tab_label field */}
                <span className={clsx(
                  'leading-tight',
                  isActive ? 'text-green-800' : allDone ? 'text-gray-400' : 'text-gray-600'
                )}>
                  {ROUND_TAB_LABEL[tab]}
                </span>

                {/* Progress — prediction count */}
                {cnt && cnt.total > 0 && (
                  <span className={clsx(
                    'text-[9px] font-medium mt-0.5 leading-none',
                    isActive
                      ? allDone ? 'text-green-500' : 'text-amber-500'
                      : allDone ? 'text-green-400' : 'text-gray-400'
                  )}>
                    {allDone ? '✓ done' : `${cnt.entered}/${cnt.total}`}
                  </span>
                )}

                {/* Points badge — top right */}
                {pts != null && pts > 0 && (
                  <span className={clsx(
                    'absolute -top-1 -right-1 text-[9px] font-bold rounded-full',
                    'px-1 min-w-[16px] text-center leading-4',
                    isActive ? 'bg-amber-400 text-amber-900' : 'bg-amber-100 text-amber-600'
                  )}>
                    {pts}
                  </span>
                )}

                {/* Unsaved dot — bottom of inactive tab */}
                {!isActive && hasUnsaved && (
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-amber-400" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Round score bar */}
      <RoundScoreBar
        round={activeRoundId}
        {...roundScoreBarProps}
      />

      {/* Filter toggle */}
      {(() => {
        const allFs = TAB_TO_ROUNDS[activeRound].flatMap(rid => fixtures[activeRound] ?? fixtures[rid] ?? [])
        const pendingCount = allFs.filter(f => {
          if (results[f.id] || isLocked(f)) return false
          const p = predictions[f.id]
          if (!p) return true
          const isKnockout = scoringConfig.knockout_rounds.includes(f.round)
          const isOutcome  = scoringConfig.outcome_rounds.includes(f.round)
          if (isKnockout && isOutcome && (p as any).outcome === 'D' && !(p as any).pen_winner) return true
          return false
        }).length
        return pendingCount > 0 ? (
          <div className="flex items-center gap-2 mb-3">
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setShowFilter('pending')}
                className={clsx(
                  'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                  showFilter === 'pending' ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                ⚡ To predict ({pendingCount})
              </button>
              <button
                onClick={() => setShowFilter('all')}
                className={clsx(
                  'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                  showFilter === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                All fixtures
              </button>
            </div>
            {showFilter === 'pending' && (
              <span className="text-[11px] text-amber-600">Showing unpredicted matches only</span>
            )}
          </div>
        ) : null
      })()}

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
              <div key={f.id}>
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

      {/* ── Completed predictions tray ──────────────────────────────────── */}
      {completedFixtures.length > 0 && showFilter === 'pending' && (
        <div className="mt-6 border border-gray-200 rounded-xl overflow-hidden bg-white">
          <button
            onClick={() => setCompletedTrayOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm">✅</span>
              <span className="text-xs font-semibold text-gray-600">
                {completedFixtures.length} predicted
              </span>
              <div className="flex gap-0.5 ml-1">
                {completedFixtures.slice(0, 5).map(f => {
                  const p = predictions[f.id]
                  const isOutcome = scoringConfig.outcome_rounds.includes(f.round)
                  const label = isOutcome
                    ? (p as any).outcome === 'H' ? '🏠' : (p as any).outcome === 'A' ? '✈️' : '🤝'
                    : `${p?.home}-${p?.away}`
                  return (
                    <span key={f.id} className="text-[10px] bg-green-100 text-green-700 rounded px-1 font-mono font-semibold">
                      {label}
                    </span>
                  )
                })}
                {completedFixtures.length > 5 && (
                  <span className="text-[10px] text-gray-400">+{completedFixtures.length - 5}</span>
                )}
              </div>
            </div>
            <span className="text-xs text-gray-400">{completedTrayOpen ? '▲ Hide' : '▼ Show'}</span>
          </button>

          {completedTrayOpen && (
            <div className="divide-y divide-gray-100">
              {completedFixtures.map(f => {
                const p = predictions[f.id]
                const isOutcome = scoringConfig.outcome_rounds.includes(f.round)
                const outcomeLabel = isOutcome
                  ? (p as any).outcome === 'H' ? `${f.home} win` : (p as any).outcome === 'A' ? `${f.away} win` : 'Draw'
                  : `${p?.home} – ${p?.away}`
                return (
                  <div key={f.id} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-700 truncate">
                        {f.home} vs {f.away}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {new Date(f.kickoff_utc).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      <span className="text-xs font-bold text-green-700 bg-green-50 border border-green-200 rounded-lg px-2 py-0.5">
                        {outcomeLabel}
                      </span>
                      <span className="text-green-500 text-xs">✓</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

    </div>
  )
}
