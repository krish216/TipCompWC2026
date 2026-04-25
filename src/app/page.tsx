'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { CountdownBanner } from '@/components/game/CountdownBanner'
import { Spinner } from '@/components/ui'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'

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
  const [avatar,       setAvatar]       = useState<string | null>(null)
  const [modal,       setModal]       = useState<'join' | 'create' | null>(null)
  const [allPredictions, setAllPredictions] = useState<any[]>([])
  const [allFixtures,    setAllFixtures]    = useState<any[]>([])
  const [roundLocks,     setRoundLocks]     = useState<Record<string, boolean>>({})

  const {
    activeTournaments, tournsComps,
    selectedTournId, selectedCompId,
    selectedTourn,
    isCompAdmin,
    scoringConfig,
    pickTournament, pickComp, refreshComps,
    hasTribe, refreshHasTribe,
    loading: contextLoading,
  } = useUserPrefs()

  // Current round = the open round with the lowest round_order.
  // Used to scope the tip completion flag to the round that matters now.
  const currentRoundCode = useMemo(() => {
    const openCodes = Object.entries(roundLocks)
      .filter(([, isOpen]) => isOpen)
      .map(([code]) => code)
    if (!openCodes.length) return null
    return openCodes.sort((a, b) => {
      const oA = (scoringConfig.rounds as any)[a]?.round_order ?? 999
      const oB = (scoringConfig.rounds as any)[b]?.round_order ?? 999
      return oA - oB
    })[0] ?? null
  }, [roundLocks, scoringConfig])

  // Per-round completion counts (falls back to totals if no open round)
  const { predCount, fixtureCount } = useMemo(() => {
    if (currentRoundCode) {
      return {
        predCount:    allPredictions.filter(p => p.fixtures?.round === currentRoundCode).length,
        fixtureCount: allFixtures.filter(f => f.round === currentRoundCode).length,
      }
    }
    return { predCount: allPredictions.length, fixtureCount: allFixtures.length }
  }, [currentRoundCode, allPredictions, allFixtures])

  // Ticks every 30s so deadline labels stay fresh without a full reload
  const [tickNow, setTickNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setTickNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  // Earliest upcoming (unscored, > 5 min away) fixture kickoff in the current round
  const nextKickoff = useMemo(() => {
    if (!currentRoundCode) return null
    const cutoff = tickNow + 5 * 60 * 1000
    const times = allFixtures
      .filter(f => f.round === currentRoundCode && f.result == null)
      .map(f => new Date(f.kickoff_utc).getTime())
      .filter(t => t > cutoff)
      .sort((a, b) => a - b)
    return times[0] ?? null
  }, [currentRoundCode, allFixtures, tickNow])

  // Deadline label + urgency level derived from time to next kickoff
  const { deadlineLabel, urgencyLevel } = useMemo(() => {
    if (!nextKickoff) return { deadlineLabel: null, urgencyLevel: 'none' as const }
    const msLeft  = nextKickoff - tickNow
    const hrsLeft = msLeft / 3_600_000
    if (hrsLeft > 48) {
      const d   = new Date(nextKickoff)
      const day = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
      const hr  = d.getHours()
      const min = d.getMinutes()
      const ampm = hr >= 12 ? 'pm' : 'am'
      const h12  = hr % 12 || 12
      const time = min ? `${h12}:${String(min).padStart(2, '0')}${ampm}` : `${h12}${ampm}`
      return { deadlineLabel: `Closing ${day} ${time}`, urgencyLevel: 'none' as const }
    }
    if (hrsLeft > 6) {
      const h = Math.floor(hrsLeft)
      return { deadlineLabel: `Closing in ${h}h`, urgencyLevel: 'amber' as const }
    }
    if (hrsLeft > 1) {
      const h = Math.floor(hrsLeft)
      const m = Math.floor((hrsLeft - h) * 60)
      return { deadlineLabel: `Closing in ${h}h ${m}m`, urgencyLevel: 'orange' as const }
    }
    const m = Math.floor(hrsLeft * 60)
    return { deadlineLabel: `Closing in ${m}m`, urgencyLevel: 'red' as const }
  }, [nextKickoff, tickNow])

  const [compRanks, setCompRanks] = useState<Record<string, number | null>>({})

  // Onboarding step completion — fully derived from context, no DB flag needed
  const step2Done = !contextLoading && selectedCompId !== null
  const step3Done = hasTribe === true

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
      const [userRes, lbRes, predRes, fxRes] = await Promise.all([
        supabase.from('users').select('display_name, avatar_url').eq('id', session.user.id).maybeSingle(),
        fetch('/api/leaderboard?scope=global&limit=200'),
        fetch('/api/predictions'),
        fetch('/api/fixtures'),
      ])
      const ud = userRes.data as any
      if (ud?.display_name) setDisplayName(ud.display_name)
      if (ud?.avatar_url) setAvatar(ud.avatar_url)

      const lbData = await lbRes.json()
      const myRow = lbData.my_entry ?? (lbData.data ?? []).find((e: any) => e.user_id === session.user.id)
      if (myRow) { setTotalPts(myRow.total_points); setMyRank(myRow.rank) }

      const [predData, fxData] = await Promise.all([predRes.json(), fxRes.json()])
      setAllPredictions(predData.data ?? [])
      setAllFixtures(fxData.data ?? [])

      setLoading(false)
    }
    load()
  }, [session, supabase])

  // Fetch round-locks whenever the selected tournament changes
  useEffect(() => {
    if (!session || !selectedTournId) return
    fetch(`/api/round-locks?tournament_id=${selectedTournId}`)
      .then(r => r.json())
      .then(d => setRoundLocks(d.data ?? {}))
      .catch(() => {})
  }, [session, selectedTournId])

  // Fetch comp ranks in parallel for all comps the user belongs to
  useEffect(() => {
    if (!session || !tournsComps.length) return
    const tid = selectedTournId ? `&tournament_id=${selectedTournId}` : ''
    Promise.all(
      tournsComps.map(c =>
        fetch(`/api/leaderboard?scope=comp&comp_id=${c.id}&limit=500${tid}`)
          .then(r => r.json())
          .then(d => ({ id: c.id, rank: (d.my_entry?.rank ?? null) as number | null }))
          .catch(() => ({ id: c.id, rank: null as number | null }))
      )
    ).then(results => {
      const map: Record<string, number | null> = {}
      results.forEach(({ id, rank }) => { map[id] = rank })
      setCompRanks(map)
    })
  }, [session, tournsComps, selectedTournId])

  // Refresh tribe status when the tab regains focus (user returns after joining a tribe)
  useEffect(() => {
    if (!session) return
    window.addEventListener('focus', refreshHasTribe)
    return () => window.removeEventListener('focus', refreshHasTribe)
  }, [session, refreshHasTribe])

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

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <CountdownBanner />

      {/* ── Not logged in hero ── */}
      {!session && (
        <div style={{
          background: 'linear-gradient(160deg, #0a2e1c 0%, #153d26 50%, #0d3320 100%)',
          borderRadius: 20, padding: '28px 24px', marginBottom: 24, textAlign: 'center',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)', position: 'relative', overflow: 'hidden',
        }}>
          {/* Subtle texture */}
          <div style={{
            position: 'absolute', inset: 0, opacity: 0.04,
            backgroundImage: 'repeating-linear-gradient(45deg,#fff 0,#fff 1px,transparent 0,transparent 50%)',
            backgroundSize: '12px 12px',
          }} />
          <div style={{ position: 'relative' }}>
            <img src="/wc2026-logo.png" alt="World Cup 2026" width={60} height={90}
              style={{ width: 56, height: 'auto', margin: '0 auto 12px', display: 'block', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.4))' }} />
            <h1 style={{ margin: '0 0 6px', fontSize: 30, fontWeight: 900, color: '#ffffff', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
              TribePicks
            </h1>
            <p style={{ margin: '0 0 4px', fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>
              Predict every match. Compete with your tribe.
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'rgba(74,222,128,0.8)', fontWeight: 500 }}>
              ⚽ FIFA World Cup 2026
            </p>
          </div>
        </div>
      )}

      {/* ── Logged in ── */}
      {session && (
        <div style={{ marginBottom: 20 }}>

          {(loading || contextLoading) ? (
            <div className="flex justify-center py-8"><Spinner className="w-6 h-6" /></div>
          ) : !step2Done ? (

            /* ── Onboarding hero — shown until user joins or creates a comp ── */
            <div style={{
              background: 'linear-gradient(160deg, #0a2e1c 0%, #153d26 50%, #0d3320 100%)',
              borderRadius: 20, padding: '24px 20px', marginBottom: 16,
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)', position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', inset: 0, opacity: 0.04, backgroundImage: 'repeating-linear-gradient(45deg,#fff 0,#fff 1px,transparent 0,transparent 50%)', backgroundSize: '12px 12px' }} />
              <div style={{ position: 'relative' }}>
                <p style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
                  Hey {displayName ? `${displayName}!` : 'there!'} 👋
                </p>
                <p style={{ margin: '0 0 20px', fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>
                  {selectedTourn
                    ? `Predict every ${selectedTourn.name} match and compete with your tribe.`
                    : 'Predict every match and compete with your tribe.'}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                  {/* Step 1 — always done */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                      background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: '#fff',
                    }}>✓</span>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
                      Join TribePicks
                    </p>
                  </div>

                  {/* Step 2 — active: join or create comp */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                      background: 'rgba(255,255,255,0.12)', border: '2px solid rgba(255,255,255,0.4)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)',
                    }}>2</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: '#fff' }}>
                        Join or create a comp
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <button onClick={() => setModal('join')} style={{
                          padding: '12px 8px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)',
                          background: 'rgba(255,255,255,0.08)', cursor: 'pointer', textAlign: 'center',
                        }}>
                          <p style={{ margin: '0 0 3px', fontSize: 20 }}>🔑</p>
                          <p style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 700, color: '#fff' }}>Join a comp</p>
                          <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>Have a code</p>
                        </button>
                        <button onClick={() => setModal('create')} style={{
                          padding: '12px 8px', borderRadius: 12, border: '1px solid rgba(74,222,128,0.35)',
                          background: 'rgba(74,222,128,0.12)', cursor: 'pointer', textAlign: 'center',
                        }}>
                          <p style={{ margin: '0 0 3px', fontSize: 20 }}>🏆</p>
                          <p style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 700, color: '#4ade80' }}>Create a comp</p>
                          <p style={{ margin: 0, fontSize: 10, color: 'rgba(74,222,128,0.55)' }}>For my group</p>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Step 3 — locked until step 2 done */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: 0.4 }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                      background: 'rgba(255,255,255,0.08)', border: '2px solid rgba(255,255,255,0.25)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)',
                    }}>3</span>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
                      Join a tribe
                    </p>
                  </div>

                </div>
              </div>
            </div>

          ) : (

            /* ── Main view — comp is selected ── */
            <>

              {/* Welcome bar */}
              {displayName && (
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    {avatar
                      ? <img src={avatar} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid #bbf7d0' }} />
                      : <div style={{
                          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                          background: 'linear-gradient(135deg, #153d26, #16a34a)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, fontWeight: 700, color: '#fff',
                        }}>
                          {displayName.charAt(0).toUpperCase()}
                        </div>
                    }
                    <span className="text-sm font-semibold text-gray-800">
                      {displayName}
                    </span>
                  </div>
                  {(totalPts !== null || myRank !== null) && (
                    <div className="flex items-center gap-3">
                      {totalPts !== null && (
                        <div className="text-right">
                          <p className="text-sm font-bold text-green-600 leading-none">{totalPts}<span className="text-xs font-normal text-gray-400 ml-0.5">pts</span></p>
                          <p className="text-[10px] text-gray-400">global</p>
                        </div>
                      )}
                      {myRank !== null && (
                        <div className="text-right">
                          <p className="text-sm font-bold text-gray-800 leading-none">#{myRank}</p>
                          <p className="text-[10px] text-gray-400">rank</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Compact tribe progress — shown until tribe is joined */}
              {!step3Done && (
                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-amber-800 mb-1">Almost there!</p>
                    <div className="flex items-center gap-1.5 text-xs flex-wrap">
                      <span className="text-green-600 font-medium">✅ TribePicks</span>
                      <span className="text-gray-300">·</span>
                      <span className="text-green-600 font-medium">✅ Comp</span>
                      <span className="text-gray-300">·</span>
                      <span className="text-amber-700 font-medium">○ Tribe</span>
                    </div>
                  </div>
                  <Link href="/tribe"
                    className="flex-shrink-0 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap">
                    Find a tribe →
                  </Link>
                </div>
              )}

              {/* Tournament context */}
              {(() => {
                const roundName = currentRoundCode
                  ? scoringConfig.rounds[currentRoundCode]?.round_name ?? currentRoundCode
                  : null
                const pct = fixtureCount > 0
                  ? Math.round((predCount / fixtureCount) * 100)
                  : null
                const allTipped = pct === 100
                const urgencyColor =
                  urgencyLevel === 'red'    ? 'text-red-600' :
                  urgencyLevel === 'orange' ? 'text-orange-500' :
                  urgencyLevel === 'amber'  ? 'text-amber-600' :
                  'text-gray-500'
                return (
                  <>
                    {activeTournaments.length > 1 && (
                      <div className="flex flex-wrap gap-2 mb-1.5">
                        {activeTournaments.map(t => {
                          const isSel = selectedTournId === t.id
                          return (
                            <button key={t.id} onClick={() => !isSel && pickTournament(t.id)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                                isSel
                                  ? 'bg-green-600 text-white shadow-sm'
                                  : 'bg-white border border-gray-200 text-gray-500 hover:border-green-400'
                              }`}>
                              ⚽ {t.name}
                            </button>
                          )
                        })}
                      </div>
                    )}
                    {activeTournaments.length === 1 && selectedTourn && (
                      <p className="text-xs text-gray-400 mb-0.5 flex items-center gap-1.5">
                        <span>⚽</span>{selectedTourn.name}
                      </p>
                    )}
                    {roundName && pct !== null && (
                      <p className={`text-xs mb-3 flex items-center gap-1 ${urgencyColor}`}>
                        <span className="text-gray-500">{roundName}</span>
                        <span className="text-gray-300 mx-0.5">·</span>
                        {allTipped
                          ? <span className="text-green-600 font-medium">✅ all tipped</span>
                          : <>
                              <span>{pct}% tipped</span>
                              {deadlineLabel && (
                                <>
                                  <span className="text-gray-300 mx-0.5">·</span>
                                  <span className={urgencyColor}>{deadlineLabel}</span>
                                  {urgencyLevel === 'red' && (
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 ml-1 animate-pulse flex-shrink-0" />
                                  )}
                                </>
                              )}
                            </>
                        }
                      </p>
                    )}
                    {(!roundName || pct === null) && <div className="mb-3" />}
                  </>
                )
              })()}

              {/* Comp radio list */}
              {tournsComps.length > 0 && selectedTournId && (
                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden mb-3">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">My Comps</p>
                    <div className="flex gap-1.5">
                      <button onClick={() => setModal('join')}
                        className="text-[11px] text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors">
                        🔑 Join
                      </button>
                      <button onClick={() => setModal('create')}
                        className="text-[11px] text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors">
                        + Create
                      </button>
                    </div>
                  </div>
                  {tournsComps.map(c => {
                    const isSel = selectedCompId === c.id
                    const isAdm = isCompAdmin && isSel
                    const rank  = compRanks[c.id]
                    return (
                      <button key={c.id}
                        onClick={() => pickComp(c)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-b border-gray-50 last:border-0 ${
                          isSel ? 'bg-green-50' : 'hover:bg-gray-50'
                        }`}>
                        <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                          isSel ? 'border-green-600 bg-green-600' : 'border-gray-300'
                        }`}>
                          {isSel && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </span>
                        <span className={`flex-1 text-sm truncate ${isSel ? 'font-semibold text-green-700' : 'font-medium text-gray-700'}`}>
                          {c.name}
                        </span>
                        {isAdm && (
                          <Link href="/comp-admin" onClick={e => e.stopPropagation()}
                            className="text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">
                            ⚙️ Manage
                          </Link>
                        )}
                        {rank != null && (
                          <span className="text-xs text-gray-400 flex-shrink-0">#{rank}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

            </>
          )}
        </div>
      )}

      {/* ── Action grid — logged-out only ──────────────────────── */}
      {!session && (
        <div className="grid grid-cols-2 gap-2.5 mb-6">
          <NavCard href="/login?tab=register" icon="🚀" title="Join free"    description="Register in 30 seconds" accent />
          <NavCard href="/login"              icon="🔑" title="Sign in"      description="Already have an account" />
          <NavCard href="/leaderboard"        icon="🏆" title="ScoreBoard"   description="See the current standings" />
          <NavCard href="/rules"              icon="📖" title="How to play"  description="Scoring guide" />
        </div>
      )}

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
            <div className="mt-3 pt-3 border-t border-gray-100">
              <Link href="/rules" className="text-xs font-medium text-green-700 hover:text-green-800 flex items-center gap-1">
                📖 View scoring rules &amp; how to play →
              </Link>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
