'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { Spinner, EmptyState, Card } from '@/components/ui'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { getDefaultScoringConfig, type RoundId, type Fixture, type MatchScore } from '@/types'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'
import toast from 'react-hot-toast'

// ── Flag map ──────────────────────────────────────────────────────────────────
const FLAGS: Record<string, string> = {
  Mexico: '🇲🇽', 'South Africa': '🇿🇦', 'South Korea': '🇰🇷', Brazil: '🇧🇷', Morocco: '🇲🇦',
  Haiti: '🇭🇹', Scotland: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', USA: '🇺🇸', Paraguay: '🇵🇾', Australia: '🇦🇺',
  Germany: '🇩🇪', Ecuador: '🇪🇨', Netherlands: '🇳🇱', Japan: '🇯🇵', Tunisia: '🇹🇳',
  Belgium: '🇧🇪', Egypt: '🇪🇬', Iran: '🇮🇷', 'New Zealand': '🇳🇿', Spain: '🇪🇸',
  'Saudi Arabia': '🇸🇦', Uruguay: '🇺🇾', France: '🇫🇷', Senegal: '🇸🇳', Norway: '🇳🇴',
  Argentina: '🇦🇷', Algeria: '🇩🇿', Austria: '🇦🇹', Jordan: '🇯🇴', Portugal: '🇵🇹',
  Uzbekistan: '🇺🇿', Colombia: '🇨🇴', England: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', Croatia: '🇭🇷', Ghana: '🇬🇭',
  Panama: '🇵🇦', Canada: '🇨🇦', Switzerland: '🇨🇭', Qatar: '🇶🇦', 'Cabo Verde': '🇨🇻',
  "Côte d'Ivoire": '🇨🇮', 'Curaçao': '🏝️',
}
const flag = (t: string) => FLAGS[t] ?? '🏳️'

type FixtureMap = Partial<Record<RoundId, Fixture[]>>
type ResultMap  = Record<number, MatchScore & { pen_winner?: string | null }>
type LockMap    = Record<string, boolean>
type AdminTab   = 'results' | 'locks' | 'scoring' | 'tournament' | 'access' | 'demo'

// ALL_ROUNDS and ROUND_LABELS are now derived from tournament_rounds API
// via scoringConfig loaded in UserPrefsContext — no hardcoding

