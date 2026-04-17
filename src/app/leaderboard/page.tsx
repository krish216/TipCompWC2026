'use client'

import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { Avatar, Medal, StatCard, Spinner, EmptyState, Card } from '@/components/ui'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import type { LeaderboardEntry, RoundId } from '@/types'

type Scope = 'global' | 'tribe'

const ROUND_LABELS: Record<RoundId, string> = {
  gs: 'GS', r32: 'R32', r16: 'R16', qf: 'QF', sf: 'SF', tp: '3rd', f: 'Final',
}

export default function LeaderboardPage() {
  const { session, supabase } = useSupabase()
  const [scope,     setScope]     = useState<Scope>('global')
  const [entries,   setEntries]   = useState<LeaderboardEntry[]>([])
  const [myEntry,   setMyEntry]   = useState<LeaderboardEntry | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [expanded,  setExpanded]  = useState<string | null>(null)   // expanded user id

  const fetchLeaderboard = async (sc: Scope) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/leaderboard?scope=${sc}&limit=100`)
      if (!res.ok) throw new Error('Failed to fetch leaderboard')
      const { data, my_entry, error: apiErr } = await res.json()
      if (apiErr) { setError(apiErr); return }
      setEntries(data ?? [])
      setMyEntry(my_entry ?? null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (session) fetchLeaderboard(scope) }, [session, scope])

  // Realtime refresh when any prediction is scored
  useEffect(() => {
    if (!session) return
    const channel = supabase
      .channel('lb-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'predictions' },
        () => fetchLeaderboard(scope))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, session, scope])

  // Top 3 for podium
  const top3 = useMemo(() => entries.slice(0, 3), [entries])
  const rest  = useMemo(() => entries.slice(3), [entries])

  const myId = session?.user.id

  return (
    <div className="max-w-3xl mx-auto px-4 py-4">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-gray-900">Leaderboard</h1>
        <p className="text-xs text-gray-500 mt-0.5">Updates instantly when match results are confirmed</p>
      </div>

      {/* Scope toggle */}
      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit">
        {(['global', 'tribe'] as Scope[]).map(s => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className={clsx(
              'px-4 py-1.5 text-xs font-medium rounded-md transition-colors capitalize',
              scope === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {/* My position card (if not in top results) */}
      {myEntry && !entries.find(e => e.user_id === myId) && (
        <div className="mb-3 bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-center gap-3">
          <span className="text-xs text-green-700 font-medium">Your rank: #{myEntry.rank}</span>
          <div className="h-4 w-px bg-green-200" />
          <span className="text-xs text-green-600">{myEntry.total_points} pts</span>
          <div className="h-4 w-px bg-green-200" />
          <span className="text-xs text-gray-500">★{myEntry.exact_count} exact · ✓{myEntry.correct_count} correct</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="w-7 h-7" /></div>
      ) : error ? (
        <EmptyState title={error} description="Try refreshing the page." />
      ) : entries.length === 0 ? (
        <EmptyState
          title={scope === 'tribe' ? 'You are not in a tribe yet' : 'No predictions yet'}
          description={scope === 'tribe' ? 'Join or create a tribe from the Tribe page.' : 'Be the first to enter predictions!'}
        />
      ) : (
        <>
          {/* Podium — top 3 */}
          {top3.length >= 3 && (
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[top3[1], top3[0], top3[2]].map((entry, i) => {
                const podiumRank = [2, 1, 3][i]
                const heights   = ['h-24', 'h-32', 'h-20']
                const isMe      = entry.user_id === myId
                return (
                  <div key={entry.user_id} className="flex flex-col items-center gap-1.5">
                    <Avatar name={entry.display_name} size="md" />
                    <p className={clsx('text-xs font-medium text-center', isMe && 'text-green-700')}>
                      {entry.display_name.split(' ')[0]}
                      {isMe && ' (you)'}
                    </p>
                    <div
                      className={clsx(
                        'w-full flex flex-col items-center justify-end rounded-t-lg pb-3 pt-2',
                        heights[i],
                        podiumRank === 1 ? 'bg-amber-100' : podiumRank === 2 ? 'bg-gray-100' : 'bg-orange-50'
                      )}
                    >
                      <Medal rank={podiumRank} />
                      <span className="text-sm font-semibold text-gray-800 mt-1">{entry.total_points}</span>
                      <span className="text-[10px] text-gray-500">pts</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Full table */}
          <Card className="overflow-hidden p-0">
            {/* Table header */}
            <div className="grid grid-cols-[32px_1fr_80px_60px_60px] gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 text-[11px] font-medium text-gray-500 uppercase tracking-wide">
              <span>#</span>
              <span>Player</span>
              <span className="text-right">Points</span>
              <span className="text-right">Exact</span>
              <span className="text-right">Correct</span>
            </div>

            {entries.map((entry, i) => {
              const isMe      = entry.user_id === myId
              const isExpanded = expanded === entry.user_id
              return (
                <div key={entry.user_id}>
                  <button
                    className={clsx(
                      'w-full grid grid-cols-[32px_1fr_80px_60px_60px] gap-2 px-3 py-2.5',
                      'border-b border-gray-100 last:border-0 text-left transition-colors',
                      isMe ? 'bg-green-50 hover:bg-green-100' : 'hover:bg-gray-50',
                    )}
                    onClick={() => setExpanded(isExpanded ? null : entry.user_id)}
                  >
                    {/* Rank */}
                    <div className="flex items-center justify-center">
                      <Medal rank={entry.rank ?? i + 1} />
                    </div>

                    {/* Player */}
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar name={entry.display_name} size="xs" />
                      <div className="min-w-0">
                        <p className={clsx('text-xs font-medium truncate', isMe && 'text-green-700')}>
                          {entry.display_name}{isMe && ' (you)'}
                        </p>
                        {entry.tribe_name && (
                          <p className="text-[10px] text-gray-400 truncate">{entry.tribe_name}</p>
                        )}
                      </div>
                    </div>

                    {/* Points */}
                    <div className="flex items-center justify-end">
                      <span className={clsx(
                        'text-sm font-semibold',
                        isMe ? 'text-green-700' : 'text-gray-900'
                      )}>
                        {entry.total_points}
                      </span>
                    </div>

                    {/* Exact */}
                    <div className="flex items-center justify-end">
                      <span className="text-xs text-purple-700 font-medium">{entry.bonus_count}</span>
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
                              <span className="text-[10px] text-gray-500">{ROUND_LABELS[round]}</span>
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

          {/* Legend */}
          <div className="flex gap-4 mt-3 text-[11px] text-gray-400">
            <span><span className="text-purple-600 font-medium">Exact</span> = correct scoreline</span>
            <span><span className="text-blue-600 font-medium">Correct</span> = right result, wrong score</span>
          </div>
        </>
      )}
    </div>
  )
}
