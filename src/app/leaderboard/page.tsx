'use client'

import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { Avatar, Medal, Spinner, EmptyState, Card } from '@/components/ui'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import type { LeaderboardEntry, RoundId } from '@/types'
import { ShareButton } from '@/components/game/ShareCard'
import { getDefaultScoringConfig } from '@/types'

type Scope     = 'tribe' | 'comp' | 'global'
type RoundView = 'all' | RoundId | 'finals'
type MainTab   = 'leaderboard' | 'challenges'

const SCOPE_LABELS: Record<Scope, string> = {
  tribe: 'My tribe',
  comp:  'Comp',
  global:'Global',
}

const ROUND_SNAPSHOTS: { id: RoundView; label: string }[] = [
  { id: 'all',    label: 'Overall'          },
  { id: 'gs',     label: 'After Group stage' },
  { id: 'r32',    label: 'After Rd of 32'   },
  { id: 'r16',    label: 'After Rd of 16'   },
  { id: 'qf',     label: 'After Quarters'   },
  { id: 'sf',     label: 'After Semis'      },
  { id: 'finals', label: 'After Finals'     },
]

const SNAPSHOT_TO_ROUNDS: Record<string, RoundId[]> = {
  gs:     ['gs'],
  r32:    ['gs','r32'],
  r16:    ['gs','r32','r16'],
  qf:     ['gs','r32','r16','qf'],
  sf:     ['gs','r32','r16','qf','sf'],
  finals: ['gs','r32','r16','qf','sf','tp','f'],
}
const ROUND_ORDER: RoundId[] = ['gs','r32','r16','qf','sf','tp','f']

