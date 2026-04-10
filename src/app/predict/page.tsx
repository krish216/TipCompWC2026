'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { CountdownBanner } from '@/components/game/CountdownBanner'
import { MatchRow } from '@/components/game/MatchRow'
import { RoundScoreBar } from '@/components/game/RoundScoreBar'
import { StatCard, EmptyState, Spinner } from '@/components/ui'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { calcPoints, SCORING, type RoundId, type Fixture, type MatchScore } from '@/types'
import { useTimezone } from '@/hooks/useTimezone'
import toast from 'react-hot-toast'

type PredMap    = Record<number, { home: number; away: number }>
type ResultMap  = Record<number, MatchScore>
type FixtureMap = Partial<Record<RoundId, Fixture[]>>
type RoundTab   = 'gs' | 'r32' | 'r16' | 'qf' | 'sf' | 'finals'

const GROUP_LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L'] as const

const ROUND_TABS: RoundTab[] = ['gs','r32','r16','qf','sf','finals']

const ROUND_TAB_LABEL: Record<RoundTab, string> = {
  gs: 'Group Stage', r32: 'Rd of 32', r16: 'Rd of 16',
  qf: 'Quarters',   sf: 'Semis',      finals: 'Finals',
}

const TAB_TO_ROUNDS: Record<RoundTab, RoundId[]> = {
  gs: ['gs'], r32: ['r32'], r16: ['r16'],
  qf: ['qf'], sf:  ['sf'],  finals: ['tp', 'f'],
}

// Safe scoring lookup — 'finals' maps to 'f'
function getScoringForTab(tab: RoundTab) {
  return SCORING[tab === 'finals' ? 'f' : tab as RoundId]
}

