'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { CountdownBanner } from '@/components/game/CountdownBanner'
import { MatchRow } from '@/components/game/MatchRow'
import { RoundTabs } from '@/components/game/RoundTabs'
import { RoundScoreBar } from '@/components/game/RoundScoreBar'
import { StatCard, EmptyState, Spinner } from '@/components/ui'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { calcPoints, SCORING, type RoundId, type Fixture, type MatchScore } from '@/types'
import { ShareButton, AchievementToast, type SharePayload } from '@/components/game/ShareCard'
import { useTimezone } from '@/hooks/useTimezone'
import toast from 'react-hot-toast'

type PredMap    = Record<number, { home: number; away: number }>
type ResultMap  = Record<number, MatchScore>
type FixtureMap = Partial<Record<RoundId, Fixture[]>>

const GROUP_LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L'] as const
const ROUNDS = ['gs','r32','r16','qf','sf','finals'] as const
type RoundTab = typeof ROUNDS[number]
const ROUND_TAB_LABEL: Record<RoundTab, string> = {
  gs: 'Group Stage', r32: 'Rd of 32', r16: 'Rd of 16',
  qf: 'Quarters', sf: 'Semis', finals: 'Finals'
}
// Map UI tab → actual DB round IDs
const TAB_TO_ROUNDS: Record<RoundTab, RoundId[]> = {
  gs: ['gs'], r32: ['r32'], r16: ['r16'],
  qf: ['qf'], sf: ['sf'], finals: ['tp','f']
}

