'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { RoundTabs } from '@/components/game/RoundTabs'
import { Spinner, StatCard, EmptyState, Card } from '@/components/ui'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { SCORING, type RoundId, type Fixture, type MatchScore } from '@/types'
import toast from 'react-hot-toast'

const FLAGS: Record<string, string> = {
  Algeria:'🇩🇿', Argentina:'🇦🇷', Australia:'🇦🇺', Austria:'🇦🇹',
  Belgium:'🇧🇪', 'Bosnia and Herzegovina':'🇧🇦', Brazil:'🇧🇷',
  Canada:'🇨🇦', 'Cape Verde':'🇨🇻', Colombia:'🇨🇴', Croatia:'🇭🇷',
  Curacao:'🏝️', Czechia:'🇨🇿', 'DR Congo':'🇨🇩',
  Ecuador:'🇪🇨', Egypt:'🇪🇬', England:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', France:'🇫🇷',
  Germany:'🇩🇪', Ghana:'🇬🇭', Haiti:'🇭🇹', Iran:'🇮🇷',
  Iraq:'🇮🇶', 'Ivory Coast':'🇨🇮', Japan:'🇯🇵', Jordan:'🇯🇴',
  Mexico:'🇲🇽', Morocco:'🇲🇦', Netherlands:'🇳🇱', 'New Zealand':'🇳🇿',
  Norway:'🇳🇴', Panama:'🇵🇦', Paraguay:'🇵🇾', Portugal:'🇵🇹',
  Qatar:'🇶🇦', 'Saudi Arabia':'🇸🇦', Scotland:'🏴󠁧󠁢󠁳󠁣󠁴󠁿', Senegal:'🇸🇳',
  'South Africa':'🇿🇦', 'South Korea':'🇰🇷', Spain:'🇪🇸', Sweden:'🇸🇪',
  Switzerland:'🇨🇭', Tunisia:'🇹🇳', Turkey:'🇹🇷', Uruguay:'🇺🇾',
  USA:'🇺🇸', Uzbekistan:'🇺🇿',
}
const flag = (t: string) => FLAGS[t] ?? '🏳️'

type FixtureMap = Partial<Record<RoundId, Fixture[]>>
type ResultMap  = Record<number, MatchScore>

// ── Admin result row ──────────────────────────────────────────────────────────
function AdminResultRow({ fixture, result, onSave, onClear }: {
  fixture: Fixture; result?: MatchScore
  onSave: (id: number, h: number, a: number) => Promise<void>
  onClear: (id: number) => Promise<void>
}) {
  const homeRef = useRef<HTMLInputElement>(null)
  const awayRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    const h = parseInt(homeRef.current?.value ?? '', 10)
    const a = parseInt(awayRef.current?.value ?? '', 10)
    if (isNaN(h)||isNaN(a)||h<0||a<0) { toast.error('Enter valid scores'); return }
    setSaving(true); await onSave(fixture.id, h, a); setSaving(false)
  }
  const handleClear = async () => {
    if (!confirm(`Clear ${fixture.home} vs ${fixture.away}?`)) return
    setSaving(true); await onClear(fixture.id)
    if (homeRef.current) homeRef.current.value = ''
    if (awayRef.current) awayRef.current.value = ''
    setSaving(false)
  }

  return (
    <div className={clsx('flex items-center gap-3 px-3 py-3 border-b border-gray-100 last:border-0 flex-wrap transition-colors', result ? 'bg-green-50/40' : 'hover:bg-gray-50')}>
      <div className="flex-1 min-w-[160px]">
        <p className="text-sm font-medium text-gray-800">{flag(fixture.home)} {fixture.home} <span className="text-gray-400 text-xs mx-1">vs</span> {flag(fixture.away)} {fixture.away}</p>
        <p className="text-[11px] text-gray-400 mt-0.5">{fixture.date} · {fixture.venue}</p>
      </div>
      {result && <span className="px-2.5 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-md">{result.home} – {result.away}</span>}
      <div className="flex items-center gap-1.5">
        <input ref={homeRef} type="number" min={0} max={30} placeholder="H" defaultValue={result?.home ?? ''} className="w-10 h-8 text-center text-sm font-medium border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-green-400" />
        <span className="text-gray-300 text-xs">–</span>
        <input ref={awayRef} type="number" min={0} max={30} placeholder="A" defaultValue={result?.away ?? ''} className="w-10 h-8 text-center text-sm font-medium border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-green-400" />
        <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium rounded-md">{saving ? '…' : 'Save'}</button>
        {result && <button onClick={handleClear} disabled={saving} className="px-3 py-1.5 border border-gray-300 hover:bg-gray-100 text-gray-600 text-xs font-medium rounded-md">Clear</button>}
      </div>
    </div>
  )
}