export default function PredictPage() {
  const { session, supabase } = useSupabase()
  const { timezone } = useTimezone()

  const [fixtures,      setFixtures]      = useState<FixtureMap>({})
  const [predictions,   setPredictions]   = useState<PredMap>({})
  const [results,       setResults]       = useState<ResultMap>({})
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState<Set<number>>(new Set())
  const [activeRound,   setActiveRound]   = useState<RoundTab>('gs')
  const [activeGroup,   setActiveGroup]   = useState('all')
  const [favouriteTeam, setFavouriteTeam] = useState<string | null>(null)
  const [roundLocks,    setRoundLocks]    = useState<Record<string, boolean>>({})
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
          supabase.from('users').select('favourite_team').eq('id', session.user.id).single(),
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
          pm[p.fixture_id] = { home: p.home, away: p.away }
        }
        setPredictions(pm)

        // Results map
        const rm: ResultMap = {}
        for (const r of (resData.data ?? []) as any[]) {
          if (r.home_score != null) rm[r.id] = { home: r.home_score, away: r.away_score }
        }
        setResults(rm)

        // Round locks
        setRoundLocks(locksData?.data ?? {})

        // Favourite team
        setFavouriteTeam((userRes.data as any)?.favourite_team ?? null)
      } catch (err) {
        console.error('Failed to load predict page data:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [session])

  // ── Realtime results ──────────────────────────────────────
  useEffect(() => {
    if (!session) return
    const channel = supabase
      .channel('predict-fixtures')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'fixtures' }, payload => {
        const f = payload.new as any
        if (f.home_score != null) {
          setResults(prev => ({ ...prev, [f.id]: { home: f.home_score, away: f.away_score } }))
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, session])

  // ── Save prediction ───────────────────────────────────────
  const persistPrediction = useCallback(async (fixtureId: number, home: number, away: number) => {
    setSaving(prev => new Set(prev).add(fixtureId))
    try {
      const res = await fetch('/api/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixture_id: fixtureId, home, away }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(res.status === 409 ? 'Round not open for predictions' : body.error ?? 'Save failed')
      }
    } catch {
      toast.error('Network error — prediction not saved')
    } finally {
      setSaving(prev => { const s = new Set(prev); s.delete(fixtureId); return s })
    }
  }, [])

  const onPenWinner = useCallback(async (fixtureId: number, team: string) => {
    setPredictions(prev => ({
      ...prev,
      [fixtureId]: { ...(prev[fixtureId] ?? { home: 0, away: 0 }), pen_winner: team }
    }))
    // Save via API
    const p = predictions[fixtureId]
    if (!p) return
    await fetch('/api/predictions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ predictions: [{ fixture_id: fixtureId, home: p.home, away: p.away, pen_winner: team }] }),
    })
  }, [predictions])

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

  const isRoundOpen = useCallback((roundId: RoundId): boolean => {
    const hasLocks = Object.keys(roundLocks).length > 0
    if (!hasLocks) return roundId === 'gs'
    const tabKey = (roundId === 'tp' || roundId === 'f') ? 'finals' : roundId
    return !!roundLocks[tabKey] || !!roundLocks[roundId]
  }, [roundLocks])

  const isLocked = useCallback((f: Fixture): boolean => {
    if (!isRoundOpen(f.round)) return true
    const minsToKickoff = (new Date(f.kickoff_utc).getTime() - Date.now()) / 60000
    return minsToKickoff <= 5
  }, [isRoundOpen])

  // Current open round tab
  const currentRoundTab = useMemo((): RoundTab => {
    const hasLocks = Object.keys(roundLocks).length > 0
    if (!hasLocks) return 'gs'
    return ROUND_TABS.find(tab => {
      const rounds = TAB_TO_ROUNDS[tab]
      return rounds.some(r => !!roundLocks[r === 'tp' || r === 'f' ? 'finals' : r])
    }) ?? 'gs'
  }, [roundLocks])

  // Per-tab prediction counts
  const roundPredCounts = useMemo(() => {
    const counts: Record<string, { entered: number; total: number }> = {}
    for (const tab of ROUND_TABS) {
      const fs = TAB_TO_ROUNDS[tab].flatMap(rid => fixtures[rid] ?? [])
      const entered = fs.filter(f => {
        const p = predictions[f.id]
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
      const sc      = SCORING[f.round]
      const p       = predictions[f.id]
      const r       = results[f.id]
      const hasPred = p != null && p.home >= 0 && p.away >= 0
      const pts     = hasPred ? calcPoints(p, r ?? null, f.round) : null

      if (r && pts !== null) {
        totalPts += pts
        if (pts === sc.exact)                       exactCt++
        else if (pts === sc.result && pts > 0)      correctCt++
      }

      // Count not-entered only for the current open tab's rounds
      const tabForRound: RoundTab = (f.round === 'tp' || f.round === 'f') ? 'finals' : f.round as RoundTab
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
      const pts     = hasPred ? calcPoints(p, r ?? null, f.round) : null
      if (pts !== null && r) {
        const tab = (f.round === 'tp' || f.round === 'f') ? 'finals' : f.round
        rp[tab]   = (rp[tab] ?? 0) + pts
      }
    }
    return rp
  }, [allFixtures, predictions, results])

  // Score bar props for active tab
  const roundScoreBarProps = useMemo(() => {
    const sc  = getScoringForTab(activeRound)
    const fs  = TAB_TO_ROUNDS[activeRound].flatMap(rid => fixtures[rid] ?? [])
    let pts = 0, exactCt = 0, correctCt = 0, played = 0
    for (const f of fs) {
      const r = results[f.id]
      if (!r) continue
      played++
      const p       = predictions[f.id]
      const hasPred = p != null && p.home >= 0 && p.away >= 0
      const v       = hasPred ? (calcPoints(p, r, f.round) ?? 0) : 0
      pts += v
      if (v === sc.exact)                  exactCt++
      else if (v === sc.result && v > 0)   correctCt++
    }
    return { played, total: fs.length, pts, exactCt, correctCt }
  }, [fixtures, activeRound, predictions, results])

  // Visible fixtures for active tab + group filter
  const visibleFixtures = useMemo(() => {
    const fs = TAB_TO_ROUNDS[activeRound].flatMap(rid => fixtures[rid] ?? [])
    if (activeRound !== 'gs' || activeGroup === 'all') return fs
    return fs.filter(f => (f as any).group === activeGroup)
  }, [fixtures, activeRound, activeGroup])

  // Group fixtures map (group stage only)
  const fixturesByGroup = useMemo(() => {
    if (activeRound !== 'gs') return null
    const map: Record<string, Fixture[]> = {}
    for (const f of visibleFixtures) {
      const g = (f as any).group ?? 'Other'
      if (!map[g]) map[g] = []
      map[g].push(f)
    }
    return map
  }, [activeRound, visibleFixtures])

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
      timezone={timezone}
      challenge={challenges[f.id] ?? null}
      onPredict={onPredict}
      onPenWinner={onPenWinner}
    />
  )

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Spinner className="w-8 h-8" />
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto px-4 py-4">
      <CountdownBanner />

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

      {/* Favourite team banner */}
      {favouriteTeam && (
        <div className="mb-3 flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 text-xs text-purple-700">
          <span className="text-base">⭐</span>
          <span>Double points on <strong>{favouriteTeam}</strong> matches — Group Stage &amp; Rd of 32 only</span>
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
              onClick={() => { setActiveRound(tab); setActiveGroup('all') }}
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

      {/* Group filter */}
      {activeRound === 'gs' && (
        <div className="flex gap-1 flex-wrap mb-3">
          {['all', ...GROUP_LETTERS].map(g => (
            <button key={g} onClick={() => setActiveGroup(g)}
              className={clsx(
                'px-2.5 py-1 text-xs rounded-full border transition-colors',
                activeGroup === g ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-500 hover:bg-gray-50'
              )}>
              {g === 'all' ? 'All groups' : `Group ${g}`}
            </button>
          ))}
        </div>
      )}

      {/* Round score bar */}
      <RoundScoreBar
        round={activeRound === 'finals' ? 'f' : activeRound as RoundId}
        {...roundScoreBarProps}
      />

      {/* Fixtures */}
      {visibleFixtures.length === 0 ? (
        <EmptyState
          title="No fixtures for this round yet"
          description="Check back once the previous round is complete."
        />
      ) : fixturesByGroup ? (
        Object.entries(fixturesByGroup).map(([grp, gFixtures]) => (
          <div key={grp}>
            <div className="flex items-center gap-2 mt-4 mb-2">
              <div className="w-6 h-6 rounded-full bg-green-100 text-green-700 text-[10px] font-semibold flex items-center justify-center">
                {grp}
              </div>
              <span className="text-sm font-medium text-gray-700">Group {grp}</span>
            </div>
            {gFixtures.map(renderMatchRow)}
          </div>
        ))
      ) : (
        visibleFixtures.map(renderMatchRow)
      )}
    </div>
  )
}
