'use client'
import { useState, useEffect, useCallback } from 'react'
import { useSession } from '@/components/layout/SessionContext'
import Link from 'next/link'

// ── Types ────────────────────────────────────────────────────────────────────
interface DemoFixture {
  id:          number
  group:       string
  home:        string
  away:        string
  kickoff_utc: string
  result:      { home: number; away: number; result_outcome: string } | null
  has_result:  boolean
  prediction:  { outcome: string } | null
}

interface LeaderEntry {
  rank:          number
  user_id:       string
  display_name:  string
  total_points:  number
  correct_count: number
  predictions:   number
}

const OUTCOME_LABELS: Record<string, string> = { H: 'Home win', A: 'Away win', D: 'Draw' }
const OUTCOME_ICONS:  Record<string, string> = { H: '🏠', A: '✈️',  D: '🤝' }

function OutcomeLabel({ outcome, home, away }: { outcome: string; home: string; away: string }) {
  if (outcome === 'H') return <span>{home} win</span>
  if (outcome === 'A') return <span>{away} win</span>
  return <span>Draw</span>
}

// ── Fixture Card ──────────────────────────────────────────────────────────────
function FixtureCard({
  fixture, onPredict, submitting,
}: {
  fixture:    DemoFixture
  onPredict:  (id: number, outcome: string) => Promise<void>
  submitting: number | null
}) {
  const { home, away, group, kickoff_utc, result, has_result, prediction, id } = fixture
  const [selected, setSelected] = useState<string | null>(prediction?.outcome ?? null)
  const isSubmitting = submitting === id
  const revealed = !!result

  const kick = new Date(kickoff_utc)
  const dateStr = kick.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
  const timeStr = kick.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })

  const handlePick = async (outcome: string) => {
    if (revealed) return
    setSelected(outcome)
    await onPredict(id, outcome)
  }

  const resultOutcome = result?.result_outcome
  const isCorrect = revealed && selected && resultOutcome === selected

  return (
    <div className={`rounded-2xl border transition-all mb-3 overflow-hidden ${
      revealed && isCorrect  ? 'border-emerald-300 bg-emerald-50/60' :
      revealed && selected   ? 'border-red-200 bg-red-50/40' :
      revealed               ? 'border-gray-200 bg-gray-50/40' :
      'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Group {group}</span>
        <span className="text-[10px] text-gray-400">{dateStr} · {timeStr}</span>
      </div>

      {/* Teams */}
      <div className="flex items-center gap-2 px-4 pb-3">
        <span className="flex-1 text-sm font-bold text-gray-900 truncate">{home}</span>
        {revealed ? (
          <span className="flex items-baseline gap-1.5 flex-shrink-0">
            <span className={`text-xl font-black tabular-nums ${resultOutcome === 'H' ? 'text-emerald-600' : 'text-gray-400'}`}>
              {result!.home}
            </span>
            <span className="text-xs text-gray-300 font-light">–</span>
            <span className={`text-xl font-black tabular-nums ${resultOutcome === 'A' ? 'text-emerald-600' : 'text-gray-400'}`}>
              {result!.away}
            </span>
          </span>
        ) : (
          <span className="text-xs font-bold text-gray-300 flex-shrink-0">vs</span>
        )}
        <span className="flex-1 text-sm font-bold text-gray-900 truncate text-right">{away}</span>
      </div>

      {/* Predict / Result row */}
      {!revealed && has_result ? (
        <div className="border-t border-gray-100 px-4 py-2.5">
          {!prediction ? (
            <div className="flex gap-1.5">
              {['H', 'D', 'A'].map(o => (
                <button
                  key={o}
                  disabled={isSubmitting}
                  onClick={() => handlePick(o)}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    selected === o
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                  } disabled:opacity-50`}>
                  {isSubmitting && selected === o ? '…' : (
                    o === 'H' ? home.split(' ')[0] : o === 'A' ? away.split(' ')[0] : 'Draw'
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">You picked: <span className="font-semibold text-gray-700">
                <OutcomeLabel outcome={prediction.outcome} home={home} away={away} />
              </span></span>
              <span className="text-[11px] text-amber-600 font-medium">🔒 Locked — result hidden</span>
            </div>
          )}
        </div>
      ) : revealed ? (
        <div className="border-t px-4 py-2 flex items-center justify-between">
          {selected ? (
            <>
              <span className={`text-xs font-bold ${isCorrect ? 'text-emerald-600' : 'text-red-500'}`}>
                {isCorrect ? '✓ Correct' : '✗ Wrong'} — you picked <OutcomeLabel outcome={selected} home={home} away={away} />
              </span>
              <span className={`text-xs font-black ${isCorrect ? 'text-emerald-700' : 'text-gray-300'}`}>
                {isCorrect ? '+3 pts' : '0 pts'}
              </span>
            </>
          ) : (
            <span className="text-xs text-gray-400 italic">No prediction submitted</span>
          )}
        </div>
      ) : (
        <div className="border-t border-gray-100 px-4 py-2">
          <p className="text-[11px] text-gray-400 text-center italic">No AI result yet — waiting for admin to generate</p>
        </div>
      )}
    </div>
  )
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
function Leaderboard({ entries, myUserId, totalFixtures }: {
  entries: LeaderEntry[]; myUserId: string | null; totalFixtures: number
}) {
  if (!entries.length) return (
    <div className="text-center py-12">
      <p className="text-3xl mb-2">🏆</p>
      <p className="text-sm text-gray-500">No predictions yet.</p>
      <p className="text-xs text-gray-400 mt-1">Be the first to predict and appear here!</p>
    </div>
  )
  return (
    <div>
      <div className="flex items-center justify-between px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100">
        <span>Tipster</span>
        <div className="flex gap-4">
          <span>Correct</span>
          <span className="w-12 text-right">Pts</span>
        </div>
      </div>
      {entries.map((e, i) => {
        const isMe = e.user_id === myUserId
        return (
          <div key={e.user_id}
            className={`flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0 ${isMe ? 'bg-emerald-50' : i % 2 === 1 ? 'bg-gray-50/30' : ''}`}>
            <span className={`text-xs font-black w-5 text-center flex-shrink-0 ${
              e.rank === 1 ? 'text-amber-500' : e.rank === 2 ? 'text-gray-400' : e.rank === 3 ? 'text-amber-700' : 'text-gray-300'
            }`}>
              {e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : e.rank}
            </span>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-bold truncate ${isMe ? 'text-emerald-700' : 'text-gray-800'}`}>
                {e.display_name}{isMe && ' (you)'}
              </p>
              <p className="text-[10px] text-gray-400">{e.predictions}/{totalFixtures} predicted</p>
            </div>
            <div className="flex items-center gap-4 flex-shrink-0">
              <span className="text-xs text-gray-500 w-10 text-center">{e.correct_count} ✓</span>
              <span className={`text-sm font-black w-12 text-right ${isMe ? 'text-emerald-700' : 'text-gray-800'}`}>
                {e.total_points}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DemoPage() {
  const { session } = useSession()
  const [tab,         setTab]         = useState<'predict' | 'board'>('predict')
  const [fixtures,    setFixtures]    = useState<DemoFixture[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([])
  const [loading,     setLoading]     = useState(true)
  const [submitting,  setSubmitting]  = useState<number | null>(null)
  const [tournamentId, setTournamentId] = useState<string | null>(null)
  const [totalFixtures, setTotalFixtures] = useState(0)
  const [groupFilter, setGroupFilter] = useState<string>('all')

  // Load active tournament first
  useEffect(() => {
    fetch('/api/tournaments?active=1')
      .then(r => r.json())
      .then(d => {
        const tid = d.data?.[0]?.id ?? null
        setTournamentId(tid)
      }).catch(() => setLoading(false))
  }, [])

  const loadFixtures = useCallback(async () => {
    if (!tournamentId) return
    const res  = await fetch(`/api/demo/fixtures?tournament_id=${tournamentId}`)
    const data = await res.json()
    setFixtures(data.data ?? [])
    setLoading(false)
  }, [tournamentId])

  const loadLeaderboard = useCallback(async () => {
    if (!tournamentId) return
    const res  = await fetch(`/api/demo/leaderboard?tournament_id=${tournamentId}`)
    const data = await res.json()
    setLeaderboard(data.data ?? [])
    setTotalFixtures(data.total_fixtures ?? 0)
  }, [tournamentId])

  useEffect(() => {
    if (!tournamentId) return
    loadFixtures()
    loadLeaderboard()
  }, [tournamentId, loadFixtures, loadLeaderboard])

  const handlePredict = async (fixtureId: number, outcome: string) => {
    if (!session) return
    setSubmitting(fixtureId)
    const res  = await fetch('/api/demo/predictions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demo_fixture_id: fixtureId, outcome }),
    })
    const data = await res.json()
    setSubmitting(null)
    if (data.result) {
      // Update fixture state to reveal result
      setFixtures(prev => prev.map(f => f.id === fixtureId ? {
        ...f,
        result:     data.result,
        prediction: { outcome },
      } : f))
      // Refresh leaderboard
      loadLeaderboard()
    }
  }

  const groups = ['all', ...Array.from(new Set(fixtures.map(f => f.group))).sort()]
  const visibleFixtures = groupFilter === 'all'
    ? fixtures
    : fixtures.filter(f => f.group === groupFilter)

  const myUserId = session?.user?.id ?? null
  const predicted = fixtures.filter(f => f.prediction).length
  const revealed  = fixtures.filter(f => f.result).length

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">⚽</span>
              <h1 className="text-2xl font-black text-gray-900">Pre-Tournament Practice</h1>
            </div>
            <p className="text-sm text-gray-500">
              AI-generated results · real scoring rules · no stakes · warm up your tipping before the tournament begins
            </p>
          </div>
          {!session && (
            <Link href="/login?tab=register"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors flex-shrink-0">
              Sign up to predict →
            </Link>
          )}
        </div>

        {/* Stats bar */}
        {fixtures.length > 0 && (
          <div className="flex gap-4 mt-4 flex-wrap">
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-center">
              <p className="text-lg font-black text-gray-900">{fixtures.length}</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Fixtures</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-center">
              <p className="text-lg font-black text-emerald-700">{revealed}</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Results ready</p>
            </div>
            {session && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-center">
                <p className="text-lg font-black text-blue-700">{predicted}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Your picks</p>
              </div>
            )}
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-center">
              <p className="text-lg font-black text-purple-700">{leaderboard.length}</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Tipsters</p>
            </div>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1">
        {(['predict', 'board'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t === 'predict' ? '⚽ Predict' : '🏆 Scoreboard'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
        </div>
      ) : fixtures.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl">
          <p className="text-4xl mb-3">⏳</p>
          <p className="text-sm font-semibold text-gray-700">No demo fixtures yet</p>
          <p className="text-xs text-gray-400 mt-1">The tournament admin will set these up soon.</p>
        </div>
      ) : (
        <>
          {tab === 'predict' && (
            <div>
              {!session && (
                <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
                  <span className="text-xl">👋</span>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-amber-800">Sign in to make predictions</p>
                    <p className="text-[11px] text-amber-600">Your picks and points will be tracked on the scoreboard.</p>
                  </div>
                  <Link href="/login" className="text-xs font-bold text-amber-700 underline flex-shrink-0">Sign in →</Link>
                </div>
              )}

              {/* Group filter */}
              <div className="flex gap-1.5 mb-4 flex-wrap">
                {groups.map(g => (
                  <button key={g} onClick={() => setGroupFilter(g)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${
                      groupFilter === g
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                    }`}>
                    {g === 'all' ? 'All Groups' : `Group ${g}`}
                  </button>
                ))}
              </div>

              {visibleFixtures.map(f => (
                <FixtureCard key={f.id} fixture={f} onPredict={handlePredict} submitting={submitting} />
              ))}
            </div>
          )}

          {tab === 'board' && (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-900">Pre-Tournament Scoreboard</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">AI results · results revealed after each tipster predicts</p>
                </div>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full">
                  LIVE DEMO
                </span>
              </div>
              <Leaderboard entries={leaderboard} myUserId={myUserId} totalFixtures={totalFixtures} />
            </div>
          )}
        </>
      )}

      {/* Footer note */}
      <p className="text-center text-[11px] text-gray-300 mt-8">
        Pre-tournament practice mode · results AI-generated · not reflective of real outcomes ·{' '}
        <Link href="/" className="underline">Home</Link>
      </p>
    </div>
  )
}
