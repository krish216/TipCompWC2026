'use client'
// v3 — roundview type fix

import { useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { Avatar, Medal, Spinner, EmptyState, Card } from '@/components/ui'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'
import type { LeaderboardEntry, RoundId } from '@/types'
import { ShareButton } from '@/components/game/ShareCard'
import { getDefaultScoringConfig } from '@/types'

type Scope     = 'tribe' | 'comp' | 'global'
type RoundView = string

const SCOPE_LABELS: Record<Scope, string> = {
  tribe: 'My tribe',
  comp:  'Comp',
  global:'Global',
}

// ROUND_SNAPSHOTS, SNAPSHOT_TO_ROUNDS and ROUND_ORDER are now built
// inside the component from scoringConfig (loaded from tournament_rounds API)
// — no hardcoding. Static 'all' snapshot is always prepended.

// ── Main ScoreBoard page ──────────────────────────────────────────────────────
export default function LeaderboardPage() {
  const { session, supabase } = useSupabase()
  const { scoringConfig } = useUserPrefs()

  const { ROUND_SNAPSHOTS, SNAPSHOT_TO_ROUNDS, ROUND_ORDER, TAB_ROUNDS } = useMemo(() => {
    const rounds = Object.values(scoringConfig.rounds)
      .sort((a, b) => (a.round_order ?? 0) - (b.round_order ?? 0))
    const tabGroups: Record<string, { label: string; rounds: string[]; maxOrder: number }> = {}
    for (const r of rounds) {
      const tab = (r as any).tab_group ?? r.round_code
      const label = (r as any).tab_label ?? r.round_name
      if (!tabGroups[tab]) tabGroups[tab] = { label, rounds: [], maxOrder: 0 }
      tabGroups[tab].rounds.push(r.round_code)
      tabGroups[tab].maxOrder = Math.max(tabGroups[tab].maxOrder, r.round_order ?? 0)
    }
    const sortedTabs = Object.entries(tabGroups).sort(([,a],[,b]) => a.maxOrder - b.maxOrder)
    const snapshots: { id: RoundView; label: string; shortLabel: string }[] = [
      { id: 'all', label: 'Overall', shortLabel: 'Overall' },
      ...sortedTabs.map(([tab, g]) => ({
        id:         tab as RoundView,
        label:      'After ' + g.label,
        shortLabel: 'After ' + tab.toUpperCase(), // tab = tab_group from DB (e.g. 'gs' → 'After GS')
      })),
    ]
    const snapshotToRounds: Record<string, RoundId[]> = {}
    let cumulative: RoundId[] = []
    for (const [tab, g] of sortedTabs) {
      cumulative = [...cumulative, ...g.rounds] as RoundId[]
      snapshotToRounds[tab] = [...cumulative] as RoundId[]
    }
    return {
      ROUND_SNAPSHOTS: snapshots,
      SNAPSHOT_TO_ROUNDS: snapshotToRounds,
      ROUND_ORDER: rounds.map(r => r.round_code) as RoundId[],
      TAB_ROUNDS: Object.fromEntries(Object.entries(tabGroups).map(([k, v]) => [k, v.rounds as RoundId[]])),
    }
  }, [scoringConfig])

  const [userComps,  setUserComps]  = useState<{id:string;name:string}[]>([])
  const [selectedComp, setSelectedComp] = useState<string | null>(null)
  const [scope,     setScope]     = useState<Scope>('comp')
  const [roundView, setRoundView] = useState<RoundView>('all')
  const [entries,   setEntries]   = useState<any[]>([])
  const [myEntry,   setMyEntry]   = useState<any | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [activeTournamentId, setActiveTournamentId] = useState<string | null>(null)
  const [error,     setError]     = useState<string | null>(null)
  const [message,   setMessage]   = useState<string | null>(null)
  const [expanded,   setExpanded]   = useState<string | null>(null)
  const [sortRound,  setSortRound]  = useState<string | null>(null)
  const realtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchLeaderboard = async (sc: Scope, tournId?: string | null) => {
    setLoading(true); setError(null); setMessage(null)
    const tid = tournId ?? activeTournamentId
    try {
      const url = `/api/leaderboard?scope=${sc}&limit=100${tid ? `&tournament_id=${tid}` : ''}`
      const res  = await fetch(url)
      const json = await res.json().catch(() => ({}))
      if (res.status === 401) {
        setLoading(false)
        return  // Session expired — silently bail; router guard will redirect
      }
      if (!res.ok) {
        // Surface the API error message rather than a generic "Failed to fetch"
        setError(json?.error ?? `Error ${res.status} — please try refreshing`)
        return
      }
      const { data, my_entry, message: msg, error: apiErr } = json
      if (apiErr) { setError(apiErr); return }
      setEntries(data ?? [])
      setMyEntry(my_entry ?? null)
      setMessage(msg ?? null)
    } catch (e: any) { setError('Network error — please check your connection and try again') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    if (!session) return
    ;(async () => {
      const { data: userRow } = await supabase
        .from('user_preferences').select('tournament_id, comp_id').eq('user_id', session.user.id).single()
      const tid   = (userRow as any)?.tournament_id ?? null
      const cid   = (userRow as any)?.comp_id ?? null
      setActiveTournamentId(tid)

      // Fetch only comps this user has JOINED (from user_tournaments → comp)
      const utRes  = await fetch('/api/user-tournaments')
      const utData = await utRes.json()
      const enrolledTournIds = new Set((utData.data ?? []).map((ut: any) => ut.tournament_id))

      // Get comps for the active tournament that the user is a member of
      const compSet: {id:string;name:string}[] = []
      if (cid) {
        // Primary comp — fetch details
        const { data: myCompRow } = await supabase
          .from('comps').select('id, name').eq('id', cid).single()
        if (myCompRow) compSet.push(myCompRow as any)
      }
      // If enrolled in multiple tournaments, check for comps in each
      // For now, show comps for active tournament where user is a member
      if (tid && compSet.length === 0) {
        const res  = await fetch(`/api/comps?tournament_id=${tid}`)
        const data = await res.json()
        const allComps = (data.data ?? []) as any[]
        // Only include comps where the user is actually a member
        compSet.push(...allComps.filter((c: any) => c.id === cid))
      }
      setUserComps(compSet)
      const firstComp = compSet[0] ?? null
      if (firstComp && !selectedComp) setSelectedComp(firstComp.id)

      fetchLeaderboard(scope, tid)
    })()
  }, [session, scope])

  useEffect(() => {
    if (!session) return
    const channel = supabase.channel('lb-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'predictions' },
        () => {
          if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current)
          realtimeTimerRef.current = setTimeout(() => fetchLeaderboard(scope), 2000)
        })
      .subscribe()
    return () => {
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current)
      supabase.removeChannel(channel)
    }
  }, [supabase, session, scope])

  const filteredEntries = useMemo(() => {
    if (roundView === 'all') {
      const base = entries.filter(e => (e.total_points ?? 0) > 0)
      if (sortRound) {
        const sorted = [...base].sort((a, b) => {
          const aRnd = Number(a.round_breakdown?.[sortRound] ?? 0)
          const bRnd = Number(b.round_breakdown?.[sortRound] ?? 0)
          return bRnd !== aRnd ? bRnd - aRnd : (b.total_points ?? 0) - (a.total_points ?? 0)
        })
        return sorted.map((e, i) => ({ ...e, rank: i + 1 }))
      }
      return base.map((e, i) => ({ ...e, rank: i + 1 }))
    }

    const validRounds = new Set(
      SNAPSHOT_TO_ROUNDS[roundView as string] ??
      (ROUND_ORDER.includes(roundView as RoundId)
        ? ROUND_ORDER.slice(0, ROUND_ORDER.indexOf(roundView as RoundId) + 1)
        : ROUND_ORDER)
    )
    const sumForRounds = (map: Record<string, number>) =>
      Object.entries(map)
        .filter(([r]) => validRounds.has(r as RoundId))
        .reduce((sum, [, v]) => sum + Number(v), 0)

    return entries
      .map(e => {
        const pts    = sumForRounds(e.round_breakdown    ?? {})
        const stdPts = sumForRounds(e.standard_breakdown ?? {})
        const bonPts = sumForRounds(e.bonus_breakdown    ?? {})
        return { ...e, total_points: pts, round_standard_pts: stdPts, round_bonus_pts: bonPts }
      })
      .filter(e => e.total_points > 0)
      .sort((a, b) =>
        b.total_points !== a.total_points
          ? b.total_points - a.total_points
          : (b.bonus_count ?? 0) - (a.bonus_count ?? 0)
      )
      .map((e, i) => ({ ...e, rank: i + 1 }))
  }, [entries, roundView, sortRound, SNAPSHOT_TO_ROUNDS, ROUND_ORDER])

  // Previous snapshot rankings — for movement arrows (compare consecutive non-'all' snapshots)
  const prevFilteredEntries = useMemo(() => {
    const currentIdx = ROUND_SNAPSHOTS.findIndex(r => r.id === roundView)
    if (currentIdx < 2) return null // 'all'(0) or first round(1) has no meaningful previous
    const prevSnap = ROUND_SNAPSHOTS[currentIdx - 1]
    const validRounds = new Set(SNAPSHOT_TO_ROUNDS[prevSnap.id] ?? [] as RoundId[])
    return entries
      .map(e => {
        const pts = Object.entries(e.round_breakdown ?? {})
          .filter(([r]) => validRounds.has(r as RoundId))
          .reduce((s, [, v]) => s + Number(v), 0)
        return { ...e, total_points: pts }
      })
      .filter(e => e.total_points > 0)
      .sort((a, b) => b.total_points !== a.total_points ? b.total_points - a.total_points : (b.bonus_count ?? 0) - (a.bonus_count ?? 0))
      .map((e, i) => ({ ...e, rank: i + 1 }))
  }, [entries, roundView, ROUND_SNAPSHOTS, SNAPSHOT_TO_ROUNDS])

  // rank change per user: positive = moved up, negative = moved down
  const movementMap = useMemo(() => {
    if (!prevFilteredEntries) return {} as Record<string, number>
    const prevRanks: Record<string, number> = {}
    for (const e of prevFilteredEntries) prevRanks[e.user_id] = e.rank
    const map: Record<string, number> = {}
    for (const e of filteredEntries) {
      const prev = prevRanks[e.user_id]
      if (prev != null) map[e.user_id] = prev - (e.rank ?? 0)
    }
    return map
  }, [filteredEntries, prevFilteredEntries])

  // Biggest mover this snapshot
  const biggestMover = useMemo(() => {
    let maxMove = 1
    let mover: any = null
    for (const e of filteredEntries) {
      const move = movementMap[e.user_id] ?? 0
      if (move > maxMove) { maxMove = move; mover = e }
    }
    return mover ? { entry: mover, gain: maxMove } : null
  }, [filteredEntries, movementMap])

  // Per-round max pts across all entries — for crown badge
  const roundWinnerPts = useMemo(() => {
    if (filteredEntries.length <= 1) return {} as Record<string, number>
    const max: Record<string, number> = {}
    for (const e of filteredEntries) {
      for (const [r, pts] of Object.entries(e.round_breakdown ?? {})) {
        const n = Number(pts)
        if (n > 0 && (max[r] == null || n > max[r])) max[r] = n
      }
    }
    return max
  }, [filteredEntries])

  // The latest snapshot tab whose own (non-cumulative) rounds have scoring data — shown as LIVE
  const liveSnapshotId = useMemo(() => {
    const roundsWithData = new Set<string>()
    for (const e of entries) {
      for (const [r, pts] of Object.entries(e.round_breakdown ?? {})) {
        if (Number(pts) > 0) roundsWithData.add(r)
      }
    }
    let live: string | null = null
    for (const snap of ROUND_SNAPSHOTS.filter(s => s.id !== 'all')) {
      if ((TAB_ROUNDS[snap.id] ?? []).some(r => roundsWithData.has(r))) live = snap.id
    }
    return live
  }, [entries, ROUND_SNAPSHOTS, TAB_ROUNDS])

  const myId     = session?.user.id
  const amInList = filteredEntries.some(e => e.user_id === myId)

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 pb-24">

      {/* Page header + comp selector in one row */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-gray-900">ScoreBoard</h1>
          <p className="text-xs text-gray-500 mt-0.5">Live · updates when results confirmed</p>
        </div>
        {userComps.length === 1 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl flex-shrink-0 max-w-[52%]">
            <span className="text-base leading-none">🏢</span>
            <div className="min-w-0">
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Viewing</p>
              <p className="text-xs font-bold text-gray-900 truncate">{userComps[0].name}</p>
            </div>
          </div>
        )}
      </div>

      {/* Multi-comp selector — only shown when user is in >1 comp */}
      {userComps.length > 1 && (
        <div className="mb-4">
          <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide mb-2">Select comp</p>
          <div className="flex gap-2 flex-wrap">
            {userComps.map(c => (
              <button key={c.id}
                onClick={() => {
                  setSelectedComp(c.id)
                  setEntries([]); setMyEntry(null)
                  fetchLeaderboard(scope)
                }}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all text-sm font-semibold',
                  selectedComp === c.id
                    ? 'bg-green-600 border-green-600 text-white shadow-sm scale-[1.02]'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-green-400 hover:shadow-sm'
                )}>
                <span>🏢</span>
                <span>{c.name}</span>
                {selectedComp === c.id && (
                  <span className="flex items-center gap-0.5 text-green-200 text-[10px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse"/>
                    Active
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sticky "your position" bar — always visible while scrolling */}
      {(() => {
        const me = filteredEntries.find(e => e.user_id === myId) ?? myEntry
        if (!me || !myId) return null
        const rank      = me.rank ?? '?'
        const pts       = me.total_points ?? 0
        const above     = typeof rank === 'number' && rank > 1 ? filteredEntries[rank - 2] : null
        const gapToAbove = above ? above.total_points - pts : 0
        const isLeading  = rank === 1
        return (
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-green-200 shadow-lg">
            <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 py-2.5">
              <div className="flex flex-col items-center w-8">
                <Medal rank={typeof rank === 'number' ? rank : 99} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-green-800 truncate">{me.display_name} · {pts} pts</p>
                <p className="text-[11px] text-gray-500">
                  {isLeading ? '🏆 Leading' : gapToAbove > 0 ? `${gapToAbove} pts behind #${(rank as number) - 1}` : `Tied #${(rank as number) - 1}`}
                </p>
              </div>
              <span className="text-xl font-bold text-green-700">#{rank}</span>
            </div>
          </div>
        )
      })()}

      {/* Leaderboard */}
      {(
        <>
          {/* Scope sub-tabs */}
          <div className="flex gap-1 mb-3 bg-gray-100 p-1 rounded-lg">
            {(['tribe','comp','global'] as Scope[]).map(s => (
              <button key={s} onClick={() => { setScope(s); setExpanded(null) }}
                className={clsx(
                  'flex-1 py-1.5 text-xs font-medium rounded-md transition-colors',
                  scope === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                )}>
                {SCOPE_LABELS[s]}
              </button>
            ))}
          </div>

          {/* Round snapshot pills — segmented control, horizontal scroll, matches predict page */}
          <div className="mb-4 -mx-4 px-4 overflow-x-auto scrollbar-hide">
            <div className="flex gap-0 min-w-max border border-gray-200 rounded-xl overflow-hidden bg-gray-100 p-1">
              {ROUND_SNAPSHOTS.map(r => {
                const isActive = roundView === r.id
                const isLive   = r.id === liveSnapshotId
                return (
                  <button key={r.id} onClick={() => { setRoundView(r.id); setSortRound(null) }}
                    className={clsx(
                      'relative flex flex-col items-center justify-center',
                      'px-3 py-1.5 rounded-lg transition-all duration-200 whitespace-nowrap',
                      'text-xs font-semibold min-w-[56px]',
                      isActive
                        ? 'bg-white text-green-800 shadow-sm border border-gray-200'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-white/60'
                    )}>
                    <span>{r.shortLabel}</span>
                    {isLive && (
                      <span className={clsx('flex items-center gap-0.5 text-[9px] font-semibold mt-0.5',
                        isActive ? 'text-green-500' : 'text-green-600')}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                        live
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Spinner className="w-7 h-7" /></div>
          ) : error ? (
            <EmptyState title={error} description="Try refreshing." />
          ) : message ? (
            <EmptyState title={message} description={
              scope === 'tribe' ? 'Go to the Tribe tab to join one.'
              : scope === 'comp' ? 'Go to the home page and select or join a comp first.'
              : ''
            } />
          ) : filteredEntries.length === 0 ? (
            <EmptyState
              title={scope === 'tribe' ? 'No tribe members yet' : scope === 'comp' ? 'No comp members yet' : 'No predictions yet'}
              description={scope === 'tribe' ? 'Invite friends to your tribe.' : 'Be the first!'}
            />
          ) : (
            <>
              {/* Biggest mover callout */}
              {biggestMover && roundView !== 'all' && (
                <div className="mb-3 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs">
                  <span className="text-base">⚡</span>
                  <span className="text-amber-800">
                    <span className="font-semibold">{biggestMover.entry.display_name}</span> is the biggest mover this round
                    <span className="ml-1 font-bold text-green-600">▲{biggestMover.gain}</span>
                  </span>
                </div>
              )}

              {/* Overall view — multi-round column table, click headers to sort */}
              {roundView === 'all' && (() => {
                const activeRounds = ROUND_ORDER.filter(r =>
                  filteredEntries.some(e => (e.round_breakdown?.[r] ?? 0) > 0)
                )
                return (
                  <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                    <table className="w-full text-xs border-collapse min-w-max">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-left px-2 py-2.5 text-[11px] font-semibold text-gray-500 uppercase w-8">#</th>
                          <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase sticky left-0 bg-gray-50 min-w-[130px]">
                            Player
                          </th>
                          {activeRounds.map(r => (
                            <th key={r}
                              onClick={() => setSortRound(sortRound === r ? null : r)}
                              className={clsx(
                                'px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide cursor-pointer select-none transition-colors min-w-[44px]',
                                sortRound === r
                                  ? 'text-green-700 bg-green-50'
                                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                              )}>
                              {r.toUpperCase()}
                              {sortRound === r && <span className="ml-0.5 text-[9px]">▼</span>}
                            </th>
                          ))}
                          <th
                            onClick={() => setSortRound(null)}
                            className={clsx(
                              'px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide cursor-pointer select-none transition-colors',
                              sortRound === null ? 'text-green-700' : 'text-gray-700 hover:bg-gray-100'
                            )}>
                            Total{sortRound === null && <span className="ml-0.5 text-[9px]">▼</span>}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredEntries.map((entry, i) => {
                          const isMe   = entry.user_id === myId
                          const myRank = entry.rank ?? i + 1
                          return (
                            <tr key={entry.user_id}
                              className={clsx(
                                'border-b border-gray-100 last:border-0 transition-colors',
                                isMe ? 'bg-green-50' : 'hover:bg-gray-50'
                              )}>
                              <td className="px-2 py-2.5 text-center">
                                <Medal rank={myRank} />
                              </td>
                              <td className={clsx('px-3 py-2.5 sticky left-0', isMe ? 'bg-green-50' : 'bg-white')}>
                                <div className="flex items-center gap-2 min-w-0">
                                  <Avatar name={entry.display_name} size="xs" />
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className={clsx('text-xs font-medium truncate max-w-[100px]', isMe && 'text-green-700')}>
                                        {entry.display_name}{isMe && ' (you)'}
                                      </span>
                                      {isMe && (
                                        <ShareButton compact payload={{
                                          type: 'rank', rank: myRank,
                                          points: entry.total_points, bonus: entry.bonus_count,
                                          correct: entry.correct_count, exact: entry.exact_count ?? 0,
                                          displayName: entry.display_name, roundLabel: 'Overall',
                                        }} />
                                      )}
                                    </div>
                                    {entry.tribe_name && scope !== 'tribe' && (
                                      <span className="text-[10px] text-gray-400 truncate block max-w-[100px]">🏆 {entry.tribe_name}</span>
                                    )}
                                    {scope === 'global' && entry.comp_name && entry.comp_name !== 'PUBLIC' && (
                                      <span className="text-[10px] text-blue-400 truncate block max-w-[100px]">🏢 {entry.comp_name}</span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              {activeRounds.map(r => {
                                const pts      = entry.round_breakdown?.[r] ?? 0
                                const isSorted = sortRound === r
                                return (
                                  <td key={r} className="px-2 py-2.5 text-center">
                                    {pts > 0
                                      ? <span className={clsx(
                                          'inline-block px-1.5 py-0.5 rounded font-semibold min-w-[28px] text-center',
                                          isSorted
                                            ? isMe ? 'bg-green-300 text-green-900' : 'bg-green-100 text-green-800'
                                            : isMe ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                                        )}>{pts}</span>
                                      : <span className="text-gray-300">—</span>
                                    }
                                  </td>
                                )
                              })}
                              <td className="px-3 py-2.5 text-right">
                                <span className={clsx('font-bold text-sm', isMe ? 'text-green-700' : 'text-gray-900')}>
                                  {entry.total_points}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })()}

              {roundView !== 'all' && (
                /* Round snapshot views — 5-column table */
                <>
                  <Card className="overflow-hidden p-0">
                    <div className="grid grid-cols-[32px_1fr_80px_60px_60px] gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                      <span>#</span>
                      <span>Player</span>
                      <span className="text-right">Points</span>
                      <span className="text-right text-amber-600">+Bonus</span>
                      <span className="text-right text-green-700">Base</span>
                    </div>

                    {filteredEntries.map((entry, i) => {
                      const isMe       = entry.user_id === myId
                      const isExpanded = expanded === entry.user_id
                      const myRank     = entry.rank ?? i + 1
                      const move       = movementMap[entry.user_id]
                      const above      = myRank > 1 ? filteredEntries[myRank - 2] : null
                      const gapToAbove = above ? above.total_points - entry.total_points : 0
                      return (
                        <div key={entry.user_id}>
                          <button
                            className={clsx(
                              'w-full grid grid-cols-[32px_1fr_80px_60px_60px] gap-2 px-3 py-2.5 border-b border-gray-100 last:border-0 text-left transition-colors',
                              isMe ? 'bg-green-50 hover:bg-green-100' : 'hover:bg-gray-50'
                            )}
                            onClick={() => setExpanded(isExpanded ? null : entry.user_id)}
                          >
                            <div className="flex flex-col items-center justify-center gap-0.5">
                              <Medal rank={myRank} />
                              {move != null && move !== 0 && (
                                <span className={clsx('text-[9px] font-bold leading-none', move > 0 ? 'text-green-500' : 'text-red-400')}>
                                  {move > 0 ? `▲${move}` : `▼${Math.abs(move)}`}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 min-w-0">
                              <Avatar name={entry.display_name} size="xs" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <p className={clsx('text-xs font-medium truncate', isMe && 'text-green-700')}>
                                    {entry.display_name}{isMe ? ' (you)' : ''}
                                  </p>
                                  {isMe && (
                                    <ShareButton compact payload={{
                                      type: 'rank', rank: myRank,
                                      points: entry.total_points, bonus: entry.bonus_count,
                                      correct: entry.correct_count, exact: entry.exact_count ?? 0, displayName: entry.display_name,
                                      roundLabel: ROUND_SNAPSHOTS.find(r => r.id === roundView)?.label,
                                    }} />
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {entry.tribe_name && (
                                    <span className="text-[10px] text-gray-400 truncate">🏆 {entry.tribe_name}</span>
                                  )}
                                  {scope === 'global' && entry.comp_name && entry.comp_name !== 'PUBLIC' && (
                                    <span className="text-[10px] text-blue-400 truncate">· 🏢 {entry.comp_name}</span>
                                  )}
                                  {isMe && myRank === 1 && (
                                    <span className="text-[10px] text-green-600 font-semibold">Leading 🏆</span>
                                  )}
                                  {isMe && myRank > 1 && (
                                    <span className="text-[10px] text-amber-600">
                                      {gapToAbove > 0 ? `${gapToAbove} behind #${myRank - 1}` : `Tied #${myRank - 1}`}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center justify-end">
                              <span className={clsx('text-sm font-semibold', isMe ? 'text-green-700' : 'text-gray-900')}>
                                {entry.total_points}
                              </span>
                            </div>
                            <div className="flex items-center justify-end">
                              <span className="text-xs text-amber-600 font-medium">
                                {(entry.round_bonus_pts ?? 0) > 0 ? `+${entry.round_bonus_pts}` : '—'}
                              </span>
                            </div>
                            <div className="flex items-center justify-end">
                              <span className="text-xs text-green-700 font-medium">
                                {entry.round_standard_pts ?? 0}
                              </span>
                            </div>
                          </button>

                          {isExpanded && entry.round_breakdown && (() => {
                            const sorted = (Object.entries(entry.round_breakdown) as [RoundId, number][])
                              .filter(([, pts]) => Number(pts) > 0)
                              .sort(([a], [b]) => {
                                const ai = ROUND_ORDER.indexOf(a as RoundId)
                                const bi = ROUND_ORDER.indexOf(b as RoundId)
                                return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
                              })
                            const maxPts = Math.max(...sorted.map(([, v]) => Number(v)), 1)
                            return (
                              <div className="px-4 pt-3 pb-4 bg-gray-50 border-b border-gray-100">
                                <p className="text-[11px] font-medium text-gray-500 mb-3 uppercase tracking-wide">Points by round</p>
                                <div className="flex items-end gap-3 flex-wrap">
                                  {sorted.map(([round, pts]) => {
                                    const n       = Number(pts)
                                    const barH    = Math.max(Math.round((n / maxPts) * 52), 6)
                                    const isCrown = roundWinnerPts[round] === n && n > 0
                                    return (
                                      <div key={round} className="flex flex-col items-center gap-1 min-w-[36px]">
                                        <span className="text-[10px] font-bold text-gray-700">{n}</span>
                                        {isCrown && <span className="text-[11px] leading-none">👑</span>}
                                        <div
                                          className={clsx('w-8 rounded-t-md transition-all', isCrown ? 'bg-amber-400' : isMe ? 'bg-green-400' : 'bg-blue-300')}
                                          style={{ height: `${barH}px` }}
                                        />
                                        <span className="text-[9px] text-gray-400 font-medium uppercase">{round}</span>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })()}
                        </div>
                      )
                    })}
                  </Card>

                  <div className="flex gap-4 mt-3 text-[11px] text-gray-400 flex-wrap">
                    <span><span className="text-amber-600 font-medium">+Bonus</span> = exact score, pen winner &amp; fav team pts</span>
                    <span><span className="text-green-700 font-medium">Base</span> = pts for correct result (excl. bonus)</span>
                  </div>
                </>
              )}

              {/* Top-N footnote */}
              <p className="mt-3 text-[11px] text-gray-400 text-center">
                Showing top {scope === 'tribe' ? 25 : 50} · your position shown in the bar below
              </p>

            </>
          )}
        </>
      )}
    </div>
  )
}
