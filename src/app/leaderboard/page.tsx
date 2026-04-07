'use client'

import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { Avatar, Medal, Spinner, EmptyState, Card } from '@/components/ui'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import type { LeaderboardEntry, RoundId } from '@/types'
import { ShareButton } from '@/components/game/ShareCard'
import { SCORING } from '@/types'

type Scope     = 'tribe' | 'org' | 'global'
type RoundView = 'all' | RoundId

const SCOPE_LABELS: Record<Scope, string> = {
  tribe:  'My tribe',
  org:    'My organisation',
  global: 'Global',
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

export default function LeaderboardPage() {
  const { session, supabase } = useSupabase()

  const [scope,     setScope]     = useState<Scope>('org')
  const [roundView, setRoundView] = useState<RoundView>('all')
  const [entries,   setEntries]   = useState<any[]>([])
  const [myEntry,   setMyEntry]   = useState<any | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [message,   setMessage]   = useState<string | null>(null)
  const [expanded,  setExpanded]  = useState<string | null>(null)

  const fetchLeaderboard = async (sc: Scope) => {
    setLoading(true); setError(null); setMessage(null)
    try {
      const res = await fetch(`/api/leaderboard?scope=${sc}&limit=100`)
      if (!res.ok) throw new Error('Failed to fetch')
      const { data, my_entry, message: msg, error: apiErr } = await res.json()
      if (apiErr) { setError(apiErr); return }
      setEntries(data ?? [])
      setMyEntry(my_entry ?? null)
      setMessage(msg ?? null)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { if (session) fetchLeaderboard(scope) }, [session, scope])

  useEffect(() => {
    if (!session) return
    const channel = supabase.channel('lb-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'predictions' },
        () => fetchLeaderboard(scope))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, session, scope])

  // Apply round snapshot filter client-side
  const filteredEntries = useMemo(() => {
    if (roundView === 'all') return entries.map((e, i) => ({ ...e, rank: i + 1 }))
    const validRounds = new Set(
      SNAPSHOT_TO_ROUNDS[roundView] ??
      ROUND_ORDER.slice(0, ROUND_ORDER.indexOf(roundView as RoundId) + 1)
    )
    return entries
      .map(e => {
        const rb  = e.round_breakdown ?? {}
        const pts = Object.entries(rb)
          .filter(([r]) => validRounds.has(r as RoundId))
          .reduce((sum, [, v]) => sum + (v as number), 0)
        return { ...e, total_points: pts }
      })
      .sort((a, b) => b.total_points - a.total_points)
      .map((e, i) => ({ ...e, rank: i + 1 }))
  }, [entries, roundView])

  const top3  = useMemo(() => filteredEntries.slice(0, 3), [filteredEntries])
  const myId  = session?.user.id
  const amInList = filteredEntries.some(e => e.user_id === myId)

  return (
    <div className="max-w-3xl mx-auto px-4 py-4">
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-gray-900">Leaderboard</h1>
        <p className="text-xs text-gray-500 mt-0.5">Updates instantly when results are confirmed</p>
      </div>

      {/* Scope tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg">
        {(['tribe','org','global'] as Scope[]).map(s => (
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

      {/* My position banner (when out of visible range) */}
      {myEntry && !amInList && (
        <div className="mb-3 bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-green-700 font-semibold">Your rank: #{myEntry.rank}</span>
          <div className="h-4 w-px bg-green-200" />
          <span className="text-xs text-green-600">{myEntry.total_points} pts</span>
          {myEntry.tribe_name && <><div className="h-4 w-px bg-green-200" /><span className="text-xs text-gray-500">{myEntry.tribe_name}</span></>}
          {myEntry.org_name && scope === 'global' && <><div className="h-4 w-px bg-green-200" /><span className="text-xs text-gray-500">{myEntry.org_name}</span></>}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="w-7 h-7" /></div>
      ) : error ? (
        <EmptyState title={error} description="Try refreshing." />
      ) : message ? (
        <EmptyState title={message} description={scope === 'tribe' ? 'Go to the Tribe tab to join one.' : ''} />
      ) : filteredEntries.length === 0 ? (
        <EmptyState
          title={scope === 'tribe' ? 'No tribe members yet' : scope === 'org' ? 'No organisation members yet' : 'No predictions yet'}
          description={scope === 'tribe' ? 'Invite friends to your tribe.' : 'Be the first!'}
        />
      ) : (
        <>
          {/* Podium — top 3 */}
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
                    {scope === 'global' && entry.org_name && (
                      <p className="text-[9px] text-gray-400 truncate w-full text-center px-1">{entry.org_name}</p>
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
            {/* Header */}
            <div className={clsx(
              'grid gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 text-[11px] font-medium text-gray-500 uppercase tracking-wide',
              scope === 'global' ? 'grid-cols-[32px_1fr_80px_60px_60px]' : 'grid-cols-[32px_1fr_80px_60px_60px]'
            )}>
              <span>#</span>
              <span>Player</span>
              <span className="text-right">Points</span>
              <span className="text-right">Exact</span>
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
                    {/* Rank */}
                    <div className="flex items-center justify-center">
                      <Medal rank={entry.rank ?? i+1} />
                    </div>

                    {/* Player info */}
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar name={entry.display_name} size="xs" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className={clsx('text-xs font-medium truncate', isMe && 'text-green-700')}>
                            {entry.display_name}{isMe ? ' (you)' : ''}
                          </p>
                          {isMe && (
                            <ShareButton compact payload={{
                              type:        'rank',
                              rank:        entry.rank ?? i + 1,
                              points:      entry.total_points,
                              exact:       entry.exact_count,
                              correct:     entry.correct_count,
                              displayName: entry.display_name,
                              roundLabel:  ROUND_SNAPSHOTS.find(r => r.id === roundView)?.label,
                            }} />
                          )}
                        </div>
                        {/* Tribe + org context */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {entry.tribe_name && (
                            <span className="text-[10px] text-gray-400 truncate">
                              🏆 {entry.tribe_name}
                            </span>
                          )}
                          {scope === 'global' && entry.org_name && entry.org_name !== 'PUBLIC' && (
                            <span className="text-[10px] text-blue-400 truncate">
                              · 🏢 {entry.org_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Points */}
                    <div className="flex items-center justify-end">
                      <span className={clsx('text-sm font-semibold', isMe ? 'text-green-700' : 'text-gray-900')}>
                        {entry.total_points}
                      </span>
                    </div>

                    {/* Exact */}
                    <div className="flex items-center justify-end">
                      <span className="text-xs text-purple-700 font-medium">{entry.exact_count}</span>
                    </div>

                    {/* Correct */}
                    <div className="flex items-center justify-end">
                      <span className="text-xs text-blue-700 font-medium">{entry.correct_count}</span>
                    </div>
                  </button>

                  {/* Expanded round breakdown */}
                  {isExpanded && entry.round_breakdown && (
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                      <p className="text-[11px] font-medium text-gray-500 mb-2 uppercase tracking-wide">Points by round</p>
                      <div className="flex gap-2 flex-wrap">
                        {(Object.entries(entry.round_breakdown) as [RoundId, number][])
                          .filter(([, pts]) => pts > 0)
                          .map(([round, pts]) => (
                            <div key={round} className="flex flex-col items-center bg-white border border-gray-200 rounded-md px-2.5 py-1.5">
                              <span className="text-[10px] text-gray-500">{SCORING[round]?.label ?? round}</span>
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
            <span><span className="text-purple-600 font-medium">Exact</span> = correct scoreline</span>
            <span><span className="text-blue-600 font-medium">✓</span> = right result, wrong score</span>
          </div>
        </>
      )}
    </div>
  )
}