// ── Challenge Results tab ─────────────────────────────────────────────────────
function ChallengeResultsTab({ selectedComp }: { selectedComp: string | null }) {
  const { session } = useSupabase()
  const [challenges, setChallenges] = useState<any[]>([])
  const [loading,    setLoading]    = useState(true)
  const myId = session?.user.id ?? ''

  useEffect(() => {
    if (!session || !selectedComp) { setLoading(false); return }
    setLoading(true)
    fetch(`/api/comp-challenges?comp_id=${selectedComp}`)
      .then(r => r.json())
      .then(data => {
        setChallenges((data.data ?? []).filter((c: any) => c.settled))
        setLoading(false)
      })
  }, [session, selectedComp])

  if (loading) return <div className="flex justify-center py-16"><Spinner className="w-7 h-7" /></div>

  if (!selectedComp || challenges.length === 0) return (
    <EmptyState
      title="No challenge results yet"
      description="Challenges are settled automatically when match results are entered."
    />
  )

  const MEDALS = ['🥇','🥈','🥉']

  return (
    <div className="space-y-3">
      {challenges.map((c: any) => {
        const fx      = Array.isArray(c.fixtures) ? c.fixtures[0] : c.fixtures
        const winners = (c.challenge_winners ?? []) as any[]
        const iWon    = winners.some((w: any) => w.user_id === myId)

        return (
          <div key={c.id} className={clsx(
            'rounded-xl border p-4',
            iWon ? 'bg-amber-50 border-amber-300' : 'bg-white border-gray-200'
          )}>
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-900">
                    {fx ? `${fx.home} vs ${fx.away}` : 'Match'}
                  </p>
                  {fx && (
                    <span className="text-[11px] text-gray-400">
                      {new Date(fx.kickoff_utc).toLocaleDateString('en-AU', {
                        weekday: 'short', day: 'numeric', month: 'short'
                      })}
                    </span>
                  )}
                  {iWon && (
                    <span className="text-[11px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                      🏆 You won!
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-purple-700 mt-0.5">
                  🎯 {c.prize}{c.sponsor ? ` · ${c.sponsor}` : ''}
                </p>
                {fx?.home_score !== null && fx?.home_score !== undefined && (
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Result: <span className="font-semibold">{fx.home_score}–{fx.away_score}</span>
                  </p>
                )}
              </div>
              <span className="text-[10px] text-gray-400 flex-shrink-0">
                {new Date(c.challenge_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
              </span>
            </div>

            {/* Winners */}
            {winners.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No bonus score predictions — no winner this round</p>
            ) : (
              <div>
                <p className="text-[11px] font-medium text-gray-500 mb-2 uppercase tracking-wide">
                  {winners.length} winner{winners.length !== 1 ? 's' : ''}
                </p>
                <div className="space-y-1.5">
                  {winners.map((w: any, i: number) => {
                    const u    = Array.isArray(w.users) ? w.users[0] : w.users
                    const isMe = w.user_id === myId
                    return (
                      <div key={w.user_id}
                        className={clsx(
                          'flex items-center gap-2 rounded-lg px-3 py-2',
                          isMe ? 'bg-amber-100 border border-amber-300' : 'bg-gray-50'
                        )}>
                        <span className="text-base flex-shrink-0">
                          {MEDALS[i] ?? `${i+1}.`}
                        </span>
                        <Avatar name={u?.display_name ?? '?'} size="xs" />
                        <div className="flex-1 min-w-0">
                          <p className={clsx('text-xs font-medium truncate', isMe && 'text-amber-800')}>
                            {u?.display_name ?? 'Player'}{isMe ? ' (you)' : ''}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            Predicted: <span className="font-mono font-semibold">{w.prediction}</span>
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main ScoreBoard page ──────────────────────────────────────────────────────
export default function LeaderboardPage() {
  const { session, supabase } = useSupabase()

  const [mainTab,    setMainTab]    = useState<MainTab>('leaderboard')
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
  const [expanded,  setExpanded]  = useState<string | null>(null)

  const fetchLeaderboard = async (sc: Scope, tournId?: string | null) => {
    setLoading(true); setError(null); setMessage(null)
    const tid = tournId ?? activeTournamentId
    try {
      const url = `/api/leaderboard?scope=${sc}&limit=100${tid ? `&tournament_id=${tid}` : ''}`
      const res  = await fetch(url)
      const json = await res.json().catch(() => ({}))
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
        () => fetchLeaderboard(scope))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, session, scope])

  const filteredEntries = useMemo(() => {
    if (roundView === 'all') return entries.map((e, i) => ({ ...e, rank: i + 1 }))
    const validRounds = new Set(
      SNAPSHOT_TO_ROUNDS[roundView] ??
      ROUND_ORDER.slice(0, ROUND_ORDER.indexOf(roundView as RoundId) + 1)
    )
    return entries
      .map(e => {
        const rb  = e.round_breakdown ?? {}
        // Ensure values are numbers (JSON may return strings)
        const pts = Object.entries(rb)
          .filter(([r]) => validRounds.has(r as RoundId))
          .reduce((sum, [, v]) => sum + Number(v), 0)
        return { ...e, total_points: pts }
      })
      .filter(e => e.total_points > 0 || roundView === 'all')
      .sort((a, b) =>
        b.total_points !== a.total_points
          ? b.total_points - a.total_points
          : (b.bonus_count ?? 0) - (a.bonus_count ?? 0)
      )
      .map((e, i) => ({ ...e, rank: i + 1 }))
  }, [entries, roundView])

  const top3     = useMemo(() => filteredEntries.slice(0, 3), [filteredEntries])
  const myId     = session?.user.id
  const amInList = filteredEntries.some(e => e.user_id === myId)

  return (
    <div className="max-w-3xl mx-auto px-4 py-4">

      {/* Page header */}
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-gray-900">ScoreBoard</h1>
        <p className="text-xs text-gray-500 mt-0.5">Updates instantly when results are confirmed</p>
      </div>

      {/* Comp selector — always visible at top, filters all tabs */}
      {userComps.length > 0 && (
        <div className="mb-4">
          {userComps.length === 1 ? (
            <div className="flex items-center gap-2.5 px-3 py-2.5 bg-white border border-gray-200 rounded-xl">
              <span className="text-xl">🏢</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Viewing comp</p>
                <p className="text-sm font-bold text-gray-900 truncate">{userComps[0].name}</p>
              </div>
            </div>
          ) : (
            <div>
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
        </div>
      )}

      {/* Top-level tabs: Leaderboard / Challenge Results */}
      <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl">
        {([
          { id: 'leaderboard', label: '🏆 Leaderboard' },
          { id: 'challenges',  label: '🎯 Challenge Results' },
        ] as { id: MainTab; label: string }[]).map(t => (
          <button key={t.id} onClick={() => setMainTab(t.id)}
            className={clsx(
              'flex-1 py-2 text-xs font-medium rounded-lg transition-colors',
              mainTab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Challenge Results tab */}
      {mainTab === 'challenges' && <ChallengeResultsTab selectedComp={selectedComp} />}

      {/* Leaderboard tab */}
      {mainTab === 'leaderboard' && (
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

          {/* Round snapshot pills */}
          <div className="flex gap-1.5 flex-wrap mb-4">
            {ROUND_SNAPSHOTS.map(r => (
              <button key={r.id} onClick={() => setRoundView(r.id)}
                className={clsx(
                  'px-3 py-1.5 text-xs font-medium border rounded-full transition-colors whitespace-nowrap',
                  roundView === r.id
                    ? 'bg-green-600 border-green-700 text-white'
                    : 'border-gray-300 text-gray-500 hover:bg-gray-50'
                )}>
                {r.label}
              </button>
            ))}
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
              {/* Podium */}
              {top3.length >= 3 && (
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {[top3[1], top3[0], top3[2]].map((entry, i) => {
                    const podiumRank = [2,1,3][i]
                    const heights   = ['h-24','h-32','h-20']
                    const isMe = entry.user_id === myId
                    return (
                      <div key={entry.user_id} className="flex flex-col items-center gap-1.5">
                        <Avatar name={entry.display_name} size="md" />
                        <p className={clsx('text-xs font-medium text-center truncate w-full px-1', isMe && 'text-green-700')}>
                          {entry.display_name.split(' ')[0]}{isMe && ' (you)'}
                        </p>
                        {scope === 'global' && entry.comp_name && (
                          <p className="text-[9px] text-gray-400 truncate w-full text-center px-1">{entry.comp_name}</p>
                        )}
                        <div className={clsx('w-full flex flex-col items-center justify-end rounded-t-lg pb-3 pt-2', heights[i],
                          podiumRank===1?'bg-amber-100':podiumRank===2?'bg-gray-100':'bg-orange-50')}>
                          <Medal rank={podiumRank} />
                          <span className="text-sm font-semibold text-gray-800 mt-1">{entry.total_points}</span>
                          <span className="text-[10px] text-gray-500">pts</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Table */}
              <Card className="overflow-hidden p-0">
                <div className="grid grid-cols-[32px_1fr_80px_60px_60px] gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                  <span>#</span>
                  <span>Player</span>
                  <span className="text-right">Points</span>
                  <span className="text-right">Bonus</span>
                  <span className="text-right">✓</span>
                </div>

                {filteredEntries.map((entry, i) => {
                  const isMe       = entry.user_id === myId
                  const isExpanded = expanded === entry.user_id
                  return (
                    <div key={entry.user_id}>
                      <button
                        className={clsx(
                          'w-full grid grid-cols-[32px_1fr_80px_60px_60px] gap-2 px-3 py-2.5 border-b border-gray-100 last:border-0 text-left transition-colors',
                          isMe ? 'bg-green-50 hover:bg-green-100' : 'hover:bg-gray-50'
                        )}
                        onClick={() => setExpanded(isExpanded ? null : entry.user_id)}
                      >
                        <div className="flex items-center justify-center">
                          <Medal rank={entry.rank ?? i+1} />
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
                                  type: 'rank', rank: entry.rank ?? i+1,
                                  points: entry.total_points, bonus: entry.bonus_count,
                                  correct: entry.correct_count, displayName: entry.display_name,
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
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-end">
                          <span className={clsx('text-sm font-semibold', isMe ? 'text-green-700' : 'text-gray-900')}>
                            {entry.total_points}
                          </span>
                        </div>
                        <div className="flex items-center justify-end">
                          <span className="text-xs text-purple-700 font-medium">{entry.bonus_count}</span>
                        </div>
                        <div className="flex items-center justify-end">
                          <span className="text-xs text-blue-700 font-medium">{entry.correct_count}</span>
                        </div>
                      </button>

                      {isExpanded && entry.round_breakdown && (
                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                          <p className="text-[11px] font-medium text-gray-500 mb-2 uppercase tracking-wide">Points by round</p>
                          <div className="flex gap-2 flex-wrap">
                            {(Object.entries(entry.round_breakdown) as [RoundId, number][])
                              .filter(([, pts]) => pts > 0)
                              .map(([round, pts]) => (
                                <div key={round} className="flex flex-col items-center bg-white border border-gray-200 rounded-md px-2.5 py-1.5">
                                  <span className="text-[10px] text-gray-500">{getDefaultScoringConfig().rounds[round as any]?.round_name ?? round}</span>
                                  <span className="text-sm font-semibold text-gray-800">{pts}</span>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </Card>

              <div className="flex gap-4 mt-3 text-[11px] text-gray-400">
                <span><span className="text-purple-600 font-medium">Bonus</span> = correct scoreline</span>
                <span><span className="text-blue-600 font-medium">✓</span> = right result, wrong score</span>
              </div>

              {/* Player position note */}
              {myEntry && !amInList && (
                <div className="mt-3 flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex-wrap">
                  <div className="w-7 h-7 rounded-full bg-green-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {(myEntry.display_name ?? 'Y').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-green-800">
                      You are ranked <span className="text-green-700">#{myEntry.rank}</span> — outside the top {scope === 'tribe' ? 25 : 50}
                    </p>
                    <p className="text-[11px] text-green-600 mt-0.5">
                      {myEntry.total_points} pts · {myEntry.bonus_count} bonus · {myEntry.correct_count} correct
                      {myEntry.tribe_name && ` · ${myEntry.tribe_name}`}
                    </p>
                  </div>
                  <span className="text-xl font-bold text-green-700">#{myEntry.rank}</span>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
