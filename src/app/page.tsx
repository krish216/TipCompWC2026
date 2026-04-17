'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { CountdownBanner } from '@/components/game/CountdownBanner'
import { Spinner } from '@/components/ui'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'

const KICKOFF = new Date('2026-06-11T19:00:00Z')


// ── CompModal ─────────────────────────────────────────────────────────────────
// Step-based flow matching the login/onboarding page pattern.
// Steps: choose → join | create
function CompModal({
  mode: initialMode,
  tournamentId,
  onSuccess,
  onClose,
}: {
  mode:         'join' | 'create'
  tournamentId: string | null
  onSuccess:    (comp: { id: string; name: string; logo_url?: string | null }) => void
  onClose:      () => void
}) {
  const { session, supabase } = useSupabase()
  const fileRef = useRef<HTMLInputElement>(null)

  type Step = 'choose' | 'join' | 'create'
  const [step,        setStep]        = useState<Step>(initialMode === 'create' ? 'create' : initialMode === 'join' ? 'join' : 'choose')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  // Join
  const [code,        setCode]        = useState('')
  const [lookingUp,   setLookingUp]   = useState(false)
  const [preview,     setPreview]     = useState<{ id:string; name:string; logo_url?:string|null } | null>(null)
  const [codeErr,     setCodeErr]     = useState<string | null>(null)

  // Create
  const [compName,    setCompName]    = useState('')
  const [phone,       setPhone]       = useState('')
  const [email,       setEmail]       = useState('')
  const [logoFile,    setLogoFile]    = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  const lookupCode = async () => {
    if (code.length < 6) return
    setLookingUp(true); setCodeErr(null); setPreview(null)
    try {
      const { data, error } = await fetch(`/api/comps?code=${code}`).then(r => r.json())
      if (error || !data) { setCodeErr('Code not found — check with your comp admin'); return }
      if (tournamentId && data.tournament_id && data.tournament_id !== tournamentId)
        { setCodeErr('This comp belongs to a different tournament'); return }
      setPreview(data)
    } catch { setCodeErr('Something went wrong') }
    finally { setLookingUp(false) }
  }

  const handleJoin = async () => {
    if (!preview) return
    setLoading(true); setError(null)
    const { success, error } = await fetch('/api/comp-admins/self-register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comp_id: preview.id, invite_code: code }),
    }).then(r => r.json())
    setLoading(false)
    if (!success) { setError(error ?? 'Failed to join comp'); return }
    onSuccess({ id: preview.id, name: preview.name, logo_url: preview.logo_url ?? null })
  }

  const handleCreate = async () => {
    if (!compName.trim() || !session) return
    setLoading(true); setError(null)
    const { data: comp, error: err } = await fetch('/api/comps/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: compName.trim(), owner_phone: phone.trim(),
        owner_email: email.trim(), owner_name: '',
        user_id: session.user.id, email: session.user.email,
        tournament_id: tournamentId,
      }),
    }).then(r => r.json())
    if (err || !comp) { setError(err ?? 'Failed to create comp'); setLoading(false); return }
    let logoUrl: string | null = null
    if (logoFile) {
      const ext = logoFile.name.split('.').pop()
      const p   = `${session.user.id}/logo.${ext}`
      const { data: uploaded } = await supabase.storage.from('org-logos').upload(p, logoFile, { upsert: true })
      if (uploaded) {
        const { data: u } = supabase.storage.from('org-logos').getPublicUrl(p)
        logoUrl = u.publicUrl
        await fetch('/api/comps/create', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comp_id: comp.id, logo_url: logoUrl, user_id: session.user.id }),
        })
      }
    }
    setLoading(false)
    onSuccess({ id: comp.id, name: comp.name, logo_url: logoUrl })
  }

  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return
    if (f.size > 2 * 1024 * 1024) { setError('Logo must be under 2MB'); return }
    setLogoFile(f)
    const r = new FileReader(); r.onloadend = () => setLogoPreview(r.result as string); r.readAsDataURL(f)
  }

  const content = (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-3">
            {step !== 'choose' && (
              <button onClick={() => { setStep('choose'); setError(null); setCodeErr(null) }}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
                ← Back
              </button>
            )}
            <div className="text-2xl">
              {step === 'choose' ? '🏆' : step === 'join' ? '🔑' : '✨'}
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {step === 'choose' ? 'Join or create a comp'
                  : step === 'join' ? 'Join a comp'
                  : 'Create a comp'}
              </h2>
              <p className="text-xs text-gray-500">
                {step === 'choose' ? 'Choose an option below'
                  : step === 'join' ? 'Enter your invite code'
                  : 'Set up your group competition'}
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 text-sm flex-shrink-0">
            ✕
          </button>
        </div>

        <div className="px-5 pb-5 space-y-3">

          {/* ── CHOOSE ── */}
          {step === 'choose' && (
            <>
              <button onClick={() => setStep('join')}
                className="w-full flex items-center gap-4 bg-white border-2 border-gray-200 hover:border-green-400 rounded-xl p-4 text-left transition-colors">
                <span className="text-2xl flex-shrink-0">🔑</span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Join a comp</p>
                  <p className="text-xs text-gray-500 mt-0.5">I have an invite code</p>
                </div>
              </button>
              <button onClick={() => setStep('create')}
                className="w-full flex items-center gap-4 bg-white border-2 border-gray-200 hover:border-green-400 rounded-xl p-4 text-left transition-colors">
                <span className="text-2xl flex-shrink-0">✨</span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Create a comp</p>
                  <p className="text-xs text-gray-500 mt-0.5">Set up a new comp for my group</p>
                </div>
              </button>
            </>
          )}

          {/* ── JOIN ── */}
          {step === 'join' && (
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Comp invite code</label>
                <div className="flex gap-2">
                  <input type="text" value={code}
                    onChange={e => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'')); setPreview(null); setCodeErr(null) }}
                    placeholder="e.g. 1VMPT0RA" maxLength={10} autoFocus
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg font-mono uppercase focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
                  <button type="button" onClick={lookupCode}
                    disabled={lookingUp || code.length < 6}
                    className="px-3 py-2 text-xs font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1">
                    {lookingUp ? <Spinner className="w-3 h-3" /> : 'Verify'}
                  </button>
                </div>
                {preview && (
                  <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                    {preview.logo_url
                      ? <img src={preview.logo_url} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0" />
                      : <span className="text-base flex-shrink-0">🏆</span>}
                    <p className="text-xs text-green-800 font-medium">✓ {preview.name}</p>
                  </div>
                )}
                {codeErr && <p className="text-xs text-red-600 mt-1.5">{codeErr}</p>}
              </div>
              {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <button onClick={handleJoin} disabled={loading || !preview}
                className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2">
                {loading && <Spinner className="w-4 h-4 text-white" />}
                Join {preview?.name ?? 'comp'} →
              </button>
            </div>
          )}

          {/* ── CREATE ── */}
          {step === 'create' && (
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Comp name <span className="text-red-500">*</span></label>
                <input type="text" value={compName} onChange={e => setCompName(e.target.value)}
                  placeholder="e.g. The Friday Five" autoFocus maxLength={60}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Phone <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                    placeholder="+61 4xx"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Email <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Logo <span className="text-gray-400 font-normal">(optional, max 2MB)</span></label>
                <div className="flex items-center gap-3">
                  {logoPreview
                    ? <img src={logoPreview} alt="" className="w-10 h-10 rounded-lg object-cover border border-gray-200 flex-shrink-0" />
                    : <div className="w-10 h-10 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-xl flex-shrink-0">🏢</div>
                  }
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50">
                    {logoFile ? 'Change logo' : 'Upload logo'}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogo} />
                </div>
              </div>
              {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <button onClick={handleCreate} disabled={loading || !compName.trim()}
                className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2">
                {loading && <Spinner className="w-4 h-4 text-white" />}
                {!compName.trim() ? 'Enter a comp name to continue' : `Create ${compName} →`}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(content, document.body)
}


export default function HomePage() {
  const { session, supabase } = useSupabase()

  // User profile
  // Initialise from session metadata immediately — updated from DB below
  const [displayName, setDisplayName] = useState<string | null>(
    null  // set in useEffect once session is available
  )
  const [totalPts,    setTotalPts]    = useState<number | null>(null)
  const [myRank,      setMyRank]      = useState<number | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [isAdmin,     setIsAdmin]     = useState(false)
  const [modal,       setModal]       = useState<'join' | 'create' | null>(null)
  // Per-comp rank: { [compId]: { pts, rank } }
  const [compRanks,   setCompRanks]   = useState<Record<string, { pts: number; rank: number }>>({})

  const {
    activeTournaments, tournsComps,
    selectedTournId, selectedCompId,
    selectedTourn, selectedComp,
    isCompAdmin,
    pickTournament, pickComp, refreshComps,
    loading: contextLoading,
  } = useUserPrefs()

  // favourite_team is per-tournament, stored in user_tournaments
  const [favTeam,     setFavTeam]     = useState<string>('')
  const [savingFav,   setSavingFav]   = useState(false)

  const started = Date.now() >= KICKOFF.getTime()

  // ── Load on session ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) { setLoading(false); return }
    // Set name immediately from session metadata — no DB round-trip needed
    setDisplayName(
      session.user.user_metadata?.display_name ??
      session.user.email?.split('@')[0] ??
      null
    )

    const load = async () => {
      // 1. User profile + leaderboard + admin check (parallel)
      const [userRes, lbRes, adminRes] = await Promise.all([
        supabase.from('users').select('display_name').eq('id', session.user.id).single(),
        fetch('/api/leaderboard?scope=global&limit=200'),
        fetch('/api/admin'),
      ])
      const ud = userRes.data as any
      if (ud?.display_name) setDisplayName(ud.display_name)

      const lbData = await lbRes.json()
      const myRow = lbData.my_entry ?? (lbData.data ?? []).find((e: any) => e.user_id === session.user.id)
      if (myRow) { setTotalPts(myRow.total_points); setMyRank(myRow.rank) }

      const adminData = await adminRes.json()
      setIsAdmin(adminData.is_admin === true)

      // Tournaments + comps are managed by UserPrefsContext
      // Just set loading false once profile is done
      setLoading(false)
    }
    load()

    // Fetch per-comp ranks when tournsComps changes
    const loadCompRanks = async (comps: typeof tournsComps) => {
      if (!session || comps.length === 0) return
      const results: Record<string, { pts: number; rank: number }> = {}
      await Promise.all(comps.map(async c => {
        try {
          const d = await fetch(`/api/leaderboard?scope=comp&comp_id=${c.id}&limit=200`).then(r => r.json())
          const me = d.my_entry ?? (d.data ?? []).find((e: any) => e.user_id === session.user.id)
          if (me) results[c.id] = { pts: me.total_points, rank: me.rank ?? 0 }
        } catch { /* ignore */ }
      }))
      setCompRanks(results)
    }
    load()
  }, [session, supabase])

  useEffect(() => {
    if (session && selectedTournId) loadFavTeam(selectedTournId)
  }, [session, selectedTournId])

  const NavCard = ({ href, icon, title, description, accent = false }: {
    href: string; icon: string; title: string; description: string; accent?: boolean
  }) => (
    <Link href={href} className={`flex items-start gap-4 p-4 rounded-xl border transition-all hover:shadow-sm hover:-translate-y-0.5 ${accent ? 'bg-green-600 border-green-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}>
      <span className="text-2xl flex-shrink-0 mt-0.5">{icon}</span>
      <div>
        <p className={`text-sm font-semibold ${accent ? 'text-white' : 'text-gray-900'}`}>{title}</p>
        <p className={`text-xs mt-0.5 ${accent ? 'text-green-100' : 'text-gray-500'}`}>{description}</p>
      </div>
    </Link>
  )

  // pickTournament and pickComp come from useUserPrefs()

  // Load fav team for the selected tournament from user_tournaments
  const loadFavTeam = async (tournId: string) => {
    const { data } = await supabase
      .from('user_tournaments')
      .select('favourite_team')
      .eq('user_id', session!.user.id)
      .eq('tournament_id', tournId)
      .single()
    setFavTeam((data as any)?.favourite_team ?? '')
  }

  // Save fav team to user_tournaments for the selected tournament
  const saveFavTeam = async (team: string) => {
    if (!selectedTournId) return
    setSavingFav(true)
    setFavTeam(team)
    await fetch('/api/user-tournaments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournament_id: selectedTournId, favourite_team: team || null }),
    })
    setSavingFav(false)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <CountdownBanner />

      {/* ── Not logged in hero ── */}
      {!session && (
        <div className="mb-8 text-center">
          <img src="/wc2026-logo.png" alt="FIFA World Cup 2026" width={80} height={120}
            className="w-20 h-auto mx-auto mb-3 drop-shadow-md object-contain" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">World Cup 2026 Tipping Comp</h1>
          <p className="text-sm text-gray-500">Predict every match. Compete with your tribe.</p>
        </div>
      )}

      {/* ── Logged in: tournament + comp selector ── */}
      {session && (
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Single consolidated card — tournament, welcome, fav team, comps */}
          <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 20, overflow: 'hidden' }}>

            {/* Tournament pills */}
            <div style={{ padding: '14px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
              <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {activeTournaments.length > 1 ? 'Select tournament' : 'Tournament'}
              </p>
              {(loading || contextLoading) ? (
                <div style={{ height: 36, display: 'flex', alignItems: 'center' }}>
                  <Spinner className="w-5 h-5" />
                </div>
              ) : activeTournaments.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>No active tournaments</p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {activeTournaments.map(t => {
                    const isSel = selectedTournId === t.id
                    return (
                      <button key={t.id} onClick={() => !isSel && pickTournament(t.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                          borderRadius: 99, cursor: isSel ? 'default' : 'pointer',
                          border: isSel ? '2px solid var(--color-border-success)' : '1.5px solid var(--color-border-tertiary)',
                          background: isSel ? 'var(--color-background-success)' : 'var(--color-background-secondary)',
                          color: isSel ? 'var(--color-text-success)' : 'var(--color-text-secondary)',
                          fontSize: 13, fontWeight: isSel ? 600 : 400, transition: 'all 0.15s',
                        }}>
                        <span>⚽</span>
                        <span>{t.name}</span>
                        {isSel && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-text-success)', opacity: 0.7 }} />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Welcome strip — sits under the tournament banner */}
            {session && displayName && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '11px 16px',
                background: 'var(--color-background-secondary)',
                borderBottom: '0.5px solid var(--color-border-tertiary)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg, #153d26, #16a34a)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, color: '#fff',
                  }}>
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    Welcome back, {displayName}! 👋
                  </span>
                </div>
                {/* Global rank pill */}
                {(totalPts !== null || myRank !== null) && (
                  <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
                    {totalPts !== null && (
                      <div style={{ textAlign: 'center' }}>
                        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#16a34a', lineHeight: 1 }}>{totalPts}</p>
                        <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--color-text-tertiary)' }}>pts</p>
                      </div>
                    )}
                    {myRank !== null && (
                      <div style={{ textAlign: 'center' }}>
                        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1 }}>#{myRank}</p>
                        <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--color-text-tertiary)' }}>global</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Favourite team */}
            {selectedTournId && selectedTourn?.teams && (selectedTourn.teams as string[]).length > 0 && (
              <div style={{ padding: '11px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0 }}>
                    ⭐ Fav team
                  </span>
                  <select
                    value={favTeam}
                    onChange={e => saveFavTeam(e.target.value)}
                    disabled={savingFav}
                    style={{
                      flex: 1, padding: '6px 10px', fontSize: 13,
                      border: favTeam ? '1.5px solid var(--color-border-success)' : '1.5px solid var(--color-border-tertiary)',
                      borderRadius: 8, background: 'var(--color-background-primary)',
                      color: favTeam ? 'var(--color-text-success)' : 'var(--color-text-secondary)',
                      cursor: 'pointer', outline: 'none', fontWeight: favTeam ? 500 : 400,
                    }}>
                    <option value="">Pick your team — double pts Grp &amp; R32</option>
                    {(selectedTourn.teams as string[]).sort().map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

          {/* Comp picker — inline in same card, only when tournament selected */}
          {selectedTournId && (
            <div style={{
              background: 'var(--color-background-primary)',
              border: '0.5px solid var(--color-border-tertiary)',
              borderRadius: 20, overflow: 'hidden',
            }}>
              {/* Header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px',
                borderBottom: tournsComps.length > 0 ? '0.5px solid var(--color-border-tertiary)' : 'none',
              }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  My Comps
                </p>
                {/* Quick-action links */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => setModal('join')} style={{
                    fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)',
                    background: 'none', padding: '4px 10px',
                    border: '1px solid var(--color-border-tertiary)',
                    borderRadius: 99, cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                    🔑 Join
                  </button>
                  <button onClick={() => setModal('create')} style={{
                    fontSize: 12, fontWeight: 600, color: '#ffffff',
                    background: 'linear-gradient(135deg, #153d26, #16a34a)',
                    border: 'none', padding: '4px 10px',
                    borderRadius: 99, cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                    + Create
                  </button>
                </div>
              </div>

              {/* Comp list */}
              {tournsComps.length === 0 ? (
                /* Empty state — welcoming, not a dead end */
                <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>🏆</div>
                    <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      No comp yet for this tournament
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
                      Join a friend's comp with an invite code, or create one for your group.
                    </p>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button onClick={() => setModal('join')} style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      padding: '12px 8px', borderRadius: 14, border: '1.5px solid var(--color-border-secondary)',
                      background: 'var(--color-background-secondary)', cursor: 'pointer',
                    }}>
                      <span style={{ fontSize: 20 }}>🔑</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Join a comp</span>
                      <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>Have an invite code</span>
                    </button>
                    <button onClick={() => setModal('create')} style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      padding: '12px 8px', borderRadius: 14,
                      border: '1.5px solid rgba(22,163,74,0.3)',
                      background: 'linear-gradient(160deg, #0a2e1c, #153d26)', cursor: 'pointer',
                    }}>
                      <span style={{ fontSize: 20 }}>🏆</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#ffffff' }}>Create a comp</span>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>For my group</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Comp cards */
                <div>
                  {tournsComps.map((c, idx) => {
                    const isSel = selectedCompId === c.id
                    const isAdmin = isCompAdmin && isSel
                    return (
                      <button key={c.id} onClick={() => pickComp(c)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                          padding: '13px 16px', border: 'none', cursor: 'pointer', textAlign: 'left',
                          background: isSel ? 'var(--color-background-success)' : 'transparent',
                          borderBottom: idx < tournsComps.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none',
                          transition: 'background 0.15s',
                          position: 'relative',
                        }}>
                        {/* Logo or initial */}
                        <div style={{
                          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                          overflow: 'hidden', border: '1px solid var(--color-border-tertiary)',
                          background: 'var(--color-background-secondary)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {c.logo_url
                            ? <img src={c.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-tertiary)' }}>
                                {c.name.charAt(0).toUpperCase()}
                              </span>
                          }
                        </div>

                        {/* Name + admin badge */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <p style={{
                              margin: 0, fontSize: 14, fontWeight: isSel ? 700 : 500,
                              color: isSel ? 'var(--color-text-success)' : 'var(--color-text-primary)',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {c.name}
                            </p>
                            {isAdmin && (
                              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-warning)', background: 'var(--color-background-warning)', padding: '1px 6px', borderRadius: 99, flexShrink: 0 }}>
                                🛠 admin
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Comp rank + pts inline */}
                        {compRanks[c.id] && (
                          <div style={{ display: 'flex', gap: 10, flexShrink: 0, alignItems: 'center' }}>
                            <div style={{ textAlign: 'right' }}>
                              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: isSel ? 'var(--color-text-success)' : 'var(--color-text-primary)', lineHeight: 1 }}>
                                {compRanks[c.id].pts}<span style={{ fontSize: 10, fontWeight: 400, color: 'var(--color-text-tertiary)', marginLeft: 2 }}>pts</span>
                              </p>
                              <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                                #{compRanks[c.id].rank} in comp
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Selection indicator */}
                        {isSel ? (
                          <div style={{
                            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                            background: 'var(--color-text-success)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>
                          </div>
                        ) : (
                          <div style={{
                            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                            border: '1.5px solid var(--color-border-tertiary)',
                          }} />
                        )}
                      </button>
                    )
                  })}

                  {/* Add more comps footer */}
                  <div style={{
                    display: 'flex', gap: 0,
                    borderTop: '0.5px solid var(--color-border-tertiary)',
                  }}>
                    <button onClick={() => setModal('join')} style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      gap: 6, padding: '10px 0', border: 'none', background: 'transparent', cursor: 'pointer',
                      fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)',
                      borderRight: '0.5px solid var(--color-border-tertiary)',
                    }}>
                      🔑 Join another
                    </button>
                    <button onClick={() => setModal('create')} style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      gap: 6, padding: '10px 0', border: 'none', background: 'transparent', cursor: 'pointer',
                      fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)',
                    }}>
                      + Create new
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          </div>  {/* ← close consolidated card */}
        </div>
      )}

      {loading && session && <div className="flex justify-center py-6"><Spinner className="w-6 h-6" /></div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {session ? (
          <>
            {selectedCompId
              ? <NavCard href="/predict" icon="🎯" title="Predict" description={started ? "Enter scores before kickoff" : "Predictions open — get ahead"} accent />
              : <div className="flex items-start gap-4 p-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed">
                  <span className="text-2xl flex-shrink-0 mt-0.5">🎯</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-400">Predict</p>
                    <p className="text-xs text-gray-400 mt-0.5">Select a comp above to start predicting</p>
                  </div>
                </div>
            }
            <NavCard href="/leaderboard" icon="🏆" title="Leaderboard" description="Global rankings and round-by-round standings" />
            <NavCard href="/tribe"       icon="👥" title="Your tribe"  description="Compete on a private leaderboard with friends" />
            <NavCard href="/rules"       icon="📖" title="How to play" description="Scoring guide, tournament format, and FAQ" />
            <NavCard href="/settings"    icon="⚙️" title="Settings"    description="Favourite team, notifications, account" />
            {isAdmin && <NavCard href="/admin" icon="🔧" title="Admin panel" description="Enter results and manage the tournament" />}
          </>
        ) : (
          <>
            <NavCard href="/login?tab=register" icon="🚀" title="Join free"     description="Register and start predicting in 30 seconds" accent />
            <NavCard href="/login" icon="🔑" title="Sign in"       description="Already have an account" />
            <NavCard href="/leaderboard" icon="🏆" title="Leaderboard" description="See the current standings" />
            <NavCard href="/rules"       icon="📖" title="How to play" description="Scoring guide and tournament format" />
          </>
        )}
      </div>

      {/* Comp modal */}
      {modal && (
        <CompModal
          mode={modal}
          tournamentId={selectedTournId}
          onClose={() => setModal(null)}
          onSuccess={async (comp) => {
            setModal(null)
            // Add to tournsComps list and select it
            await pickComp(comp as any)
            // Re-fetch full comp list so any server-side data (invite code etc) is fresh
            await refreshComps()
          }}
        />
      )}

      {/* Tournament stats — driven by selectedTourn metadata */}
      {(() => {
        const t = selectedTourn
        const stats = [
          { label: 'Matches', value: t?.total_matches != null ? String(t.total_matches) : '—' },
          { label: 'Teams',   value: t?.total_teams   != null ? String(t.total_teams)   : '—' },
          { label: 'Rounds',  value: t?.total_rounds  != null ? String(t.total_rounds)  : '—' },
          { label: 'Max pts', value: '??' },
        ]
        const kickoffStr = t?.start_date
          ? new Date(t.start_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
          : null
        const finalStr = t?.final_date
          ? new Date(t.final_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
          : null
        return (
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              {t?.name ?? 'Tournament'}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              {stats.map(s => (
                <div key={s.label} className="bg-white rounded-lg border border-gray-100 py-2.5 px-2">
                  <p className="text-lg font-bold text-gray-900">{s.value}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-xs text-gray-500">
              {kickoffStr && <><span>🗓 Kickoff: {kickoffStr}</span><span>·</span></>}
              {t?.kickoff_venue && <><span>🏟 {t.kickoff_venue}</span><span>·</span></>}
              {finalStr && t?.final_venue && <span>🏆 Final: {finalStr}, {t.final_venue}</span>}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