// ─── AdminResultRow ───────────────────────────────────────────────────────────
function AdminResultRow({ fixture, result, onSave, onClear, knockoutRounds }: {
  fixture: Fixture
  result?: MatchScore & { pen_winner?: string | null }
  knockoutRounds?: string[]
  onSave:  (id: number, home: number, away: number, penWinner?: string | null) => Promise<void>
  onClear: (id: number) => Promise<void>
}) {
  const [saving,    setSaving]    = useState(false)
  const [homeVal,   setHomeVal]   = useState(result?.home?.toString() ?? '')
  const [awayVal,   setAwayVal]   = useState(result?.away?.toString() ?? '')
  const [penWinner, setPenWinner] = useState<string>(result?.pen_winner ?? '')

  const isKnockout  = (knockoutRounds ?? []).includes(fixture.round)
  const h = parseInt(homeVal, 10), a = parseInt(awayVal, 10)
  const scoresLevel = !isNaN(h) && !isNaN(a) && h === a
  const showPenPick = isKnockout && scoresLevel

  const handleSave = async () => {
    if (isNaN(h) || isNaN(a) || h < 0 || a < 0) { toast.error('Enter valid scores'); return }
    if (showPenPick && !penWinner) { toast.error('Select the penalty winner'); return }
    setSaving(true)
    await onSave(fixture.id, h, a, showPenPick ? penWinner : null)
    setSaving(false)
  }

  const handleClear = async () => {
    if (!confirm(`Clear ${fixture.home} vs ${fixture.away}?`)) return
    setSaving(true)
    await onClear(fixture.id)
    setHomeVal(''); setAwayVal(''); setPenWinner('')
    setSaving(false)
  }

  return (
    <div className={clsx(
      'px-4 py-3 border-b border-gray-100 last:border-0',
      result ? 'bg-emerald-50/50' : 'hover:bg-gray-50/80',
      'transition-colors'
    )}>
      <div className="flex items-center gap-3 flex-wrap">
        {/* Teams */}
        <div className="flex-1 min-w-[180px]">
          <div className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
            <span>{flag(fixture.home)}</span>
            <span>{fixture.home}</span>
            <span className="text-gray-300 text-xs px-1">—</span>
            <span>{fixture.away}</span>
            <span>{flag(fixture.away)}</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">{new Date(fixture.kickoff_utc).toLocaleDateString("en-AU")} · {fixture.venue}</p>
        </div>

        {/* Result badge */}
        {result && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-md">
            {result.home}–{result.away}
            {result.pen_winner && <span className="text-emerald-600 ml-0.5">({result.pen_winner.split(' ').pop()} pens)</span>}
          </span>
        )}

        {/* Inputs */}
        <div className="flex items-center gap-1.5">
          <input type="number" min={0} max={30} placeholder="H" value={homeVal}
            onChange={e => setHomeVal(e.target.value)}
            className="w-10 h-8 text-center text-sm font-bold border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <span className="text-gray-300 font-bold">:</span>
          <input type="number" min={0} max={30} placeholder="A" value={awayVal}
            onChange={e => setAwayVal(e.target.value)}
            className="w-10 h-8 text-center text-sm font-bold border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <button onClick={handleSave} disabled={saving}
            className="px-3 h-8 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors">
            {saving ? '…' : 'Save'}
          </button>
          {result && (
            <button onClick={handleClear} disabled={saving}
              className="px-3 h-8 border border-gray-200 hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-50 text-gray-500 text-xs font-medium rounded-lg transition-colors">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Penalty picker */}
      {showPenPick && (
        <div className="mt-2 ml-0 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
            🥅 Pen winner
          </span>
          {[fixture.home, fixture.away].map(team => (
            <button key={team} onClick={() => setPenWinner(team)}
              className={clsx(
                'flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all',
                penWinner === team
                  ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                  : 'border-gray-200 text-gray-600 hover:border-emerald-400 hover:bg-emerald-50'
              )}>
              {flag(team)} {team}
            </button>
          ))}
          {!penWinner && <span className="text-[11px] text-amber-500">Select winner ↑</span>}
        </div>
      )}
    </div>
  )
}