export default function PredictPage() {
  const { session, supabase } = useSupabase()

  const [fixtures,     setFixtures]     = useState<FixtureMap>({})
  const [predictions,  setPredictions]  = useState<PredMap>({})
  const [results,      setResults]      = useState<ResultMap>({})
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState<Set<number>>(new Set())
  const [activeRound,  setActiveRound]  = useState<RoundTab>('gs')
  const [activeGroup,  setActiveGroup]  = useState('all')
  const [favouriteTeam, setFavouriteTeam] = useState<string | null>(null)
  const [roundLocks,    setRoundLocks]    = useState<Record<string, boolean>>({})
  const [achievement,   setAchievement]   = useState<SharePayload | null>(null)
  const [achievMsg,     setAchievMsg]     = useState<{icon:string;title:string;description:string} | null>(null)
  const lastResultCountRef = React.useRef<number>(0)
  const consecutiveCorrectRef = React.useRef<number>(0)
  const { timezone } = useTimezone()
  const saveTimers = useMemo(() => new Map<number, ReturnType<typeof setTimeout>>(), [])

  // ── Fetch everything ──────────────────────────────────────
  useEffect(() => {
    if (!session) return
    const load = async () => {
      setLoading(true)
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
      setRoundLocks(locksData.data ?? {})

      const byRound: FixtureMap = {}
      ;(fxData.data ?? []).forEach((f: Fixture) => {
        if (!byRound[f.round]) byRound[f.round] = []
        byRound[f.round]!.push(f)
      })
      setFixtures(byRound)

      const pm: PredMap = {}
      ;(predData.data ?? []).forEach((p: any) => { pm[p.fixture_id] = { home: p.home, away: p.away } })
      setPredictions(pm)

      const rm: ResultMap = {}
      ;(resData.data ?? []).forEach((r: any) => { if (r.home_score != null) rm[r.id] = { home: r.home_score, away: r.away_score } })
      setResults(rm)

      setFavouriteTeam((userRes.data as any)?.favourite_team ?? null)
      setLoading(false)
    }
    load()
  }, [session])

  // ── Realtime: fixture results ─────────────────────────────
  useEffect(() => {
    if (!session) return
    const channel = supabase
      .channel('fixtures-results')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'fixtures' }, payload => {
        const f = payload.new as any
        if (f.home_score != null) setResults(prev => ({ ...prev, [f.id]: { home: f.home_score, away: f.away_score } }))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, session])

  // ── Achievement detector ─────────────────────────────────
  const checkAchievements = React.useCallback((fixtureId: number, predMap: typeof predictions, resultMap: typeof results) => {
    const f = allFixtures.find(x => x.id === fixtureId)
    if (!f) return
    const r = resultMap[fixtureId]
    if (!r) return  // no result yet — no achievement
    const p = predMap[fixtureId]
    if (!p || p.home < 0 || p.away < 0) return
    const sc = SCORING[f.round]
    const pts = calcPoints(p, r, f.round)

    if (pts === sc.exact) {
      // Check for streak
      consecutiveCorrectRef.current += 1
      const streak = consecutiveCorrectRef.current
      if (streak >= 3) {
        setAchievMsg({ icon: '🔥', title: `${streak} in a row!`, description: `${streak} correct predictions in a row — you're on fire!` })
        setAchievement({ type: 'achievement', icon: '🔥', title: `${streak} Predictions in a Row!`, description: `You've correctly predicted ${streak} matches in a row in TipComp 2026!` })
      } else {
        setAchievMsg({ icon: '⭐', title: 'Exact score!', description: `${f.home} ${r.home}–${r.away} ${f.away} — perfect prediction!` })
        setAchievement({ type: 'achievement', icon: '⭐', title: 'Exact Score!', description: `I called ${f.home} ${r.home}–${r.away} ${f.away} exactly right in TipComp 2026!` })
      }
    } else if (pts && pts > 0) {
      consecutiveCorrectRef.current += 1
      const streak = consecutiveCorrectRef.current
      if (streak >= 3) {
        setAchievMsg({ icon: '🔥', title: `${streak} in a row!`, description: `${streak} correct results in a row — incredible!` })
        setAchievement({ type: 'achievement', icon: '🔥', title: `${streak} Predictions in a Row!`, description: `${streak} correct predictions in a row in TipComp 2026. I'm on fire!` })
      }
    } else {
      consecutiveCorrectRef.current = 0
    }
  }, [allFixtures, predictions])

  // ── Handle prediction input ───────────────────────────────
  const onPredict = useCallback((fixtureId: number, side: 'home' | 'away', value: number) => {
    setPredictions(prev => {
      const current = prev[fixtureId] ?? { home: -1, away: -1 }
      const updated = { ...current, [side]: value }
      if (updated.home >= 0 && updated.away >= 0) {
        clearTimeout(saveTimers.get(fixtureId))
        saveTimers.set(fixtureId, setTimeout(() => {
          persistPrediction(fixtureId, updated.home, updated.away)
        }, 600))
      }
      return { ...prev, [fixtureId]: updated }
    })
  }, [saveTimers])

  const persistPrediction = async (fixtureId: number, home: number, away: number) => {
    setSaving(prev => new Set(prev).add(fixtureId))
    try {
      const res = await fetch('/api/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixture_id: fixtureId, home, away }),
      })
      if (!res.ok) {
        const { error } = await res.json()
        toast.error(res.status === 409 ? 'Match locked' : error ?? 'Save failed')
      }
    } catch { toast.error('Network error') }
    finally { setSaving(prev => { const s = new Set(prev); s.delete(fixtureId); return s }) }
  }

  const allFixtures = useMemo(() => Object.values(fixtures).flat(), [fixtures])

  // ── Per-round prediction counters ─────────────────────────
  const roundPredCounts = useMemo(() => {
    const counts: Record<string, { entered: number; total: number }> = {}
    ROUNDS.forEach(tab => {
      const roundIds = TAB_TO_ROUNDS[tab]
      const fs = roundIds.flatMap(rid => fixtures[rid] ?? [])
      const entered = fs.filter(f => {
        const p = predictions[f.id]
        return p && p.home >= 0 && p.away >= 0
      }).length
      counts[tab] = { entered, total: fs.length }
    })
    return counts
  }, [fixtures, predictions])

  // ── Current open round (first unlocked round with fixtures) ─
  const currentRound = useMemo(() => {
    const ORDER = ['gs','r32','r16','qf','sf','finals'] as const
    const hasLockData = Object.keys(roundLocks).length > 0
    if (!hasLockData) return 'gs'
    const open = ORDER.find(r => roundLocks[r] === true)
    return open ?? 'gs'
  }, [roundLocks])

  // ── Global stats — notEntered only for current round ──────
  const globalStats = useMemo(() => {
    let totalPts = 0, exactCt = 0, correctCt = 0, notEnteredCt = 0
    allFixtures.forEach(f => {
      const sc = SCORING[f.round]; const p = predictions[f.id]; const r = results[f.id]
      const hasPred = p && p.home >= 0 && p.away >= 0
      const pts = hasPred ? calcPoints(p, r ?? null, f.round) : null
      if (r && pts !== null) {
        totalPts += pts
        if (pts === sc.exact) exactCt++
        else if (pts === sc.result && pts > 0) correctCt++
      }
      // Only count not-entered for the current open round (unpredicted, not yet played)
      const roundIsOpen = Object.keys(roundLocks).length === 0 ? f.round === 'gs' : !!roundLocks[f.round]
      if (f.round === currentRound && roundIsOpen && !hasPred && !r) notEnteredCt++
    })
    return { totalPts, exactCt, correctCt, notEnteredCt }
  }, [allFixtures, predictions, results, currentRound, roundLocks])

  const roundPoints = useMemo(() => {
    const rp: Record<string, number> = {}
    allFixtures.forEach(f => {
      const p = predictions[f.id]; const r = results[f.id]
      const hasPred = p && p.home >= 0 && p.away >= 0
      const pts = hasPred ? calcPoints(p, r ?? null, f.round) : null
      if (pts !== null && r) {
        // Map tp and f both to 'finals' tab
        const tab = (f.round === 'tp' || f.round === 'f') ? 'finals' : f.round
        rp[tab] = (rp[tab] ?? 0) + pts
      }
    })
    return rp
  }, [allFixtures, predictions, results])

  const roundScoreBarProps = useMemo(() => {
    const roundIds = TAB_TO_ROUNDS[activeRound] ?? [activeRound as RoundId]
    const fs = roundIds.flatMap(rid => fixtures[rid] ?? [])
    const sc = SCORING[(activeRound === 'finals' ? 'f' : activeRound) as RoundId]
    let pts = 0, exactCt = 0, correctCt = 0, played = 0
    fs.forEach(f => {
      const r = results[f.id]; if (!r) return; played++
      const p = predictions[f.id]
      const hasPred = p && p.home >= 0 && p.away >= 0
      const v = hasPred ? calcPoints(p, r, f.round) : 0
      if (v === null) return; pts += v
      if (v === sc.exact) exactCt++
      else if (v === sc.result && v > 0) correctCt++
    })
    return { played, total: fs.length, pts, exactCt, correctCt }
  }, [fixtures, activeRound, predictions, results])

  const visibleFixtures = useMemo(() => {
    const roundIds = TAB_TO_ROUNDS[activeRound] ?? [activeRound as RoundId]
    const fs = roundIds.flatMap(rid => fixtures[rid] ?? [])
    if (activeRound !== 'gs' || activeGroup === 'all') return fs
    return fs.filter((f: any) => f.group === activeGroup)
  }, [fixtures, activeRound, activeGroup])

  const fixturesByGroup = useMemo(() => {
    if (activeRound !== 'gs') return null
    const map: Record<string, Fixture[]> = {}
    visibleFixtures.forEach(f => { if (!map[f.group!]) map[f.group!] = []; map[f.group!].push(f) })
    return map
  }, [activeRound, visibleFixtures])

  const isLocked = (f: Fixture) => {
    // Map tp/f to 'finals' for lock lookup
    const lockKey = (f.round === 'tp' || f.round === 'f') ? 'finals' : f.round
    const hasLockData = Object.keys(roundLocks).length > 0
    if (hasLockData && !roundLocks[lockKey] && !roundLocks[f.round]) return true
    if ((new Date(f.kickoff_utc).getTime() - Date.now()) / 60000 <= 5) return true
    return false
  }

  if (loading) return <div className="flex items-center justify-center py-24"><Spinner className="w-8 h-8" /></div>

  return (
    <div className="max-w-3xl mx-auto px-4 py-4">
      <CountdownBanner />

      {/* Global stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <StatCard label="Total pts"   value={globalStats.totalPts}    accent="green" />
        <StatCard label="Exact"       value={globalStats.exactCt}     accent="blue" />
        <StatCard label="Correct"     value={globalStats.correctCt} />
        <StatCard label={`Unpredicted (${SCORING[currentRound]?.label ?? 'current'})`} value={globalStats.notEnteredCt} accent={globalStats.notEnteredCt > 0 ? 'amber' : undefined} />
      </div>

      {/* Unpredicted banner */}
      {globalStats.notEnteredCt > 0 && (
        <div className="mb-3 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
          {globalStats.notEnteredCt} match{globalStats.notEnteredCt > 1 ? 'es' : ''} in the <strong>{SCORING[currentRound].label}</strong> still need your prediction
        </div>
      )}

      {/* Favourite team banner */}
      {favouriteTeam && (
        <div className="mb-3 flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 text-xs text-purple-700">
          <span className="text-base">⭐</span>
          <span>You earn <strong>double points</strong> for correct predictions on <strong>{favouriteTeam}</strong> matches</span>
        </div>
      )}

      {/* Round tabs with prediction counter badge */}
      <div className="flex gap-1.5 flex-wrap mb-3">
        {ROUNDS.map(r => {
          const cnt = roundPredCounts[r]
          const pts = roundPoints[r]
          const isActive = activeRound === r
          const label = ROUND_TAB_LABEL[r]
          const allDone = cnt && cnt.total > 0 && cnt.entered === cnt.total
          return (
            <button
              key={r}
              onClick={() => { setActiveRound(r as RoundTab); setActiveGroup('all') }}
              className={clsx(
                'relative px-3 py-1.5 text-xs font-medium border rounded-full transition-colors whitespace-nowrap',
                isActive ? 'bg-green-600 border-green-700 text-white' : 'border-gray-300 text-gray-500 hover:bg-gray-50'
              )}
            >
              {label}
              {/* Points badge */}
              {pts != null && pts > 0 && (
                <span className={clsx('absolute -top-1.5 -right-1.5 text-[9px] font-semibold rounded-full px-1 min-w-[16px] text-center', isActive ? 'bg-amber-400 text-amber-900' : 'bg-amber-100 text-amber-700')}>
                  {pts}
                </span>
              )}
              {/* Prediction counter below tab label */}
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

      {/* Group filter (group stage only) */}
      {activeRound === 'gs' && (
        <div className="flex gap-1 flex-wrap mb-3">
          {['all', ...GROUP_LETTERS].map(g => (
            <button key={g} onClick={() => setActiveGroup(g)}
              className={clsx('px-2.5 py-1 text-xs rounded-full border transition-colors',
                activeGroup === g ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-500 hover:bg-gray-50')}>
              {g === 'all' ? 'All groups' : `Group ${g}`}
            </button>
          ))}
        </div>
      )}

      {/* Round score bar */}
      <RoundScoreBar round={activeRound} {...roundScoreBarProps} />

      {/* Fixtures */}
      {visibleFixtures.length === 0 ? (
        <EmptyState title="No fixtures for this round yet" description="Check back once the previous round is complete." />
      ) : fixturesByGroup ? (
        Object.entries(fixturesByGroup).map(([grp, gFixtures]) => (
          <div key={grp}>
            <div className="flex items-center gap-2 mt-4 mb-2">
              <div className="w-6 h-6 rounded-full bg-green-100 text-green-700 text-[10px] font-semibold flex items-center justify-center">{grp}</div>
              <span className="text-sm font-medium text-gray-700">Group {grp}</span>
            </div>
            {gFixtures.map(f => (
              <MatchRow key={f.id} fixture={f} round={activeRound}
                prediction={predictions[f.id] ?? null} result={results[f.id] ?? null}
                locked={isLocked(f)} saving={saving.has(f.id)}
                isFavourite={!!favouriteTeam && (f.home === favouriteTeam || f.away === favouriteTeam)}
                timezone={timezone}
                onPredict={onPredict} />
            ))}
          </div>
        ))
      ) : (
        visibleFixtures.map(f => (
          <MatchRow key={f.id} fixture={f} round={activeRound}
            prediction={predictions[f.id] ?? null} result={results[f.id] ?? null}
            locked={isLocked(f)} saving={saving.has(f.id)}
            isFavourite={!!favouriteTeam && (f.home === favouriteTeam || f.away === favouriteTeam)}
            onPredict={onPredict} />
        ))
      )}
    </div>

    {/* Achievement toast */}
    {achievMsg && achievement && (
      <AchievementToast
        icon={achievMsg.icon}
        title={achievMsg.title}
        description={achievMsg.description}
        onShare={() => { /* ShareButton handles this via the achievement payload */ }}
        onDismiss={() => { setAchievMsg(null); setAchievement(null) }}
      />
    )}
  )
}
