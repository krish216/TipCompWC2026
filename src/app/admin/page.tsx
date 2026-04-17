'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { RoundTabs } from '@/components/game/RoundTabs'
import { Spinner, StatCard, EmptyState, Card } from '@/components/ui'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { getDefaultScoringConfig, type RoundId, type Fixture, type MatchScore } from '@/types'
import toast from 'react-hot-toast'

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
type ResultMap  = Record<number, MatchScore>

// ── AdminResultRow ────────────────────────────────────────────────────────────
function AdminResultRow({
  fixture,
  result,
  onSave,
  onClear,
}: {
  fixture: Fixture
  result?: MatchScore
  onSave: (id: number, home: number, away: number) => Promise<void>
  onClear: (id: number) => Promise<void>
}) {
  const homeRef = useRef<HTMLInputElement>(null)
  const awayRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    const h = parseInt(homeRef.current?.value ?? '', 10)
    const a = parseInt(awayRef.current?.value ?? '', 10)
    if (isNaN(h) || isNaN(a) || h < 0 || a < 0) {
      toast.error('Enter valid scores (0 or higher) for both teams')
      return
    }
    setSaving(true)
    await onSave(fixture.id, h, a)
    setSaving(false)
  }

  const handleClear = async () => {
    if (!confirm(`Clear result for ${fixture.home} vs ${fixture.away}?`)) return
    setSaving(true)
    await onClear(fixture.id)
    if (homeRef.current) homeRef.current.value = ''
    if (awayRef.current) awayRef.current.value = ''
    setSaving(false)
  }

  return (
    <div className={clsx(
      'flex items-center gap-3 px-3 py-3 border-b border-gray-100 last:border-0 flex-wrap',
      result ? 'bg-green-50/40' : 'hover:bg-gray-50',
      'transition-colors'
    )}>
      {/* Teams + meta */}
      <div className="flex-1 min-w-[160px]">
        <p className="text-sm font-medium text-gray-800">
          {flag(fixture.home)} {fixture.home} <span className="text-gray-400 text-xs mx-1">vs</span> {flag(fixture.away)} {fixture.away}
        </p>
        <p className="text-[11px] text-gray-400 mt-0.5">{fixture.date} · {fixture.venue}</p>
      </div>

      {/* Result badge */}
      {result && (
        <span className="px-2.5 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-md whitespace-nowrap">
          {result.home} – {result.away}
        </span>
      )}

      {/* Score inputs */}
      <div className="flex items-center gap-1.5">
        <input
          ref={homeRef}
          type="number"
          min={0}
          max={30}
          placeholder="H"
          defaultValue={result?.home ?? ''}
          className="w-10 h-8 text-center text-sm font-medium border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
        />
        <span className="text-gray-300 text-xs">–</span>
        <input
          ref={awayRef}
          type="number"
          min={0}
          max={30}
          placeholder="A"
          defaultValue={result?.away ?? ''}
          className="w-10 h-8 text-center text-sm font-medium border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium rounded-md transition-colors"
        >
          {saving ? '…' : 'Save'}
        </button>
        {result && (
          <button
            onClick={handleClear}
            disabled={saving}
            className="px-3 py-1.5 border border-gray-300 hover:bg-gray-100 disabled:opacity-50 text-gray-600 text-xs font-medium rounded-md transition-colors"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

// ── Admin Page ────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { session } = useSupabase()

  const [fixtures,    setFixtures]    = useState<FixtureMap>({})
  const [results,     setResults]     = useState<ResultMap>({})
  const [activeRound, setActiveRound] = useState<RoundId>('gs')
  const [activeGroup, setActiveGroup] = useState<string>('all')
  const [loading,     setLoading]     = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // ── Load fixtures + existing results ─────────────────────
  useEffect(() => {
    if (!session) return
    const load = async () => {
      setLoading(true)
      const [fxRes, resRes] = await Promise.all([
        fetch('/api/fixtures'),
        fetch('/api/results'),
      ])
      const [fxData, resData] = await Promise.all([fxRes.json(), resRes.json()])

      const byRound: FixtureMap = {}
      ;(fxData.data ?? []).forEach((f: Fixture) => {
        if (!byRound[f.round]) byRound[f.round] = []
        byRound[f.round]!.push(f)
      })
      setFixtures(byRound)

      const rm: ResultMap = {}
      ;(resData.data ?? []).forEach((r: any) => {
        if (r.home_score != null) rm[r.id] = { home: r.home_score, away: r.away_score }
      })
      setResults(rm)
      setLoading(false)
    }
    load()
  }, [session])

  // ── Save result ──────────────────────────────────────────
  const handleSave = useCallback(async (fixtureId: number, home: number, away: number) => {
    const res = await fetch('/api/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fixture_id: fixtureId, home, away }),
    })
    const { data, predictions_scored, error } = await res.json()
    if (!res.ok || error) {
      toast.error(error ?? 'Failed to save result')
      return
    }
    setResults(prev => ({ ...prev, [fixtureId]: { home, away } }))
    toast.success(`Result saved · ${predictions_scored} prediction${predictions_scored !== 1 ? 's' : ''} scored`)
  }, [])

  // ── Clear result ─────────────────────────────────────────
  const handleClear = useCallback(async (fixtureId: number) => {
    const res = await fetch(`/api/results?fixture_id=${fixtureId}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to clear result'); return }
    setResults(prev => { const n = { ...prev }; delete n[fixtureId]; return n })
    toast.success('Result cleared')
  }, [])

  // ── Clear all results ────────────────────────────────────
  const handleClearAll = async () => {
    if (!confirm('Clear ALL results? This will reset all points.')) return
    const res = await fetch('/api/results', { method: 'DELETE' })
    if (res.ok) {
      setResults({})
      toast.success('All results cleared')
    }
  }

  // ── Computed stats ───────────────────────────────────────
  const allFixtures = useMemo(() => Object.values(fixtures).flat(), [fixtures])

  const stats = useMemo(() => {
    const total   = allFixtures.length
    const entered = Object.keys(results).length
    return { total, entered, remaining: total - entered }
  }, [allFixtures, results])

  const roundPoints: Partial<Record<RoundId, number>> = {}  // not used in admin but required by RoundTabs

  // ── Visible fixtures ─────────────────────────────────────
  const visibleFixtures = useMemo(() => {
    let fs = fixtures[activeRound] ?? []
    if (activeRound === 'gs' && activeGroup !== 'all') {
      fs = fs.filter(f => f.group === activeGroup)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      fs = fs.filter(f =>
        f.home.toLowerCase().includes(q) ||
        f.away.toLowerCase().includes(q) ||
        f.venue.toLowerCase().includes(q)
      )
    }
    return fs
  }, [fixtures, activeRound, activeGroup, searchQuery])

  const fixturesByGroup = useMemo(() => {
    if (activeRound !== 'gs') return null
    const map: Record<string, Fixture[]> = {}
    visibleFixtures.forEach(f => {
      if (!map[f.group!]) map[f.group!] = []
      map[f.group!].push(f)
    })
    return map
  }, [activeRound, visibleFixtures])

  const sc = getDefaultScoringConfig().rounds[activeRound as RoundId]
  const roundResultCount = useMemo(() => {
    const fs = fixtures[activeRound] ?? []
    return fs.filter(f => results[f.id]).length
  }, [fixtures, activeRound, results])

  if (loading) {
    return <div className="flex justify-center py-24"><Spinner className="w-8 h-8" /></div>
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <h1 className="text-lg font-semibold text-gray-900">Admin panel</h1>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Enter match results — leaderboard updates instantly</p>
        </div>
        <button onClick={handleClearAll} className="btn-danger btn-sm">
          Clear all results
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <StatCard label="Entered"   value={stats.entered}   accent="green" />
        <StatCard label="Remaining" value={stats.remaining} accent={stats.remaining > 0 ? 'amber' : undefined} />
        <StatCard label="Total"     value={stats.total} />
      </div>

      {/* Round tabs */}
      <RoundTabs active={activeRound} roundPoints={roundPoints} onChange={r => { setActiveRound(r); setActiveGroup('all'); setSearchQuery('') }} />

      {/* Round scoring reminder */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="font-medium text-gray-700">{sc?.round_name}</span>
          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-[11px] font-medium">★ {sc?.exact_bonus} exact</span>
          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[11px] font-medium">✓ {sc?.result_pts} result</span>
        </div>
        <span className="text-xs text-gray-400">{roundResultCount} of {fixtures[activeRound]?.length ?? 0} entered</span>
      </div>

      {/* Group filter + search */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {activeRound === 'gs' && (
          <div className="flex gap-1 flex-wrap">
            {['all','A','B','C','D','E','F','G','H','I','J','K','L'].map(g => (
              <button
                key={g}
                onClick={() => setActiveGroup(g)}
                className={clsx(
                  'px-2.5 py-1 text-xs rounded-full border transition-colors',
                  activeGroup === g
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'border-gray-300 text-gray-500 hover:bg-gray-50'
                )}
              >
                {g === 'all' ? 'All' : `Grp ${g}`}
              </button>
            ))}
          </div>
        )}
        <input
          type="text"
          placeholder="Search team or venue…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="flex-1 min-w-[180px] px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
        />
      </div>

      {/* Fixtures */}
      {visibleFixtures.length === 0 ? (
        <EmptyState title="No fixtures found" description={searchQuery ? 'Try a different search.' : 'No fixtures for this round.'} />
      ) : fixturesByGroup ? (
        Object.entries(fixturesByGroup).map(([grp, gFs]) => (
          <div key={grp} className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded-full bg-green-100 text-green-700 text-[10px] font-semibold flex items-center justify-center">{grp}</div>
              <span className="text-sm font-medium text-gray-700">Group {grp}</span>
              <span className="text-xs text-gray-400">
                {gFs.filter(f => results[f.id]).length}/{gFs.length} results
              </span>
            </div>
            <Card className="p-0 overflow-hidden">
              {gFs.map(f => (
                <AdminResultRow
                  key={f.id}
                  fixture={f}
                  result={results[f.id]}
                  onSave={handleSave}
                  onClear={handleClear}
                />
              ))}
            </Card>
          </div>
        ))
      ) : (
        <Card className="p-0 overflow-hidden">
          {visibleFixtures.map(f => (
            <AdminResultRow
              key={f.id}
              fixture={f}
              result={results[f.id]}
              onSave={handleSave}
              onClear={handleClear}
            />
          ))}
        </Card>
      )}

      {/* Keyboard shortcut hint */}
      <p className="text-center text-[11px] text-gray-400 mt-4">
        Tab between fields · Enter to save
      </p>
    </div>
  )
}