// ─── Admin Page ───────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { session, supabase } = useSupabase()
  const { scoringConfig, selectedTournId, activeTournaments } = useUserPrefs()

  const [activeTab,   setActiveTab]   = useState<AdminTab>('results')

  // Derive round list from scoringConfig (loaded from tournament_rounds by UserPrefsContext)
  const ALL_ROUNDS = useMemo(() =>
    Object.values(scoringConfig.rounds)
      .sort((a, b) => (a.round_order ?? 0) - (b.round_order ?? 0))
      .map(r => r.round_code),
  [scoringConfig])

  const ROUND_LABELS = useMemo(() => {
    const m: Record<string, string> = {}
    Object.values(scoringConfig.rounds).forEach(r => { m[r.round_code] = r.round_name })
    return m
  }, [scoringConfig])

  const KNOCKOUT_ROUNDS = useMemo(() => scoringConfig.knockout_rounds, [scoringConfig])
  const [isAdmin,     setIsAdmin]     = useState<boolean | null>(null)  // null = checking
  const [fixtures,    setFixtures]    = useState<FixtureMap>({})
  const [results,     setResults]     = useState<ResultMap>({})
  const [locks,       setLocks]       = useState<LockMap>({})
  const [loading,     setLoading]     = useState(true)
  const [activeRound, setActiveRound] = useState<string>('')
  const [activeGroup, setActiveGroup] = useState('all')
  const [search,      setSearch]      = useState('')

  // Access tab state
  const [adminEmail,  setAdminEmail]  = useState('')
  const [grantingAccess, setGrantingAccess] = useState(false)

  // Tournament tab state
  const [tournLoading,   setTournLoading]   = useState(false)
  const [tournamentData, setTournamentData] = useState<any>(null)

  // ── Load ─────────────────────────────────────────────────
  // Set initial active round from DB when rounds load
  useEffect(() => {
    if (ALL_ROUNDS.length > 0 && !activeRound) {
      setActiveRound(ALL_ROUNDS[0])
    }
  }, [ALL_ROUNDS, activeRound])

  // Check admin access before loading any data
  useEffect(() => {
    if (!session) { setIsAdmin(false); return }
    fetch('/api/admin')
      .then(r => r.json())
      .then(d => setIsAdmin(!!d.is_admin))
      .catch(() => setIsAdmin(false))
  }, [session])

  useEffect(() => {
    if (!isAdmin) return
    setLoading(true)
    Promise.all([fetch('/api/fixtures'), fetch('/api/results'), fetch(selectedTournId ? `/api/round-locks?tournament_id=${selectedTournId}` : '/api/round-locks')])
      .then(rs => Promise.all(rs.map(r => r.json())))
      .then(([fxData, resData, locksData]) => {
        const byRound: FixtureMap = {}
        ;(fxData.data ?? []).forEach((f: Fixture) => {
          if (!byRound[f.round]) byRound[f.round] = []
          byRound[f.round]!.push(f)
        })
        setFixtures(byRound)
        const rm: ResultMap = {}
        ;(resData.data ?? []).forEach((r: any) => {
          if (r.home_score != null) rm[r.id] = { home: r.home_score, away: r.away_score, pen_winner: r.pen_winner ?? null }
        })
        setResults(rm)
        setLocks(locksData.data ?? {})
      })
      .finally(() => setLoading(false))
  }, [isAdmin, selectedTournId])

  // Load tournament details
  useEffect(() => {
    if (!selectedTournId) return
    fetch('/api/tournaments').then(r => r.json()).then(d => {
      const t = (d.data ?? []).find((t: any) => t.id === selectedTournId)
      if (t) setTournamentData(t)
    })
  }, [selectedTournId])

  // ── Results handlers ──────────────────────────────────────
  const handleSave = useCallback(async (fixtureId: number, home: number, away: number, penWinner?: string | null) => {
    const res = await fetch('/api/results', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fixture_id: fixtureId, home, away, pen_winner: penWinner ?? null }),
    })
    const { predictions_scored, error } = await res.json()
    if (!res.ok || error) { toast.error(error ?? 'Failed to save'); return }
    setResults(prev => ({ ...prev, [fixtureId]: { home, away, pen_winner: penWinner ?? null } }))
    toast.success(`✓ Saved · ${predictions_scored ?? 0} predictions scored`)
  }, [])

  const handleClear = useCallback(async (fixtureId: number) => {
    const res = await fetch(`/api/results?fixture_id=${fixtureId}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to clear'); return }
    setResults(prev => { const n = { ...prev }; delete n[fixtureId]; return n })
    toast.success('Result cleared')
  }, [])

  const handleClearAll = async () => {
    if (!confirm('Clear ALL results? This resets all points.')) return
    const res = await fetch('/api/results', { method: 'DELETE' })
    if (res.ok) { setResults({}); toast.success('All results cleared') }
  }

  // ── Lock handlers ──────────────────────────────────────────
  const handleToggleLock = async (round: string, open: boolean) => {
    const res = await fetch('/api/round-locks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournament_id: selectedTournId, round, is_open: open }),
    })
    if (res.ok) {
      setLocks(prev => ({ ...prev, [round]: open }))
      toast.success(`${ROUND_LABELS[round] ?? round} ${open ? 'opened' : 'closed'} for predictions`)
    } else {
      toast.error('Failed to update lock')
    }
  }

  // ── Access handler ─────────────────────────────────────────
  const handleGrantAccess = async () => {
    if (!adminEmail.trim()) return
    setGrantingAccess(true)
    const res = await fetch('/api/admin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail.trim() }),
    })
    const { success, error } = await res.json()
    setGrantingAccess(false)
    if (success) { toast.success(`Admin access granted to ${adminEmail}`); setAdminEmail('') }
    else toast.error(error ?? 'Failed to grant access')
  }

  // ── Leaderboard refresh ─────────────────────────────────────
  const handleRefreshLeaderboard = async () => {
    const res = await fetch('/api/leaderboard/refresh', { method: 'POST' }).catch(() => null)
    if (res?.ok) toast.success('Leaderboard refreshed')
    else toast('Leaderboard auto-refreshes after each result save', { icon: 'ℹ️' })
  }

  // ── Retroactive predictions toggle ───────────────────────────
  const [togglingRetroactive, setTogglingRetroactive] = useState(false)
  const handleToggleRetroactive = async () => {
    if (!tournamentData) return
    const next = !tournamentData.allow_retroactive_predictions
    setTogglingRetroactive(true)
    const res = await fetch('/api/tournaments', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tournamentData.id, allow_retroactive_predictions: next }),
    })
    setTogglingRetroactive(false)
    if (res.ok) {
      setTournamentData((prev: any) => ({ ...prev, allow_retroactive_predictions: next }))
      toast.success(next ? '🧪 Practice Mode enabled' : 'Practice Mode disabled')
    } else {
      toast.error('Failed to update setting')
    }
  }

  // ── Computed ───────────────────────────────────────────────
  const allFixtures = useMemo(() => Object.values(fixtures).flat(), [fixtures])
  const totalEntered = Object.keys(results).length
  const totalFixtures = allFixtures.length

  const roundProgress = useMemo(() =>
    ALL_ROUNDS.map(r => ({
      id: r,
      label: ROUND_LABELS[r] ?? r,
      total:   (fixtures[r] ?? []).length,
      entered: (fixtures[r] ?? []).filter(f => results[f.id]).length,
      isOpen:  locks[r] ?? false,
    })),
  [fixtures, results, locks])

  const visibleFixtures = useMemo(() => {
    let fs = fixtures[activeRound] ?? []
    if (activeRound === 'gs' && activeGroup !== 'all') fs = fs.filter(f => f.group === activeGroup)
    if (search) {
      const q = search.toLowerCase()
      fs = fs.filter(f => f.home.toLowerCase().includes(q) || f.away.toLowerCase().includes(q) || f.venue.toLowerCase().includes(q))
    }
    return fs
  }, [fixtures, activeRound, activeGroup, search])

  const fixturesByGroup = useMemo(() => {
    if (activeRound !== 'gs') return null
    const map: Record<string, Fixture[]> = {}
    visibleFixtures.forEach(f => { if (!map[f.group!]) map[f.group!] = []; map[f.group!].push(f) })
    return map
  }, [activeRound, visibleFixtures])

  const sc = (scoringConfig ?? getDefaultScoringConfig()).rounds[activeRound]

  if (isAdmin === null) return <div className="flex justify-center py-24"><Spinner className="w-8 h-8" /></div>

  if (!isAdmin) return (
    <div className="max-w-3xl mx-auto px-4 py-24 text-center">
      <p className="text-4xl mb-4">🔒</p>
      <h1 className="text-lg font-semibold text-gray-800 mb-2">Access Denied</h1>
      <p className="text-sm text-gray-500">You don&apos;t have tournament admin access.</p>
    </div>
  )

  if (loading) return <div className="flex justify-center py-24"><Spinner className="w-8 h-8" /></div>

  // ── Tab nav ────────────────────────────────────────────────
  const TABS: { id: AdminTab; label: string; icon: string }[] = [
    { id: 'results',    label: 'Results',    icon: '⚽' },
    { id: 'locks',      label: 'Round Locks', icon: '🔒' },
    { id: 'scoring',    label: 'Scoring',    icon: '📊' },
    { id: 'tournament', label: 'Tournament', icon: '🏆' },
    { id: 'access',     label: 'Access',     icon: '👤' },
    { id: 'demo',       label: 'Demo',       icon: '🤖' },
  ]

  return (
    <div className="max-w-4xl mx-auto px-4 py-4">

      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gray-900 flex items-center justify-center">
            <span className="text-white text-sm">⚙️</span>
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900 tracking-tight">Tournament Admin</h1>
            <p className="text-[11px] text-gray-400">
              {tournamentData?.name ?? 'Loading…'} · {totalEntered}/{totalFixtures} results entered
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-lg">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-medium text-emerald-700">Live scoring</span>
          </div>
        </div>
      </div>

      {/* ── Progress bar ─────────────────────────────────── */}
      <div className="mb-4 bg-white border border-gray-200 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-600">Tournament progress</span>
          <span className="text-xs text-gray-400">{totalEntered} / {totalFixtures} results</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5 mb-3">
          <div
            className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
            style={{ width: totalFixtures ? `${(totalEntered / totalFixtures) * 100}%` : '0%' }}
          />
        </div>
        <div className={`grid gap-1`} style={{ gridTemplateColumns: `repeat(${ALL_ROUNDS.length}, minmax(0, 1fr))` }}>
          {roundProgress.map(r => (
            <div key={r.id} className="text-center">
              <div className={clsx(
                'text-[10px] font-semibold mb-0.5 truncate',
                r.entered === r.total && r.total > 0 ? 'text-emerald-600' : 'text-gray-500'
              )}>
                {r.id.toUpperCase().slice(0,3)}
              </div>
              <div className="text-[10px] text-gray-400">{r.entered}/{r.total}</div>
              <div className={clsx(
                'mt-0.5 h-1 rounded-full',
                r.total === 0 ? 'bg-gray-100' :
                r.entered === r.total ? 'bg-emerald-400' :
                r.entered > 0 ? 'bg-amber-300' : 'bg-gray-200'
              )} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Tab bar ───────────────────────────────────────── */}
      <div className="flex gap-0 bg-gray-100 p-1 rounded-xl mb-4">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={clsx(
              'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all',
              activeTab === t.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}>
            <span className="text-sm">{t.icon}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════ */}
      {/* TAB: RESULTS                                        */}
      {/* ════════════════════════════════════════════════════ */}
      {activeTab === 'results' && (
        <div>
          {/* Round selector */}
          <div className="flex gap-1 flex-wrap mb-3">
            {ALL_ROUNDS.map(r => {
              const prog = roundProgress.find(x => x.id === r)!
              return (
                <button key={r} onClick={() => { setActiveRound(r); setActiveGroup('all'); setSearch('') }}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all',
                    activeRound === r
                      ? 'bg-gray-900 border-gray-900 text-white'
                      : prog.entered === prog.total && prog.total > 0
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white'
                  )}>
                  {ROUND_LABELS[r] ?? r}
                  {prog.total > 0 && (
                    <span className={clsx(
                      'text-[10px] px-1.5 py-0.5 rounded-full font-bold',
                      activeRound === r ? 'bg-white/20 text-white' :
                      prog.entered === prog.total ? 'bg-emerald-200 text-emerald-800' : 'bg-gray-100 text-gray-600'
                    )}>
                      {prog.entered}/{prog.total}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Round info bar */}
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-700">{sc?.round_name ?? ROUND_LABELS[activeRound]}</span>
              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[11px] font-medium">✓ {sc?.result_pts ?? '?'}pts</span>
              {(sc?.exact_bonus ?? 0) > 0 && <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-[11px] font-medium">★ +{sc?.exact_bonus} exact</span>}
              {(sc?.pen_bonus ?? 0) > 0 && <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-[11px] font-medium">🥅 +{sc?.pen_bonus} pens</span>}
              {(sc?.fav_team_2x) && <span className="px-2 py-0.5 bg-orange-50 text-orange-700 rounded-full text-[11px] font-medium">⭐ 2× fav</span>}
            </div>
            <button onClick={handleClearAll} className="text-[11px] text-red-400 hover:text-red-600 font-medium transition-colors">
              Clear all ↗
            </button>
          </div>

          {/* Group filter */}
          {activeRound === 'gs' && (
            <div className="flex gap-1 flex-wrap mb-3">
              {['all','A','B','C','D','E','F','G','H','I','J','K','L'].map(g => (
                <button key={g} onClick={() => setActiveGroup(g)}
                  className={clsx(
                    'px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors',
                    activeGroup === g
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  )}>
                  {g === 'all' ? 'All groups' : `Grp ${g}`}
                </button>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="relative mb-3">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input type="text" placeholder="Search team or venue…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
            />
          </div>

          {/* Fixture list */}
          {visibleFixtures.length === 0 ? (
            <EmptyState title="No fixtures" description={search ? 'Try a different search.' : 'None for this round.'} />
          ) : fixturesByGroup ? (
            Object.entries(fixturesByGroup).sort(([a],[b]) => a.localeCompare(b)).map(([grp, gFs]) => (
              <div key={grp} className="mb-3">
                <div className="flex items-center gap-2 mb-1.5 px-1">
                  <div className="w-5 h-5 rounded-full bg-gray-900 text-white text-[10px] font-bold flex items-center justify-center">{grp}</div>
                  <span className="text-xs font-semibold text-gray-700">Group {grp}</span>
                  <span className="text-[11px] text-gray-400">{gFs.filter(f => results[f.id]).length}/{gFs.length}</span>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                  {gFs.map(f => <AdminResultRow key={f.id} fixture={f} result={results[f.id]} knockoutRounds={KNOCKOUT_ROUNDS} onSave={handleSave} onClear={handleClear} />)}
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              {visibleFixtures.map(f => <AdminResultRow key={f.id} fixture={f} result={results[f.id]} knockoutRounds={KNOCKOUT_ROUNDS} onSave={handleSave} onClear={handleClear} />)}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════ */}
      {/* TAB: ROUND LOCKS                                    */}
      {/* ════════════════════════════════════════════════════ */}
      {activeTab === 'locks' && (
        <div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-start gap-2">
            <span className="text-lg flex-shrink-0">⚠️</span>
            <div>
              <p className="text-xs font-semibold text-amber-800">Round locks control when predictions are allowed</p>
              <p className="text-xs text-amber-700 mt-0.5">Open a round to allow users to submit predictions. Close it to lock them out. Individual matches auto-lock 5 minutes before kickoff regardless of round state.</p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            {ALL_ROUNDS.map((r, i) => {
              const prog   = roundProgress.find(x => x.id === r)!
              const isOpen = locks[r] ?? false
              return (
                <div key={r} className={clsx(
                  'flex items-center gap-4 px-4 py-4 border-b border-gray-100 last:border-0',
                  isOpen ? 'bg-emerald-50/40' : ''
                )}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800">{ROUND_LABELS[r] ?? r}</span>
                      <span className={clsx(
                        'text-[10px] font-bold px-2 py-0.5 rounded-full',
                        isOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                      )}>
                        {isOpen ? '🟢 OPEN' : '🔴 LOCKED'}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {prog.entered}/{prog.total} results entered
                      {prog.entered === prog.total && prog.total > 0 && ' · ✓ Complete'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleToggleLock(r, !isOpen)}
                      className={clsx(
                        'px-4 py-1.5 rounded-lg text-xs font-semibold transition-all border',
                        isOpen
                          ? 'bg-white border-red-200 text-red-600 hover:bg-red-50'
                          : 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700'
                      )}>
                      {isOpen ? '🔒 Lock round' : '🔓 Open round'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Open/close all */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => ALL_ROUNDS.forEach(r => handleToggleLock(r, true))}
              className="flex-1 py-2 border border-emerald-300 text-emerald-700 text-xs font-semibold rounded-xl hover:bg-emerald-50 transition-colors">
              🔓 Open all rounds
            </button>
            <button
              onClick={() => ALL_ROUNDS.forEach(r => handleToggleLock(r, false))}
              className="flex-1 py-2 border border-red-200 text-red-600 text-xs font-semibold rounded-xl hover:bg-red-50 transition-colors">
              🔒 Lock all rounds
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════ */}
      {/* TAB: SCORING                                        */}
      {/* ════════════════════════════════════════════════════ */}
      {activeTab === 'scoring' && (
        <div>
          <p className="text-xs text-gray-500 mb-3">Scoring rules loaded from the <code className="bg-gray-100 px-1 rounded">tournament_rounds</code> table. Update via Supabase dashboard or the API.</p>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="grid grid-cols-[1.5fr_80px_80px_80px_80px_80px] px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-500 uppercase tracking-wide">
              <span>Round</span>
              <span className="text-center">Mode</span>
              <span className="text-center">Result</span>
              <span className="text-center">Exact +</span>
              <span className="text-center">Pen +</span>
              <span className="text-center">Fav 2×</span>
            </div>
            {ALL_ROUNDS.map(r => {
              const cfg = (scoringConfig ?? getDefaultScoringConfig()).rounds[r]
              return (
                <div key={r} className="grid grid-cols-[1.5fr_80px_80px_80px_80px_80px] px-4 py-3 border-b border-gray-100 last:border-0 items-center">
                  <span className="text-sm font-medium text-gray-800">{ROUND_LABELS[r]}</span>
                  <div className="text-center">
                    <span className={clsx(
                      'text-[11px] font-semibold px-2 py-0.5 rounded-full',
                      cfg?.predict_mode === 'score' ? 'bg-purple-100 text-purple-700' : 'bg-blue-50 text-blue-600'
                    )}>
                      {cfg?.predict_mode === 'score' ? 'Score' : '1/X/2'}
                    </span>
                  </div>
                  <div className="text-center text-sm font-bold text-gray-800">{cfg?.result_pts ?? '—'}</div>
                  <div className="text-center text-sm font-bold text-purple-600">{(cfg?.exact_bonus ?? 0) > 0 ? `+${cfg.exact_bonus}` : '—'}</div>
                  <div className="text-center text-sm font-bold text-amber-600">{(cfg?.pen_bonus ?? 0) > 0 ? `+${cfg.pen_bonus}` : '—'}</div>
                  <div className="text-center text-sm">{cfg?.fav_team_2x ? '✓' : '—'}</div>
                </div>
              )
            })}
          </div>

          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
            <p className="text-xs text-blue-700 font-medium mb-1">To update scoring rules:</p>
            <p className="text-xs text-blue-600">Run a SQL update on the <code className="bg-blue-100 px-1 rounded">tournament_rounds</code> table in Supabase, then re-enter any affected results to recalculate points.</p>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════ */}
      {/* TAB: TOURNAMENT                                     */}
      {/* ════════════════════════════════════════════════════ */}
      {activeTab === 'tournament' && (
        <div className="space-y-3">
          {/* Tournament info */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Tournament Details</h3>
            {tournamentData ? (
              <div className="space-y-2">
                {[
                  { label: 'Name',        value: tournamentData.name },
                  { label: 'Status',      value: tournamentData.status },
                  { label: 'Active',      value: tournamentData.is_active ? '✓ Yes' : '✗ No' },
                  { label: 'Start date',  value: tournamentData.start_date ?? '—' },
                  { label: 'Final date',  value: tournamentData.final_date ?? '—' },
                  { label: 'Total teams', value: tournamentData.total_teams ?? '—' },
                  { label: 'Matches',     value: tournamentData.total_matches ?? '—' },
                  { label: 'Kickoff venue', value: tournamentData.kickoff_venue ?? '—' },
                  { label: 'Final venue', value: tournamentData.final_venue ?? '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-xs text-gray-500 font-medium">{label}</span>
                    <span className="text-xs text-gray-800 font-semibold">{String(value)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex justify-center py-4"><Spinner className="w-5 h-5" /></div>
            )}
          </div>

          {/* Stats */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Result Progress</h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-emerald-50 rounded-xl p-3">
                <p className="text-2xl font-bold text-emerald-600">{totalEntered}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">Results entered</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-3">
                <p className="text-2xl font-bold text-amber-600">{totalFixtures - totalEntered}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">Remaining</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-2xl font-bold text-gray-700">{totalFixtures}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">Total matches</p>
              </div>
            </div>
          </div>

          {/* Danger zone */}
          <div className="bg-white border border-red-100 rounded-xl p-4 shadow-sm">
            <h3 className="text-xs font-bold text-red-500 uppercase tracking-wide mb-3">⚠️ Danger Zone</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl">
                <div>
                  <p className="text-xs font-semibold text-gray-800">🧪 Practice Mode</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Lets tipsters predict any match — including those with results. Use for testing and onboarding.</p>
                </div>
                <button
                  onClick={handleToggleRetroactive}
                  disabled={togglingRetroactive || !tournamentData}
                  className={clsx(
                    'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50',
                    tournamentData?.allow_retroactive_predictions ? 'bg-blue-500' : 'bg-gray-200'
                  )}
                >
                  <span className={clsx(
                    'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200',
                    tournamentData?.allow_retroactive_predictions ? 'translate-x-5' : 'translate-x-0'
                  )} />
                </button>
              </div>
              <div className="flex items-center justify-between p-3 bg-red-50 rounded-xl">
                <div>
                  <p className="text-xs font-semibold text-gray-800">Clear all results</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Resets all points on the leaderboard</p>
                </div>
                <button onClick={handleClearAll}
                  className="px-3 py-1.5 border border-red-200 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-100 transition-colors">
                  Clear all
                </button>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div>
                  <p className="text-xs font-semibold text-gray-800">Refresh leaderboard</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Manually trigger a leaderboard recalculation</p>
                </div>
                <button onClick={handleRefreshLeaderboard}
                  className="px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-100 transition-colors">
                  Refresh
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════ */}
      {/* TAB: ACCESS                                         */}
      {/* ════════════════════════════════════════════════════ */}
      {activeTab === 'demo' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900 mb-1">Pre-Tournament Demo Mode</h2>
            <p className="text-xs text-gray-500 mb-4">
              Group Stage fixtures are pre-seeded with AI-generated results via the <code className="bg-gray-100 px-1 rounded">058_demo_seed.sql</code> migration.
              Tipsters can predict at the <a href="/demo" target="_blank" className="text-blue-600 underline">/demo page</a> — results are revealed after each prediction.
              The scoreboard is public and requires no login to view.
            </p>
            <div className="flex gap-3 items-center flex-wrap">
              <a href="/demo" target="_blank"
                className="px-5 py-2.5 bg-gray-900 hover:bg-gray-700 text-white text-sm font-bold rounded-xl transition-colors">
                View /demo page ↗
              </a>
            </div>
            <div className="mt-5 pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-700 mb-2">How it works</p>
              <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
                <li>Run migration 058_demo_seed.sql in Supabase to seed fixtures and AI results</li>
                <li>Tipsters visit /demo and pick H/D/A for each Group Stage match</li>
                <li>Result is revealed immediately after they predict</li>
                <li>Scoreboard updates live — anyone can view without logging in</li>
                <li>When the real tournament starts, /demo stays up as a separate record</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'access' && (
        <div className="space-y-3">
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Grant Admin Access</h3>
            <p className="text-xs text-gray-500 mb-3">The user must have already registered before you can grant them admin access.</p>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="user@example.com"
                value={adminEmail}
                onChange={e => setAdminEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleGrantAccess()}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              <button onClick={handleGrantAccess} disabled={grantingAccess || !adminEmail.trim()}
                className="px-4 py-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-2">
                {grantingAccess && <Spinner className="w-3 h-3 text-white" />}
                Grant access
              </button>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-blue-800 mb-1">Admin privileges include:</p>
            <ul className="text-xs text-blue-700 space-y-1">
              <li>• Enter and clear match results</li>
              <li>• Open and close rounds for predictions</li>
              <li>• View this admin panel</li>
              <li>• Grant admin access to other users</li>
            </ul>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Your session</h3>
            <p className="text-xs text-gray-600">Signed in as <span className="font-semibold text-gray-800">{session?.user.email}</span></p>
          </div>
        </div>
      )}
    </div>
  )
}