// ── Grant tournament admin panel ──────────────────────────────────────────────
function GrantAdminPanel() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  const grant = async () => {
    if (!email.trim()) return
    setLoading(true)
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    })
    const { success, error } = await res.json()
    setLoading(false)
    if (success) { toast.success(`Tournament admin granted to ${email}`); setEmail('') }
    else toast.error(error ?? 'Failed to grant admin')
  }

  return (
    <Card className="mb-4">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Grant tournament admin</p>
      <div className="flex gap-2">
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="user@example.com"
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
        <button onClick={grant} disabled={loading || !email.trim()}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
          {loading ? <Spinner className="w-4 h-4 text-white" /> : 'Grant'}
        </button>
      </div>
      <p className="text-[11px] text-gray-400 mt-2">Grants access to this admin panel — results, round locks, and org management.</p>
    </Card>
  )
}

// ── Organisations panel ────────────────────────────────────────────────────────
function OrganisationsPanel() {
  const [orgs,    setOrgs]    = useState<any[]>([])
  const [name,    setName]    = useState('')
  const [loading, setLoading] = useState(false)
  const [fetching,setFetching]= useState(true)
  const [copied,  setCopied]  = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/organisations')
      .then(r => r.json())
      .then(d => { setOrgs(d.data ?? []); setFetching(false) })
      .catch(() => setFetching(false))
  }, [])

  const create = async () => {
    if (!name.trim()) return
    setLoading(true)
    const res = await fetch('/api/organisations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    })
    const { data, error } = await res.json()
    setLoading(false)
    if (error) toast.error(error)
    else {
      toast.success(`Organisation "${data.name}" created`)
      setOrgs(prev => [...prev, data])
      setName('')
    }
  }

  const copyCode = async (code: string) => {
    await navigator.clipboard.writeText(code)
    setCopied(code); setTimeout(() => setCopied(null), 2000)
    toast.success('Code copied!')
  }

  return (
    <Card className="mb-4">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Organisations</p>
      <p className="text-[11px] text-gray-500 mb-3">
        Create an organisation and share its unique code with the org admin.
        They register using that code to gain org admin access.
      </p>

      {/* Create new org */}
      <div className="flex gap-2 mb-4">
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && create()}
          placeholder="Organisation name e.g. Acme Corp"
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
        <button onClick={create} disabled={loading || !name.trim()}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg flex items-center gap-1.5">
          {loading && <Spinner className="w-3 h-3 text-white" />}
          Create
        </button>
      </div>

      {/* Org list with codes */}
      {fetching ? <Spinner className="w-4 h-4" /> : orgs.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No organisations created yet</p>
      ) : (
        <div className="space-y-2">
          {orgs.map(o => (
            <div key={o.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-gray-900">{o.name}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">Share this code with the org admin</p>
              </div>
              <button
                onClick={() => copyCode(o.invite_code)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-colors',
                  copied === o.invite_code
                    ? 'bg-green-100 text-green-700 border-green-300'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                )}
              >
                {o.invite_code}
                <span className="text-gray-400">{copied === o.invite_code ? '✓' : '⎘'}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ── Main admin page ───────────────────────────────────────────────────────────
export default function AdminPage() {
  const { session, supabase } = useSupabase()
  const [isAdmin,     setIsAdmin]     = useState<boolean | null>(null)  // null = loading
  const [fixtures,    setFixtures]    = useState<FixtureMap>({})
  const [results,     setResults]     = useState<ResultMap>({})
  const [roundLocks,  setRoundLocks]  = useState<Record<string, boolean>>({})
  const [togglingRound, setTogglingRound] = useState<string | null>(null)
  const [activeRound, setActiveRound] = useState<RoundId>('gs')
  const [activeGroup, setActiveGroup] = useState('all')
  const [loading,     setLoading]     = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Check admin status via API (uses service role — reliable)
  useEffect(() => {
    if (!session) return
    fetch('/api/admin')
      .then(r => r.json())
      .then(d => setIsAdmin(d.is_admin === true))
      .catch(() => setIsAdmin(false))
  }, [session])

  useEffect(() => {
    if (!session) return
    const load = async () => {
      setLoading(true)
      const [fxRes, resRes, locksRes] = await Promise.all([
        fetch('/api/fixtures'),
        fetch('/api/results'),
        fetch('/api/round-locks'),
      ])
      const [fxData, resData, locksData] = await Promise.all([fxRes.json(), resRes.json(), locksRes.json()])
      setRoundLocks(locksData.data ?? {})
      const byRound: FixtureMap = {}
      ;(fxData.data ?? []).forEach((f: Fixture) => {
        if (!byRound[f.round]) byRound[f.round] = []
        byRound[f.round]!.push(f)
      })
      setFixtures(byRound)
      const rm: ResultMap = {}
      ;(resData.data ?? []).forEach((r: any) => { if (r.home_score != null) rm[r.id] = { home: r.home_score, away: r.away_score } })
      setResults(rm)
      setLoading(false)
    }
    load()
  }, [session])

  const handleSave = useCallback(async (fixtureId: number, home: number, away: number) => {
    const res = await fetch('/api/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fixture_id: fixtureId, home, away }),
    })
    const { predictions_scored, error } = await res.json()
    if (!res.ok || error) { toast.error(error ?? 'Failed'); return }
    setResults(prev => ({ ...prev, [fixtureId]: { home, away } }))
    toast.success(`Saved · ${predictions_scored ?? 0} prediction${predictions_scored !== 1 ? 's' : ''} scored`)
  }, [])

  const handleClear = useCallback(async (fixtureId: number) => {
    const res = await fetch(`/api/results?fixture_id=${fixtureId}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to clear'); return }
    setResults(prev => { const n = { ...prev }; delete n[fixtureId]; return n })
    toast.success('Result cleared')
  }, [])

  const allFixtures = useMemo(() => Object.values(fixtures).flat(), [fixtures])
  const stats = useMemo(() => ({ total: allFixtures.length, entered: Object.keys(results).length }), [allFixtures, results])
  const sc = SCORING[activeRound]
  const roundResultCount = useMemo(() => (fixtures[activeRound] ?? []).filter(f => results[f.id]).length, [fixtures, activeRound, results])

  const visibleFixtures = useMemo(() => {
    let fs = fixtures[activeRound] ?? []
    if (activeRound === 'gs' && activeGroup !== 'all') fs = fs.filter(f => f.group === activeGroup)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      fs = fs.filter(f => f.home.toLowerCase().includes(q) || f.away.toLowerCase().includes(q) || f.venue.toLowerCase().includes(q))
    }
    return fs
  }, [fixtures, activeRound, activeGroup, searchQuery])

  const fixturesByGroup = useMemo(() => {
    if (activeRound !== 'gs') return null
    const map: Record<string, Fixture[]> = {}
    visibleFixtures.forEach(f => { if (!map[f.group!]) map[f.group!] = []; map[f.group!].push(f) })
    return map
  }, [activeRound, visibleFixtures])

  // Show spinner while checking admin status
  if (isAdmin === null) return <div className="flex justify-center py-24"><Spinner className="w-8 h-8" /></div>

  // Not admin — show access denied
  if (!isAdmin) return (
    <div className="max-w-md mx-auto px-4 py-20 text-center">
      <div className="text-5xl mb-4">🔒</div>
      <h1 className="text-lg font-semibold text-gray-900 mb-2">Access denied</h1>
      <p className="text-sm text-gray-500 mb-6">
        You don't have admin access. If you should have access, ask an existing admin to grant it via the admin panel.
      </p>
      <a href="/predict" className="inline-block px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors">
        Back to predictions
      </a>
    </div>
  )

  const toggleRound = async (round: string) => {
    const newState = !roundLocks[round]
    setTogglingRound(round)
    const res = await fetch('/api/round-locks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ round, is_open: newState }),
    })
    const { success, error } = await res.json()
    setTogglingRound(null)
    if (success) {
      setRoundLocks(prev => ({ ...prev, [round]: newState }))
      const lbl = round === 'finals' ? 'Finals' : (SCORING as any)[round]?.label ?? round
      toast.success(newState ? `${lbl} unlocked for predictions` : `${lbl} locked`)
    } else {
      toast.error(error ?? 'Failed to update round lock')
    }
  }

  if (loading) return <div className="flex justify-center py-24"><Spinner className="w-8 h-8" /></div>

  return (
    <div className="max-w-3xl mx-auto px-4 py-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /><h1 className="text-lg font-semibold">Tournament Admin</h1></div>
          <p className="text-xs text-gray-500 mt-0.5">Enter results · lock/unlock rounds · leaderboard updates instantly</p>
        </div>
        <button onClick={async () => { if (!confirm('Clear ALL results?')) return; await fetch('/api/results', { method: 'DELETE' }); setResults({}); toast.success('All results cleared') }} className="px-3 py-1.5 border border-red-300 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium rounded-lg">Clear all results</button>
      </div>

      {/* ── Round unlock panel ── */}
      <Card className="mb-4">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Round predictions</p>
        <p className="text-[11px] text-gray-400 mb-3">Unlock a round to allow players to enter predictions. Lock it to stop new entries.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(['gs','r32','r16','qf','sf','finals'] as string[]).map(round => {
            const isOpen    = !!roundLocks[round]
            const toggling  = togglingRound === round
            return (
              <button
                key={round}
                onClick={() => toggleRound(round)}
                disabled={!!togglingRound}
                className={clsx(
                  'flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all text-xs font-medium',
                  isOpen
                    ? 'border-green-500 bg-green-50 text-green-700 hover:bg-green-100'
                    : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100'
                )}
              >
                <span className="text-base">{isOpen ? '🔓' : '🔒'}</span>
                <span>{round === 'finals' ? 'Finals' : (SCORING as any)[round]?.label ?? round}</span>
                {toggling
                  ? <Spinner className="w-3 h-3" />
                  : <span className={clsx('text-[10px] font-normal', isOpen ? 'text-green-500' : 'text-gray-400')}>
                      {isOpen ? 'Open' : 'Locked'}
                    </span>
                }
              </button>
            )
          })}
        </div>
      </Card>

      <OrganisationsPanel />
      <GrantAdminPanel />

      <div className="grid grid-cols-3 gap-2 mb-4">
        <StatCard label="Entered"   value={stats.entered}                    accent="green" />
        <StatCard label="Remaining" value={stats.total - stats.entered}      accent={stats.total - stats.entered > 0 ? 'amber' : undefined} />
        <StatCard label="Total"     value={stats.total} />
      </div>

      <RoundTabs active={activeRound} roundPoints={{}} onChange={r => { setActiveRound(r); setActiveGroup('all'); setSearchQuery('') }} />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="font-medium text-gray-700">{sc.label}</span>
          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-[11px] font-medium">★ {sc.exact}</span>
          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[11px] font-medium">✓ {sc.result}</span>
        </div>
        <span className="text-xs text-gray-400">{roundResultCount} of {fixtures[activeRound]?.length ?? 0} entered</span>
      </div>

      <div className="flex gap-2 mb-3 flex-wrap">
        {activeRound === 'gs' && (
          <div className="flex gap-1 flex-wrap">
            {['all','A','B','C','D','E','F','G','H','I','J','K','L'].map(g => (
              <button key={g} onClick={() => setActiveGroup(g)} className={clsx('px-2.5 py-1 text-xs rounded-full border transition-colors', activeGroup === g ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-500 hover:bg-gray-50')}>
                {g === 'all' ? 'All' : `Grp ${g}`}
              </button>
            ))}
          </div>
        )}
        <input type="text" placeholder="Search team…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="flex-1 min-w-[150px] px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
      </div>

      {visibleFixtures.length === 0 ? (
        <EmptyState title="No fixtures found" description={searchQuery ? 'Try a different search.' : 'No fixtures for this round.'} />
      ) : fixturesByGroup ? (
        Object.entries(fixturesByGroup).map(([grp, gFs]) => (
          <div key={grp} className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded-full bg-green-100 text-green-700 text-[10px] font-semibold flex items-center justify-center">{grp}</div>
              <span className="text-sm font-medium text-gray-700">Group {grp}</span>
              <span className="text-xs text-gray-400">{gFs.filter(f => results[f.id]).length}/{gFs.length}</span>
            </div>
            <Card className="p-0 overflow-hidden">
              {gFs.map(f => <AdminResultRow key={f.id} fixture={f} result={results[f.id]} onSave={handleSave} onClear={handleClear} />)}
            </Card>
          </div>
        ))
      ) : (
        <Card className="p-0 overflow-hidden">
          {visibleFixtures.map(f => <AdminResultRow key={f.id} fixture={f} result={results[f.id]} onSave={handleSave} onClear={handleClear} />)}
        </Card>
      )}
    </div>
  )
}
