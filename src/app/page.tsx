'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { CountdownBanner } from '@/components/game/CountdownBanner'
import { Spinner } from '@/components/ui'
import { useUserPrefs, type Tournament } from '@/components/layout/UserPrefsContext'

// ── CompModal ─────────────────────────────────────────────────────────────────
// Steps: choose → join | create → created
function CompModal({
  mode: initialMode,
  tournamentId,
  tournament,
  onSuccess,
  onManageComp,
  onClose,
}: {
  mode:          'join' | 'create'
  tournamentId:  string | null
  tournament:    Tournament | null
  onSuccess:     (comp: { id: string; name: string; logo_url?: string | null }) => void
  onManageComp?: (comp: { id: string; name: string }) => void
  onClose:       () => void
}) {
  const { session } = useSupabase()

  type Step = 'choose' | 'join' | 'create' | 'created'
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
  const [createdComp, setCreatedComp] = useState<{ id: string; name: string; invite_code?: string } | null>(null)
  const [copied,      setCopied]      = useState(false)

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
        name: compName.trim(), owner_name: '',
        user_id: session.user.id, email: session.user.email,
        tournament_id: tournamentId,
      }),
    }).then(r => r.json())
    setLoading(false)
    if (err || !comp) { setError(err ?? 'Failed to create comp'); return }
    setCreatedComp({ id: comp.id, name: comp.name, invite_code: comp.invite_code })
    setStep('created')
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
            {step !== 'choose' && step !== 'created' && (
              <button onClick={() => { setStep('choose'); setError(null); setCodeErr(null) }}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
                ← Back
              </button>
            )}
            <div className="text-2xl">
              {step === 'choose' ? '🏆' : step === 'join' ? '🔑' : step === 'created' ? '✅' : '✨'}
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {step === 'choose' ? 'Join or create a comp'
                  : step === 'join' ? 'Join a comp'
                  : step === 'created' ? 'Comp created!'
                  : 'Create a comp'}
              </h2>
              <p className="text-xs text-gray-500">
                {step === 'choose' ? 'Choose an option below'
                  : step === 'join' ? 'Enter your invite code'
                  : step === 'created' ? 'Invite your group to start competing'
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
              {tournament && (
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-100 rounded-lg">
                  {tournament.logo_url
                    ? <img src={tournament.logo_url} alt="" className="w-5 h-5 rounded object-cover flex-shrink-0" />
                    : <span className="text-sm flex-shrink-0">⚽</span>}
                  <span className="text-xs font-semibold text-green-800">{tournament.name}</span>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Comp name <span className="text-red-500">*</span></label>
                <input type="text" value={compName} onChange={e => setCompName(e.target.value)}
                  placeholder="e.g. The Friday Five" autoFocus maxLength={60}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
              </div>
              {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <button onClick={handleCreate} disabled={loading || !compName.trim()}
                className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2">
                {loading && <Spinner className="w-4 h-4 text-white" />}
                {!compName.trim() ? 'Enter a comp name to continue' : `Create ${compName} →`}
              </button>
            </div>
          )}

          {/* ── CREATED ── */}
          {step === 'created' && createdComp && (
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-900 mb-0.5">{createdComp.name}</p>
                <p className="text-xs text-gray-500">Your comp is ready to go!</p>
              </div>
              {createdComp.invite_code && (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1.5">Invite code</p>
                  <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                    <span className="flex-1 text-sm font-mono font-bold text-gray-800 tracking-widest">{createdComp.invite_code}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(createdComp.invite_code!)
                        setCopied(true)
                        setTimeout(() => setCopied(false), 2000)
                      }}
                      className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 px-2 py-1 rounded transition-colors flex-shrink-0">
                      {copied ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">Share this code with your group to join</p>
                </div>
              )}
              <button
                onClick={() => onManageComp?.({ id: createdComp.id, name: createdComp.name })}
                className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl">
                Manage comp &amp; invite tipsters →
              </button>
              <button
                onClick={() => onSuccess({ id: createdComp.id, name: createdComp.name })}
                className="w-full py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                Done
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
  const router = useRouter()
  const searchParams = useSearchParams()
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

  // Auto-open the Create Comp modal when the user arrives after organiser registration
  useEffect(() => {
    if (searchParams.get('flow') === 'create' && session) {
      setModal('create')
      router.replace('/')
    }
  }, [searchParams, session])

  // Ticks every 30s so deadline labels stay fresh without a full reload
  const [tickNow, setTickNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setTickNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  // Earliest upcoming (> 5 min away) fixture kickoff in the current round.
  // Deliberately ignores result status — pre-scored warm-up fixtures still have
  // a future kickoff that defines when predictions must close.
  const nextKickoff = useMemo(() => {
    if (!currentRoundCode) return null
    const cutoff = tickNow + 5 * 60 * 1000
    const times = allFixtures
      .filter(f => f.round === currentRoundCode)
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

  const [tribeInfoOpen,  setTribeInfoOpen]  = useState(false)
  const [compRanks,      setCompRanks]      = useState<Record<string, number | null>>({})
  const [compSizes,      setCompSizes]      = useState<Record<string, number>>({})
  const [pendingInvites, setPendingInvites] = useState<any[]>([])
  const [joiningInvite,  setJoiningInvite]  = useState<string | null>(null)
  const [decliningId,    setDecliningId]    = useState<string | null>(null)
  const [blockFuture,    setBlockFuture]    = useState(false)
  const [decliningBusy,  setDecliningBusy]  = useState(false)

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
      const [userRes, lbRes, predRes, fxRes, invRes] = await Promise.all([
        supabase.from('users').select('display_name, avatar_url').eq('id', session.user.id).maybeSingle(),
        fetch('/api/leaderboard?scope=global&no_breakdown=true'),
        fetch('/api/predictions'),
        fetch('/api/fixtures'),
        fetch('/api/comp-invitations/pending'),
      ])
      const ud = userRes.data as any
      if (ud?.display_name) setDisplayName(ud.display_name)
      if (ud?.avatar_url) setAvatar(ud.avatar_url)

      const lbData = await lbRes.json()
      const myRow = lbData.my_entry ?? (lbData.data ?? []).find((e: any) => e.user_id === session.user.id)
      if (myRow) { setTotalPts(myRow.total_points); setMyRank(myRow.rank) }

      const [predData, fxData, invData] = await Promise.all([predRes.json(), fxRes.json(), invRes.json()])
      setAllPredictions(predData.data ?? [])
      setAllFixtures(fxData.data ?? [])
      setPendingInvites(invData.data ?? [])

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

  // Fetch comp ranks and member counts in parallel for all comps the user belongs to
  useEffect(() => {
    if (!session || !tournsComps.length) return
    const tid = selectedTournId ? `&tournament_id=${selectedTournId}` : ''
    Promise.all(
      tournsComps.map(c =>
        fetch(`/api/leaderboard?scope=comp&comp_id=${c.id}&no_breakdown=true${tid}`)
          .then(r => r.json())
          .then(d => ({ id: c.id, rank: (d.my_entry?.rank ?? null) as number | null, size: (d.data?.length ?? 0) as number }))
          .catch(() => ({ id: c.id, rank: null as number | null, size: 0 }))
      )
    ).then(results => {
      const rankMap: Record<string, number | null> = {}
      const sizeMap: Record<string, number> = {}
      results.forEach(({ id, rank, size }) => { rankMap[id] = rank; sizeMap[id] = size })
      setCompRanks(rankMap)
      setCompSizes(sizeMap)
    })
  }, [session, tournsComps, selectedTournId])

  // Refresh tribe status when the tab regains focus (user returns after joining a tribe)
  useEffect(() => {
    if (!session) return
    window.addEventListener('focus', refreshHasTribe)
    return () => window.removeEventListener('focus', refreshHasTribe)
  }, [session, refreshHasTribe])

  const joinPendingInvite = async (inv: { comp_id: string; invite_code: string; invitation_id: string; comp_name: string; comp_logo_url: string | null }) => {
    setJoiningInvite(inv.invitation_id)
    try {
      const { success, error } = await fetch('/api/comp-admins/self-register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comp_id: inv.comp_id, invite_code: inv.invite_code }),
      }).then(r => r.json())
      if (!success) { alert(error ?? 'Failed to join comp'); return }
      // Remove from pending list and select the newly joined comp
      setPendingInvites(prev => prev.filter(i => i.invitation_id !== inv.invitation_id))
      await pickComp({ id: inv.comp_id, name: inv.comp_name, logo_url: inv.comp_logo_url } as any)
      await refreshComps(inv.comp_id)
    } finally {
      setJoiningInvite(null)
    }
  }

  const declineInvite = async (inv: any, block: boolean) => {
    setDecliningBusy(true)
    try {
      await fetch('/api/comp-invitations/pending', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitation_id: inv.invitation_id, block }),
      })
      setPendingInvites(prev => prev.filter(i => i.invitation_id !== inv.invitation_id))
      setDecliningId(null)
      setBlockFuture(false)
    } finally {
      setDecliningBusy(false)
    }
  }

  const NavCard = ({ href, icon, title, description }: {
    href: string; icon: string; title: string; description: string
  }) => (
    <Link href={href} className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm transition-all group">
      <span className="text-xl flex-shrink-0">{icon}</span>
      <div>
        <p className="text-sm font-semibold text-gray-800 group-hover:text-gray-900">{title}</p>
        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
      </div>
    </Link>
  )

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <CountdownBanner />

      {/* ── Not logged in hero ── */}
      {!session && (
        <div style={{
          background: 'linear-gradient(160deg, #061a0e 0%, #0d3320 45%, #0a2e1c 100%)',
          borderRadius: 24, marginBottom: 16, textAlign: 'center',
          boxShadow: '0 16px 48px rgba(0,0,0,0.28)', position: 'relative', overflow: 'hidden',
        }}>
          {/* Diagonal texture */}
          <div style={{
            position: 'absolute', inset: 0, opacity: 0.035,
            backgroundImage: 'repeating-linear-gradient(45deg,#fff 0,#fff 1px,transparent 0,transparent 50%)',
            backgroundSize: '10px 10px',
          }} />
          {/* Glow behind logo */}
          <div style={{
            position: 'absolute', top: 24, left: '50%', transform: 'translateX(-50%)',
            width: 200, height: 200, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(74,222,128,0.15) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          <div style={{ position: 'relative', padding: '36px 24px 32px' }}>
            {/* Logo */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="TribePicks"
              style={{ width: 88, height: 88, margin: '0 auto 16px', display: 'block', borderRadius: 22,
                filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.5))',
                boxShadow: '0 0 40px rgba(74,222,128,0.18)' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />

            {/* Tournament badge */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.28)',
              borderRadius: 20, padding: '4px 12px', marginBottom: 14 }}>
              <span style={{ fontSize: 12 }}>⚽</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', letterSpacing: '0.3px' }}>FIFA WORLD CUP 2026</span>
            </div>

            <h1 style={{ margin: '0 0 10px', fontSize: 36, fontWeight: 900, color: '#fff',
              letterSpacing: '-0.8px', lineHeight: 1.05 }}>
              TribePicks
            </h1>
            <p style={{ margin: '0 0 28px', fontSize: 15, color: 'rgba(255,255,255,0.58)',
              lineHeight: 1.5, maxWidth: 300, marginLeft: 'auto', marginRight: 'auto' }}>
              Predict every match. Compete with friends. Rise to the top.
            </p>

            {/* Primary CTAs */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 28 }}>
              <Link href="/login?tab=register" style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '12px 24px', borderRadius: 12, fontSize: 14, fontWeight: 700,
                background: '#16a34a', color: '#fff', textDecoration: 'none',
                boxShadow: '0 4px 14px rgba(22,163,74,0.45)',
              }}>
                Join free →
              </Link>
              <Link href="/login" style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '12px 20px', borderRadius: 12, fontSize: 14, fontWeight: 600,
                background: 'rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.82)',
                border: '1px solid rgba(255,255,255,0.18)', textDecoration: 'none',
              }}>
                Sign in
              </Link>
            </div>

            {/* Feature chips */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              {[
                { icon: '🎯', label: 'Predict every match' },
                { icon: '🏆', label: 'Compete in your comp' },
                { icon: '👥', label: 'Chat with your tribe' },
              ].map(f => (
                <div key={f.label} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 20, padding: '5px 11px',
                }}>
                  <span style={{ fontSize: 12 }}>{f.icon}</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>{f.label}</span>
                </div>
              ))}
            </div>
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
            <div className="rounded-2xl overflow-hidden mb-4 shadow-lg">
              {/* Header band */}
              <div style={{
                background: 'linear-gradient(160deg, #0a2e1c 0%, #153d26 50%, #0d3320 100%)',
                padding: '20px 20px 16px', position: 'relative', overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', inset: 0, opacity: 0.04, backgroundImage: 'repeating-linear-gradient(45deg,#fff 0,#fff 1px,transparent 0,transparent 50%)', backgroundSize: '12px 12px' }} />
                <div style={{ position: 'relative' }}>
                  <p style={{ margin: '0 0 2px', fontSize: 19, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px' }}>
                    Welcome, {displayName ?? 'there'}! 👋
                  </p>
                  <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.4 }}>
                    One quick step before you start tipping.
                  </p>
                </div>
              </div>

              {/* Step list on white background */}
              <div className="bg-white border border-t-0 border-gray-200 rounded-b-2xl divide-y divide-gray-100">

                {/* Step 1 — done */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">✓</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-700">Verified your account</p>
                  </div>
                  <span className="text-[11px] font-semibold text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">Done</span>
                </div>

                {/* Step 2 — active */}
                <div className="px-4 py-4">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">2</span>
                    <p className="text-sm font-semibold text-gray-900">Join or create a comp</p>
                    <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full ml-auto">Now</span>
                  </div>

                  {/* Pending invitations — one-tap join */}
                  {pendingInvites.length > 0 && (
                    <div className="mb-3 space-y-2">
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">You've been invited to</p>
                      {pendingInvites.map((inv: any) => (
                        <div key={inv.invitation_id} className="rounded-xl border-2 border-green-300 bg-green-50 overflow-hidden">
                          {decliningId === inv.invitation_id ? (
                            <div className="p-3 space-y-2.5">
                              <p className="text-xs font-semibold text-gray-800">Decline <span className="text-green-700">{inv.comp_name}</span>?</p>
                              <label className="flex items-start gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={blockFuture}
                                  onChange={e => setBlockFuture(e.target.checked)}
                                  className="mt-0.5 accent-red-500 flex-shrink-0"
                                />
                                <span className="text-xs text-gray-600">Don't show future invites from this comp</span>
                              </label>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => declineInvite(inv, blockFuture)}
                                  disabled={decliningBusy}
                                  className="flex-1 py-1.5 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-60 rounded-lg transition-colors flex items-center justify-center gap-1"
                                >
                                  {decliningBusy ? <Spinner className="w-3 h-3 text-white" /> : 'Remove'}
                                </button>
                                <button
                                  onClick={() => { setDecliningId(null); setBlockFuture(false) }}
                                  disabled={decliningBusy}
                                  className="flex-1 py-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-60 rounded-lg transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 p-3">
                              {inv.comp_logo_url
                                ? <img src={inv.comp_logo_url} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0 border border-green-200" />
                                : <span className="text-xl flex-shrink-0">🏆</span>
                              }
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-green-900 truncate">{inv.comp_name}</p>
                                <p className="text-[11px] text-green-700">Tap to join — no code needed</p>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <button
                                  onClick={() => joinPendingInvite(inv)}
                                  disabled={joiningInvite === inv.invitation_id}
                                  className="px-2.5 py-1 text-xs font-bold text-green-700 bg-green-100 hover:bg-green-200 disabled:opacity-60 rounded-lg transition-colors flex items-center gap-1"
                                >
                                  {joiningInvite === inv.invitation_id ? <Spinner className="w-3 h-3 text-green-600" /> : 'Join →'}
                                </button>
                                <button
                                  onClick={() => { setDecliningId(inv.invitation_id); setBlockFuture(false) }}
                                  disabled={!!joiningInvite}
                                  className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-white rounded-md transition-colors disabled:opacity-40 text-xs"
                                  title="Decline invitation"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      <div className="flex items-center gap-2 pt-1">
                        <div className="flex-1 h-px bg-gray-100" />
                        <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">or</span>
                        <div className="flex-1 h-px bg-gray-100" />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setModal('join')}
                      className="flex flex-col items-center gap-1.5 py-4 px-3 rounded-xl border-2 border-gray-200 hover:border-green-400 hover:bg-green-50 transition-all text-center group">
                      <span className="text-2xl">🔑</span>
                      <p className="text-xs font-bold text-gray-800 group-hover:text-green-700">Join a comp</p>
                      <p className="text-[10px] text-gray-400">Have an invite code</p>
                    </button>
                    <button onClick={() => setModal('create')}
                      className="flex flex-col items-center gap-1.5 py-4 px-3 rounded-xl border-2 border-emerald-400 bg-emerald-50 hover:bg-emerald-100 transition-all text-center">
                      <span className="text-2xl">🏆</span>
                      <p className="text-xs font-bold text-emerald-700">Create a comp</p>
                      <p className="text-[10px] text-emerald-500">For my group</p>
                    </button>
                  </div>
                </div>

                {/* Step 3 — locked */}
                <div className="px-4 py-3">
                  <div className="flex items-center gap-3 opacity-40">
                    <span className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 text-gray-500 text-xs font-bold">3</span>
                    <p className="text-sm font-semibold text-gray-500">Join a tribe</p>
                    <span className="text-[11px] text-gray-400 ml-auto">Unlocks next</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTribeInfoOpen(v => !v)}
                    className="mt-1.5 flex items-center gap-1 text-[11px] text-green-600 font-medium hover:text-green-700">
                    <span className="w-3.5 h-3.5 rounded-full border border-green-500 inline-flex items-center justify-center text-[9px] font-bold leading-none flex-shrink-0">i</span>
                    What is a tribe?
                  </button>
                  {tribeInfoOpen && (
                    <p className="mt-1.5 text-[12px] text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2 leading-relaxed">
                      A Tribe is a small group within your comp. Join or create one to get a private chat and a mini-leaderboard with your friends.
                    </p>
                  )}
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

              {/* Compact progress nudge — shown until tribe joined (tipsters) or comp set up (admins) */}
              {!step3Done && (
                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-amber-800 mb-1">Almost there!</p>
                    <div className="flex items-center gap-1.5 text-xs flex-wrap">
                      <span className="text-green-600 font-medium">✅ TribePicks</span>
                      <span className="text-gray-300">·</span>
                      <span className="text-green-600 font-medium">✅ Comp</span>
                      <span className="text-gray-300">·</span>
                      {isCompAdmin ? (
                        <span className="text-amber-700 font-medium">○ Comp Setup</span>
                      ) : (
                        <span className="flex items-center gap-1 text-amber-700 font-medium">
                          ○ Tribe
                          <button
                            type="button"
                            onClick={() => setTribeInfoOpen(v => !v)}
                            className="w-3.5 h-3.5 rounded-full border border-amber-400 inline-flex items-center justify-center text-[9px] font-bold leading-none text-amber-500 hover:border-amber-600 hover:text-amber-700 flex-shrink-0">
                            i
                          </button>
                        </span>
                      )}
                    </div>
                    {tribeInfoOpen && !isCompAdmin && (
                      <p className="mt-2 text-[11px] text-green-800 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1.5 leading-relaxed">
                        A Tribe is a small group within your comp. Join or create one to get a private chat and a mini-leaderboard with your friends.
                      </p>
                    )}
                  </div>
                  {isCompAdmin ? (
                    <Link href="/comp-admin"
                      className="flex-shrink-0 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap">
                      Set up your comp →
                    </Link>
                  ) : (
                    <Link href="/tribe"
                      className="flex-shrink-0 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap">
                      Find a tribe →
                    </Link>
                  )}
                </div>
              )}

              {/* Fresh comp prompt — shown to comp admin when no other tipsters have joined */}
              {isCompAdmin && step3Done && selectedCompId && (compSizes[selectedCompId] ?? 2) <= 1 && (
                <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-blue-800 mb-0.5">Your comp is ready!</p>
                    <p className="text-xs text-blue-600">Invite tipsters to join and compete.</p>
                  </div>
                  <Link href="/comp-admin"
                    className="flex-shrink-0 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap">
                    Manage comp →
                  </Link>
                </div>
              )}

              {/* Pending invitations from other comps */}
              {pendingInvites.length > 0 && (
                <div className="mb-3 rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-100">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Comp Invitations</p>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {pendingInvites.map((inv: any) => (
                      <div key={inv.invitation_id}>
                        {decliningId === inv.invitation_id ? (
                          <div className="p-3 space-y-2.5 bg-red-50">
                            <p className="text-xs font-semibold text-gray-800">Decline <span className="text-red-700">{inv.comp_name}</span>?</p>
                            <label className="flex items-start gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={blockFuture}
                                onChange={e => setBlockFuture(e.target.checked)}
                                className="mt-0.5 accent-red-500 flex-shrink-0"
                              />
                              <span className="text-xs text-gray-600">Don't show future invites from this comp</span>
                            </label>
                            <div className="flex gap-2">
                              <button
                                onClick={() => declineInvite(inv, blockFuture)}
                                disabled={decliningBusy}
                                className="flex-1 py-1.5 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-60 rounded-lg transition-colors flex items-center justify-center gap-1"
                              >
                                {decliningBusy ? <Spinner className="w-3 h-3 text-white" /> : 'Remove'}
                              </button>
                              <button
                                onClick={() => { setDecliningId(null); setBlockFuture(false) }}
                                disabled={decliningBusy}
                                className="flex-1 py-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-60 rounded-lg transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 px-3 py-2.5">
                            {inv.comp_logo_url
                              ? <img src={inv.comp_logo_url} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0 border border-gray-200" />
                              : <span className="text-lg flex-shrink-0">🏆</span>
                            }
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-800 truncate">{inv.comp_name}</p>
                              <p className="text-[11px] text-gray-400">You've been invited to join</p>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <button
                                onClick={() => joinPendingInvite(inv)}
                                disabled={joiningInvite === inv.invitation_id}
                                className="px-2.5 py-1 text-xs font-bold text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 disabled:opacity-60 rounded-lg transition-colors flex items-center gap-1"
                              >
                                {joiningInvite === inv.invitation_id ? <Spinner className="w-3 h-3 text-green-600" /> : 'Join →'}
                              </button>
                              <button
                                onClick={() => { setDecliningId(inv.invitation_id); setBlockFuture(false) }}
                                disabled={!!joiningInvite}
                                className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-40 text-xs"
                                title="Decline invitation"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
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
                              {t.logo_url
                                ? <img src={t.logo_url} alt="" className="w-3.5 h-3.5 rounded object-cover flex-shrink-0" />
                                : <span>⚽</span>}
                              {t.name}
                            </button>
                          )
                        })}
                      </div>
                    )}
                    {activeTournaments.length === 1 && selectedTourn && (
                      <p className="text-xs text-gray-400 mb-0.5 flex items-center gap-1.5">
                        {selectedTourn.logo_url
                          ? <img src={selectedTourn.logo_url} alt="" className="w-3.5 h-3.5 rounded object-cover flex-shrink-0" />
                          : <span>⚽</span>}
                        {selectedTourn.name}
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

              {/* Prediction CTA — shown when the round is open and tips are incomplete */}
              {currentRoundCode && fixtureCount > 0 && predCount < fixtureCount && (
                <Link href="/predict" className="block mb-3 rounded-xl border-2 border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 p-4 hover:border-green-300 hover:shadow-sm transition-all group">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-green-800">
                        {fixtureCount - predCount} tip{fixtureCount - predCount !== 1 ? 's' : ''} to submit
                      </p>
                      {deadlineLabel && (
                        <p className={`text-xs mt-0.5 ${
                          urgencyLevel === 'red'    ? 'text-red-600'    :
                          urgencyLevel === 'orange' ? 'text-orange-500' :
                          urgencyLevel === 'amber'  ? 'text-amber-600'  :
                          'text-green-600'
                        }`}>{deadlineLabel}</p>
                      )}
                    </div>
                    <span className="flex-shrink-0 px-3 py-2 bg-green-600 text-white text-sm font-bold rounded-lg group-hover:bg-green-700 transition-colors">
                      Tip now →
                    </span>
                  </div>
                  <div className="mt-3 h-1.5 bg-green-100 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${Math.round((predCount / fixtureCount) * 100)}%` }} />
                  </div>
                  <p className="text-[10px] text-green-600 mt-1">{Math.round((predCount / fixtureCount) * 100)}% complete</p>
                </Link>
              )}

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

      {/* ── Utility links — logged-out only ─────────────────────── */}
      {!session && (
        <div className="grid grid-cols-2 gap-2.5 mb-6">
          <NavCard href="/leaderboard" icon="🏆" title="ScoreBoard"  description="See the current standings" />
          <NavCard href="/rules"       icon="📖" title="How to play" description="Scoring rules & guide" />
        </div>
      )}

      {/* Comp modal */}
      {modal && (
        <CompModal
          mode={modal}
          tournamentId={selectedTournId}
          tournament={selectedTourn}
          onClose={() => setModal(null)}
          onSuccess={async (comp) => {
            setModal(null)
            await pickComp(comp as any)
            await refreshComps(comp.id)
          }}
          onManageComp={async (comp) => {
            setModal(null)
            await pickComp(comp as any)
            await refreshComps(comp.id)
            router.push('/comp-admin')
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
            <div className="flex items-center gap-2 mb-3">
              {t?.logo_url
                ? <img src={t.logo_url} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0" />
                : <span className="text-sm">⚽</span>}
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {t?.name ?? 'Tournament'}
              </p>
            </div>
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
