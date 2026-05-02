'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import confetti from 'canvas-confetti'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { CountdownBanner } from '@/components/game/CountdownBanner'
import { Spinner } from '@/components/ui'
import { useUserPrefs, type Tournament } from '@/components/layout/UserPrefsContext'

const SAMPLE_LEADERS = [
  { name: 'Ash 🇦🇺', pts: 187 },
  { name: 'Marco 🇧🇷', pts: 174 },
  { name: 'Priya 🇮🇳', pts: 162 },
]

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

  const lookupCode = async (codeOverride?: string) => {
    const c = codeOverride ?? code
    if (c.length < 6) return
    setLookingUp(true); setCodeErr(null); setPreview(null)
    try {
      const { data, error } = await fetch(`/api/comps?code=${c}`).then(r => r.json())
      if (error || !data) { setCodeErr('Code not found — check with your Comp Manager'); return }
      if (tournamentId && data.tournament_id && data.tournament_id !== tournamentId)
        { setCodeErr('This comp belongs to a different tournament'); return }
      setPreview(data)
    } catch { setCodeErr('Something went wrong') }
    finally { setLookingUp(false) }
  }

  useEffect(() => {
    if (code.length === 8 && !lookingUp) lookupCode(code)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

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
    const res = await fetch('/api/comps/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: compName.trim(), owner_name: '',
        user_id: session.user.id, email: session.user.email,
        tournament_id: tournamentId,
      }),
    })
    const { data: comp, error: err } = await res.json()
    setLoading(false)
    if (res.status === 409) { setError('A comp with this name already exists — try a different name'); return }
    if (err || !comp) { setError(err ?? 'Failed to create comp'); return }
    setCreatedComp({ id: comp.id, name: comp.name, invite_code: comp.invite_code })
    setStep('created')
  }

  const content = (
    <div
      onClick={e => { if (e.target === e.currentTarget) { if (createdComp) onSuccess({ id: createdComp.id, name: createdComp.name }); else onClose() } }}
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
          <button onClick={() => { if (createdComp) onSuccess({ id: createdComp.id, name: createdComp.name }); else onClose() }}
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
                  <button type="button" onClick={() => lookupCode()}
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

  const nextRoundInfo = useMemo(() => {
    if (currentRoundCode) return null  // a round is already open
    const now = Date.now()
    const roundFirstKickoff: Record<string, number> = {}
    allFixtures.forEach(f => {
      const t = new Date(f.kickoff_utc).getTime()
      if (t > now) {
        if (!roundFirstKickoff[f.round] || t < roundFirstKickoff[f.round])
          roundFirstKickoff[f.round] = t
      }
    })
    const entries = Object.entries(roundFirstKickoff).sort(([, a], [, b]) => a - b)
    if (!entries.length) return null
    const [roundCode, kickoff] = entries[0]
    const roundName = (scoringConfig.rounds as any)[roundCode]?.round_name ?? roundCode
    return { roundCode, roundName, kickoff }
  }, [currentRoundCode, allFixtures, scoringConfig])

  const [tribeInfoOpen,  setTribeInfoOpen]  = useState(false)
  const [compRanks,      setCompRanks]      = useState<Record<string, number | null>>({})
  const [compSizes,      setCompSizes]      = useState<Record<string, number>>({})
  const [pendingInvites, setPendingInvites] = useState<any[]>([])
  const [joiningInvite,  setJoiningInvite]  = useState<string | null>(null)
  const [decliningId,    setDecliningId]    = useState<string | null>(null)
  const [blockFuture,    setBlockFuture]    = useState(false)
  const [showAllSet,     setShowAllSet]     = useState(false)
  const [heroStats,      setHeroStats]      = useState<{ tipster_count: number } | null>(null)
  const step3WasRef = useRef<boolean | null>(null)
  const [decliningBusy,    setDecliningBusy]    = useState(false)
  const [challengeToast,   setChallengeToast]   = useState<string | null>(null)
  const [cameFromChallenge, setCameFromChallenge] = useState(false)
  const [joiningWarmUp,    setJoiningWarmUp]    = useState(false)
  const [warmUpError,      setWarmUpError]      = useState<string | null>(null)
  const [confirmAction,    setConfirmAction]    = useState<{ compId: string; action: 'leave' | 'delete'; name: string } | null>(null)
  const [compActionBusy,   setCompActionBusy]   = useState(false)
  const [teamsList,        setTeamsList]        = useState<{ name: string; flag_emoji?: string }[]>([])
  const [favouriteTeam,    setFavouriteTeam]    = useState<string | null>(null)
  const [savingFav,        setSavingFav]        = useState(false)
  const [persona,          setPersona]          = useState<'tipster' | 'organiser'>('tipster')
  const [compWelcome,      setCompWelcome]      = useState<string | null>(null)
  const [editingName,      setEditingName]      = useState(false)
  const [nameInput,        setNameInput]        = useState('')
  const [nameError,        setNameError]        = useState<string | null>(null)
  const [nameSaving,       setNameSaving]       = useState(false)

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

  // Fetch public tipster count for the logged-out hero
  useEffect(() => {
    if (session) return
    fetch('/api/stats').then(r => r.json()).then(d => setHeroStats(d)).catch(() => {})
  }, [session])

  // Hydrate challenge picks from localStorage after login/signup
  useEffect(() => {
    if (!session) return
    const raw = localStorage.getItem('tribepicks_challenge_picks')
    if (!raw) return
    try {
      const picks: { fixtureId: number; outcome: string }[] = JSON.parse(raw)
      const real = picks.filter(p => p.fixtureId > 0)
      if (!real.length) { localStorage.removeItem('tribepicks_challenge_picks'); return }
      fetch('/api/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ predictions: real.map(p => ({ fixture_id: p.fixtureId, outcome: p.outcome })) }),
      })
        .then(r => r.json())
        .then(d => {
          if (!d.error) {
            setChallengeToast(`⚽ ${real.length} warm-up pick${real.length > 1 ? 's' : ''} saved to the competition!`)
          }
        })
        .catch(() => {})
        .finally(() => {
          localStorage.removeItem('tribepicks_challenge_picks')
        })
    } catch {
      localStorage.removeItem('tribepicks_challenge_picks')
    }
  }, [session])

  // Read + clear challenge source flag on mount so it survives into the You're all set card
  useEffect(() => {
    if (localStorage.getItem('tribepicks_challenge_source')) {
      setCameFromChallenge(true)
      localStorage.removeItem('tribepicks_challenge_source')
    }
  }, [])

  // Load teams list + current favourite team for the bonus team picker
  useEffect(() => {
    if (!session || !selectedTournId) return
    Promise.all([
      fetch(`/api/tournament-teams?tournament_id=${selectedTournId}`),
      fetch('/api/user-tournaments'),
    ]).then(async ([teamsRes, utRes]) => {
      const teamsData = await teamsRes.json().catch(() => ({}))
      setTeamsList(teamsData.teams ?? [])
      const utData = await utRes.json().catch(() => ({}))
      const myEnrol = (utData.data ?? []).find((ut: any) => ut.tournament_id === selectedTournId)
      setFavouriteTeam(myEnrol?.favourite_team ?? null)
    }).catch(() => {})
  }, [session, selectedTournId])

  // Fire "You're all set" celebration once when tribe step completes
  useEffect(() => {
    if (contextLoading || loading || !session) return
    if (step3WasRef.current === null) {
      // First stable read — record baseline without celebrating
      step3WasRef.current = step3Done
      return
    }
    if (step3Done && !step3WasRef.current && step2Done) {
      const key = `allset_${session.user.id}`
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, '1')
        setShowAllSet(true)
        setTimeout(() => confetti({
          particleCount: 180, spread: 100, origin: { y: 0.45 },
          colors: ['#22c55e', '#16a34a', '#fbbf24', '#f59e0b', '#ffffff'],
        }), 150)
      }
    }
    step3WasRef.current = step3Done
  }, [step3Done, step2Done, contextLoading, loading, session])

  const joinPendingInvite = async (inv: { comp_id: string; invite_code: string; invitation_id: string; comp_name: string; comp_logo_url: string | null }) => {
    setJoiningInvite(inv.invitation_id)
    try {
      const { success, error } = await fetch('/api/comp-admins/self-register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comp_id: inv.comp_id, invite_code: inv.invite_code }),
      }).then(r => r.json())
      if (!success) { alert(error ?? 'Failed to join comp'); return }
      setPendingInvites(prev => prev.filter(i => i.invitation_id !== inv.invitation_id))
      await pickComp({ id: inv.comp_id, name: inv.comp_name, logo_url: inv.comp_logo_url } as any)
      await refreshComps(inv.comp_id)
      setCompWelcome(inv.comp_name)
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

  const saveFavTeam = async (team: string) => {
    if (!selectedTournId) return
    setSavingFav(true)
    setFavouriteTeam(team || null)
    await fetch('/api/user-tournaments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournament_id: selectedTournId, favourite_team: team || null }),
    }).catch(() => {})
    setSavingFav(false)
  }

  const saveDisplayName = async () => {
    const trimmed = nameInput.trim()
    if (trimmed.length < 2 || trimmed.length > 30) {
      setNameError('Name must be 2–30 characters')
      return
    }
    setNameSaving(true); setNameError(null)
    const res = await fetch('/api/users/display-name', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: trimmed, comp_id: selectedCompId }),
    }).then(r => r.json()).catch(() => ({ error: 'Network error' }))
    setNameSaving(false)
    if (res.error) { setNameError(res.error); return }
    setDisplayName(trimmed)
    setEditingName(false)
  }

  const joinWarmUpComp = async () => {
    setJoiningWarmUp(true); setWarmUpError(null)
    try {
      const { data: comp, error: cErr } = await fetch('/api/comps?code=WCEH3GB9').then(r => r.json())
      if (cErr || !comp) { setWarmUpError('Warm-Up Comp not available — please try again'); return }
      const { success, error: jErr } = await fetch('/api/comp-admins/self-register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comp_id: comp.id, invite_code: 'WCEH3GB9' }),
      }).then(r => r.json())
      if (!success) { setWarmUpError(jErr ?? 'Failed to join — please try again'); return }
      // Auto-join the warm-up tribe (comp membership now established); 409 = already a member, ignore
      const tribeRes = await fetch('/api/tribes', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_code: 'VZ3JEZRA' }),
      })
      if (!tribeRes.ok && tribeRes.status !== 409) {
        const { error: tErr } = await tribeRes.json().catch(() => ({}))
        setWarmUpError(tErr ?? 'Joined comp but failed to join tribe')
        return
      }
      await pickComp({ id: comp.id, name: comp.name, logo_url: comp.logo_url ?? null } as any)
      await refreshComps(comp.id)
      await refreshHasTribe()
      setCompWelcome(comp.name)
    } catch {
      setWarmUpError('Something went wrong — please try again')
    } finally {
      setJoiningWarmUp(false)
    }
  }

  const handleCompAction = async () => {
    if (!confirmAction) return
    setCompActionBusy(true)
    try {
      if (confirmAction.action === 'leave') {
        const { success, error } = await fetch('/api/comp-members/leave', {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comp_id: confirmAction.compId }),
        }).then(r => r.json())
        if (!success) { alert(error ?? 'Failed to leave comp'); return }
      } else {
        const { success, error } = await fetch('/api/comps/create', {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comp_id: confirmAction.compId }),
        }).then(r => r.json())
        if (!success) { alert(error ?? 'Failed to delete comp'); return }
      }
      setConfirmAction(null)
      await refreshComps()
    } finally {
      setCompActionBusy(false)
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

      {/* Challenge picks hydration toast — persistent until dismissed */}
      {challengeToast && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-green-50 border border-green-200 flex items-center gap-2">
          <span className="flex-1 text-sm text-green-800 font-medium">{challengeToast}</span>
          <Link href="/predict?round=wup"
            className="text-xs font-bold text-green-700 underline underline-offset-2 whitespace-nowrap flex-shrink-0">
            View picks →
          </Link>
          <button onClick={() => setChallengeToast(null)}
            className="text-green-400 hover:text-green-600 ml-1 flex-shrink-0 text-lg leading-none">
            ✕
          </button>
        </div>
      )}

      {/* ── Hero card (persona-aware) — logged-out only ─────────── */}
      {!session && (
        <>
        {/* Brand banner — sits above the dark card, always visible */}
        <div style={{ textAlign:'center', marginBottom:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, justifyContent:'center', marginBottom:3 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="TribePicks"
              style={{ width:42, height:42, borderRadius:11, flexShrink:0,
                filter:'drop-shadow(0 2px 6px rgba(0,0,0,0.18))' }}
              onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
            <h1 style={{ margin:0, fontSize:32, fontWeight:900, color:'#111827', letterSpacing:'-0.7px', lineHeight:1 }}>
              TribePicks
            </h1>
          </div>
          <p style={{ margin:0, fontSize:11, color:'#9ca3af', fontWeight:500, letterSpacing:'0.2px' }}>
            World Cup 2026 Tipping Competition
          </p>
        </div>

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
          {/* Ambient glow at top of card */}
          <div style={{
            position: 'absolute', top: -30, left: '50%', transform: 'translateX(-50%)',
            width: 260, height: 160, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(74,222,128,0.12) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          <div style={{ position:'relative', padding:'20px 20px 28px' }}>

            {/* Persona toggle */}
            <div style={{ display:'flex', justifyContent:'center', marginBottom:16 }}>
              <div style={{ display:'inline-flex', background:'rgba(255,255,255,0.10)', padding:4, borderRadius:16, gap:4 }}>
                {(['tipster', 'organiser'] as const).map(p => (
                  <button key={p} type="button" onClick={() => setPersona(p)} style={{
                    padding:'7px 16px', borderRadius:11, fontSize:13, fontWeight:700,
                    border:'none', cursor:'pointer', transition:'all 0.15s',
                    background: persona === p ? 'rgba(255,255,255,0.95)' : 'transparent',
                    color: persona === p ? '#166534' : 'rgba(255,255,255,0.60)',
                    boxShadow: persona === p ? '0 1px 6px rgba(0,0,0,0.18)' : 'none',
                  }}>
                    {p === 'tipster' ? '🎯 I\'m a Tipster' : '🏆 I run Tipping Comps'}
                  </button>
                ))}
              </div>
            </div>

            {/* Persona tagline */}
            <p style={{ margin:'0 0 18px', lineHeight:1.55, maxWidth:300, marginLeft:'auto', marginRight:'auto' }}>
              {persona === 'tipster' ? (<>
                <span style={{ display:'block', fontSize:16, fontWeight:800, color:'#fff', marginBottom:4 }}>Tip every match. Beat your tribe.</span>
                <span style={{ fontSize:12.5, color:'rgba(255,255,255,0.50)' }}>Join your group&apos;s private World Cup comp — free and instant.</span>
              </>) : (<>
                <span style={{ display:'block', fontSize:16, fontWeight:800, color:'#fff', marginBottom:4 }}>Run a comp your whole group will love.</span>
                <span style={{ fontSize:12.5, color:'rgba(255,255,255,0.50)' }}>Set up in 10 minutes. Free forever. Zero spreadsheets.</span>
              </>)}
            </p>

            {/* Challenge CTA — cartoon mascot + speech bubble — tipsters only */}
            {persona === 'tipster' && (
              <div style={{ marginBottom:14, maxWidth:330, marginLeft:'auto', marginRight:'auto' }}>
                <Link href="/su-challenge" style={{ display:'flex', alignItems:'flex-end', textDecoration:'none', gap:0 }}>

                  {/* Mascot column */}
                  <div style={{ flexShrink:0, width:76, display:'flex', justifyContent:'center', alignItems:'flex-end' }}>
                    <svg width="76" height="112" viewBox="0 0 76 112" fill="none" style={{ overflow:'visible' }}>
                      {/* CAP brim */}
                      <ellipse cx="36" cy="25" rx="19" ry="3.5" fill="#15803d"/>
                      {/* CAP dome */}
                      <path d="M17 25 Q17 11 36 11 Q55 11 55 25 Z" fill="#16a34a"/>
                      {/* Cap logo dot */}
                      <circle cx="36" cy="18" r="3" fill="#4ade80" opacity="0.85"/>
                      {/* FACE skin */}
                      <ellipse cx="36" cy="38" rx="15" ry="16" fill="#f4c896"/>
                      {/* Beard */}
                      <path d="M23 46 Q36 55 49 46 Q49 53 36 53 Q23 53 23 46Z" fill="#8B5E3C" opacity="0.3"/>
                      {/* Eyes */}
                      <circle cx="30" cy="34" r="2.8" fill="#1e293b"/>
                      <circle cx="42" cy="34" r="2.8" fill="#1e293b"/>
                      <circle cx="31" cy="32.8" r="1" fill="white"/>
                      <circle cx="43" cy="32.8" r="1" fill="white"/>
                      {/* Eyebrows */}
                      <path d="M26.5 29 Q30 26.5 33.5 28.5" stroke="#8B5E3C" strokeWidth="2" fill="none" strokeLinecap="round"/>
                      <path d="M38.5 28.5 Q42 26.5 45.5 29" stroke="#8B5E3C" strokeWidth="2" fill="none" strokeLinecap="round"/>
                      {/* Open smile + teeth */}
                      <path d="M28 44 Q36 51 44 44" stroke="#8B5E3C" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                      <path d="M29 45 Q36 50 43 45 Q43 49 36 49 Q29 49 29 45Z" fill="white" opacity="0.85"/>
                      {/* Neck */}
                      <rect x="32" y="52" width="8" height="6" rx="2" fill="#f4c896"/>
                      {/* T-SHIRT body */}
                      <path d="M20 60 L13 73 L25 77 L25 98 L47 98 L47 77 L59 73 L52 60 Q44 56 36 56 Q28 56 20 60Z" fill="#1e293b"/>
                      {/* TribePicks logo ring on shirt */}
                      <circle cx="36" cy="79" r="7.5" stroke="#4ade80" strokeWidth="2.2" fill="none"/>
                      <circle cx="36" cy="79" r="3" fill="#4ade80" opacity="0.65"/>
                      {/* LEFT ARM — thumbs up */}
                      <path d="M20 64 L9 78" stroke="#1e293b" strokeWidth="9" strokeLinecap="round"/>
                      <path d="M9 78 L7 92" stroke="#f4c896" strokeWidth="8" strokeLinecap="round"/>
                      <ellipse cx="7" cy="96" rx="7" ry="6" fill="#f4c896"/>
                      {/* Thumb pointing UP */}
                      <path d="M3 92 L0 80" stroke="#f4c896" strokeWidth="5" strokeLinecap="round"/>
                      {/* RIGHT ARM — pointing toward bubble */}
                      <path d="M52 64 L67 70" stroke="#1e293b" strokeWidth="9" strokeLinecap="round"/>
                      <path d="M67 70 L84 65" stroke="#f4c896" strokeWidth="8" strokeLinecap="round"/>
                      <ellipse cx="87" cy="64" rx="7" ry="5.5" fill="#f4c896"/>
                      {/* Index finger pointing right */}
                      <path d="M91 58 L97 56" stroke="#f4c896" strokeWidth="4.5" strokeLinecap="round"/>
                      {/* Legs */}
                      <path d="M28 98 L24 112" stroke="#374151" strokeWidth="8" strokeLinecap="round"/>
                      <path d="M44 98 L48 112" stroke="#374151" strokeWidth="8" strokeLinecap="round"/>
                    </svg>
                  </div>

                  {/* Speech bubble */}
                  <div style={{
                    flex:1, background:'rgba(255,255,255,0.97)',
                    borderRadius:'18px 18px 18px 6px',
                    padding:'12px 14px 12px 14px',
                    position:'relative', marginLeft:4, marginBottom:6,
                    boxShadow:'0 4px 20px rgba(0,0,0,0.22)',
                  }}>
                    {/* Tail pointing left toward character */}
                    <div style={{
                      position:'absolute', left:-9, bottom:20,
                      width:0, height:0,
                      borderTop:'9px solid transparent',
                      borderBottom:'9px solid transparent',
                      borderRight:'9px solid rgba(255,255,255,0.97)',
                    }}/>
                    {/* Bubble content */}
                    <p style={{ margin:'0 0 1px', fontSize:10, fontWeight:800, color:'#16a34a', textTransform:'uppercase', letterSpacing:'0.6px' }}>Ready for a</p>
                    <p style={{ margin:'0 0 6px', fontSize:16, fontWeight:900, color:'#111827', lineHeight:1.2, letterSpacing:'-0.3px' }}>4-Pick Challenge?</p>
                    {/* Icon row */}
                    <div style={{ display:'flex', gap:4, marginBottom:9, alignItems:'center' }}>
                      {['⚽','⚽','⚽','⚽','🏆'].map((e, i) => (
                        <span key={i} style={{ fontSize:17, lineHeight:1 }}>{e}</span>
                      ))}
                    </div>
                    {/* CTA button */}
                    <div style={{
                      background:'#16a34a', color:'#fff',
                      borderRadius:9, padding:'7px 0',
                      fontSize:12, fontWeight:800, textAlign:'center',
                      letterSpacing:'0.2px',
                      boxShadow:'0 2px 8px rgba(22,163,74,0.4)',
                    }}>
                      Take the Challenge! →
                    </div>
                  </div>

                </Link>
              </div>
            )}

            {/* Primary CTAs */}
            <div style={{ display:'flex', gap:10, justifyContent:'center', marginBottom:18 }}>
              <Link href={persona === 'organiser' ? '/login?tab=register&role=organiser' : '/login?tab=register'} style={{
                display:'inline-flex', alignItems:'center', gap:6,
                padding:'11px 22px', borderRadius:12, fontSize:14, fontWeight:700,
                background:'#16a34a', color:'#fff', textDecoration:'none',
                boxShadow:'0 4px 14px rgba(22,163,74,0.45)',
              }}>
                {persona === 'organiser' ? 'Create a comp free →' : 'Join free →'}
              </Link>
              <Link href="/login" style={{
                display:'inline-flex', alignItems:'center',
                padding:'11px 20px', borderRadius:12, fontSize:14, fontWeight:600,
                background:'rgba(255,255,255,0.09)', color:'rgba(255,255,255,0.82)',
                border:'1px solid rgba(255,255,255,0.18)', textDecoration:'none',
              }}>Sign in</Link>
            </div>

            {/* Benefit list */}
            <div style={{ textAlign:'left', marginBottom:20 }}>
              <p style={{ margin:'0 0 10px', fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.35)', textTransform:'uppercase', letterSpacing:'0.8px' }}>
                {persona === 'tipster' ? 'What you get' : "What's included"}
              </p>
              <ul style={{ listStyle:'none', padding:0, margin:0, display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px 12px' }}>
                {(persona === 'tipster' ? [
                  'Tip once — all your comps covered',
                  'Bonus Team — 2× pts on their matches',
                  'Penalty winner bonus in knockouts',
                  "See everyone's picks after deadline",
                  'Tribe chatroom with your group',
                  'Exact score bonus from the semis',
                ] : [
                  'Set up in 10 minutes — always free',
                  'Invite by link — one tap to join',
                  'Auto-scoring, no manual work',
                  'Divide tipsters into rival Tribes',
                  'Track entry fees without spreadsheets',
                  'Automated reminders to tipsters',
                ]).map(item => (
                  <li key={item} style={{ display:'flex', alignItems:'flex-start', gap:5, fontSize:11, color:'rgba(255,255,255,0.65)', lineHeight:1.4 }}>
                    <span style={{ color:'#4ade80', flexShrink:0, fontWeight:700, marginTop:1 }}>✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Social proof */}
            {heroStats && heroStats.tipster_count > 0 && (
              <div style={{ borderTop:'1px solid rgba(255,255,255,0.1)', paddingTop:20 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:7, marginBottom: persona === 'tipster' ? 16 : 0 }}>
                  <span style={{ width:7, height:7, borderRadius:'50%', background:'#4ade80', flexShrink:0, boxShadow:'0 0 0 3px rgba(74,222,128,0.25)' }} />
                  <span style={{ fontSize:13, color:'rgba(255,255,255,0.65)', fontWeight:500 }}>
                    <strong style={{ color:'#4ade80', fontWeight:800 }}>{heroStats.tipster_count.toLocaleString()}</strong>{' '}tipsters already registered
                  </span>
                </div>
                {persona === 'tipster' && (
                  <div style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:14, overflow:'hidden', maxWidth:290, margin:'0 auto' }}>
                    <div style={{ padding:'7px 14px', borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
                      <span style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.35)', textTransform:'uppercase', letterSpacing:'0.6px' }}>🏆 Global leaderboard</span>
                    </div>
                    {SAMPLE_LEADERS.map((u, i) => (
                      <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px',
                        borderBottom: i < SAMPLE_LEADERS.length-1 ? '1px solid rgba(255,255,255,0.05)' : undefined }}>
                        <span style={{ fontSize:11, fontWeight:800, width:18, flexShrink:0,
                          color: i===0 ? '#fbbf24' : i===1 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.35)' }}>#{i+1}</span>
                        <span style={{ fontSize:13, color:'rgba(255,255,255,0.78)', flex:1, fontWeight:500 }}>{u.name}</span>
                        <span style={{ fontSize:12, fontWeight:700, color:'#4ade80' }}>{u.pts} pts</span>
                      </div>
                    ))}
                    <div style={{ padding:'8px 14px', textAlign:'center' }}>
                      <span style={{ fontSize:10, color:'rgba(255,255,255,0.22)' }}>Sign up to see the full leaderboard →</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        </>
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

                  {/* Warm-Up Comp — hidden when user already has invites to real comps */}
                  {pendingInvites.length === 0 && (
                    <div className="mb-3 rounded-xl border-2 border-green-300 bg-green-50 overflow-hidden">
                      <div className="flex items-center gap-3 p-3">
                        <span className="text-2xl flex-shrink-0">⚽</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-green-900">Tournament Warm-Up Comp</p>
                          <p className="text-[11px] text-green-700">Practice before the real thing</p>
                          <p className="text-[10px] text-green-600 opacity-75 mt-0.5">Warm-up points reset when the tournament begins</p>
                        </div>
                        <button
                          onClick={joinWarmUpComp}
                          disabled={joiningWarmUp}
                          className="px-2.5 py-1 text-xs font-bold text-green-700 bg-green-100 hover:bg-green-200 disabled:opacity-60 rounded-lg transition-colors flex items-center gap-1 flex-shrink-0"
                        >
                          {joiningWarmUp ? <Spinner className="w-3 h-3 text-green-600" /> : 'Join →'}
                        </button>
                      </div>
                      {warmUpError && (
                        <p className="px-3 pb-2 text-[11px] text-red-600">{warmUpError}</p>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex-1 h-px bg-gray-100" />
                    <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">or join your own comp</span>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>

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

                  {/* No invite fallback */}
                  <div className="mt-3 rounded-xl border border-dashed border-amber-200 bg-amber-50 p-3 text-center">
                    <p className="text-xs font-bold text-amber-800 mb-0.5">No code? No invite? No problem.</p>
                    <p className="text-[11px] text-amber-600 mb-2.5">Jump straight in with our open Warm-Up Comp — no invite needed.</p>
                    <Link href="/su-challenge"
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-white border border-amber-300 hover:border-amber-500 hover:bg-amber-100 text-xs font-semibold text-amber-800 transition-all">
                      ⚽ Join the Warm-Up Comp →
                    </Link>
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

              {/* Comp welcome banner — shown after joining a new comp */}
              {compWelcome && (
                <div className="mb-4 rounded-2xl overflow-hidden shadow-md"
                  style={{ background: 'linear-gradient(135deg, #14532d 0%, #16a34a 100%)' }}>
                  <div className="p-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-black text-white mb-0.5">🎉 Welcome to {compWelcome}!</p>
                      <p className="text-sm text-green-200 mb-3">You're now a member. Time to start tipping!</p>
                      <Link href="/predict"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-green-800 text-xs font-bold rounded-lg">
                        Start tipping →
                      </Link>
                    </div>
                    <button onClick={() => setCompWelcome(null)}
                      className="text-green-300 hover:text-white text-lg leading-none flex-shrink-0 mt-0.5">
                      ✕
                    </button>
                  </div>
                </div>
              )}

              {/* You're all set — fires once when tribe step completes */}
              {showAllSet && (
                <div className="mb-4 rounded-2xl overflow-hidden shadow-lg"
                  style={{ background: 'linear-gradient(135deg, #14532d 0%, #16a34a 100%)' }}>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xl font-black text-white mb-0.5">🎉 You&apos;re all set!</p>
                        <div className="flex flex-col gap-0.5 mb-3">
                          <p className="text-sm text-green-200 flex items-center gap-1.5"><span className="text-white">✓</span> Account created</p>
                          <p className="text-sm text-green-200 flex items-center gap-1.5"><span className="text-white">✓</span> Joined a Comp</p>
                          <p className="text-sm text-green-200 flex items-center gap-1.5"><span className="text-white">✓</span> Joined a Tribe</p>
                          {cameFromChallenge && (
                            <p className="text-sm text-green-200 flex items-center gap-1.5"><span>⚽</span> Warm-up picks saved!</p>
                          )}
                        </div>
                        {teamsList.length > 0 && (
                          <div className="mb-3">
                            <p className="text-xs font-semibold text-green-100 mb-1.5">⭐ Pick your Bonus Team</p>
                            <div className="flex items-center gap-2">
                              <select
                                value={favouriteTeam ?? ''}
                                onChange={e => saveFavTeam(e.target.value)}
                                disabled={savingFav}
                                className="text-xs font-medium rounded-lg border border-white/20 bg-white/15 text-white px-2 py-1.5 focus:outline-none flex-1">
                                <option value="">Pick a team…</option>
                                {teamsList.map(t => (
                                  <option key={t.name} value={t.name}>{t.flag_emoji} {t.name}</option>
                                ))}
                              </select>
                              {favouriteTeam && (
                                <span className="text-xs text-green-200 flex-shrink-0">2× pts ✓</span>
                              )}
                            </div>
                            {!favouriteTeam && (
                              <p className="text-[11px] text-green-300/70 mt-1">2× base points on their Group Stage matches</p>
                            )}
                          </div>
                        )}
                        <div className="flex gap-2 flex-wrap">
                          <Link href="/predict"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-green-800 text-xs font-bold rounded-lg">
                            Start Tipping! →
                          </Link>
                          <Link href="/leaderboard"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/20 border border-white/30 text-white text-xs font-semibold rounded-lg">
                            Leaderboard
                          </Link>
                        </div>
                      </div>
                      <button onClick={() => setShowAllSet(false)}
                        className="text-green-300 hover:text-white text-lg leading-none flex-shrink-0 mt-0.5">
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              )}

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
                    {editingName ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <input
                            autoFocus
                            value={nameInput}
                            onChange={e => { setNameInput(e.target.value); setNameError(null) }}
                            onKeyDown={e => { if (e.key === 'Enter') saveDisplayName(); if (e.key === 'Escape') setEditingName(false) }}
                            className="text-sm font-semibold text-gray-800 border border-gray-300 rounded-md px-2 py-0.5 w-36 focus:outline-none focus:ring-2 focus:ring-green-400"
                            maxLength={30}
                          />
                          <button
                            onClick={saveDisplayName}
                            disabled={nameSaving}
                            className="text-xs font-medium text-white bg-green-600 hover:bg-green-700 px-2 py-1 rounded-md disabled:opacity-50"
                          >{nameSaving ? '…' : 'Save'}</button>
                          <button
                            onClick={() => setEditingName(false)}
                            className="text-xs text-gray-400 hover:text-gray-600 px-1 py-1"
                          >✕</button>
                        </div>
                        {nameError && <p className="text-[11px] text-red-500">{nameError}</p>}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-800">{displayName}</span>
                        <button
                          onClick={() => { setNameInput(displayName ?? ''); setNameError(null); setEditingName(true) }}
                          className="text-[11px] font-medium text-gray-400 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 px-1.5 py-0.5 rounded transition-colors"
                          title="Edit display name"
                        >✏️ Edit</button>
                      </div>
                    )}
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

              {/* Bonus team nudge — shown to tipsters who haven't picked one yet */}
              {step3Done && !showAllSet && teamsList.length > 0 && !favouriteTeam && (
                <div className="mb-3 rounded-xl border border-purple-200 bg-purple-50 px-3 py-3 flex items-start gap-2.5">
                  <span className="text-base flex-shrink-0 mt-0.5">⭐</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-purple-800 mb-1.5">Pick your Bonus Team</p>
                    <select
                      value=""
                      onChange={e => saveFavTeam(e.target.value)}
                      disabled={savingFav}
                      className="text-xs font-medium rounded-lg border border-purple-300 bg-white text-purple-800 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-400 w-full">
                      <option value="">Choose a team…</option>
                      {teamsList.map(t => (
                        <option key={t.name} value={t.name}>{t.flag_emoji} {t.name}</option>
                      ))}
                    </select>
                    <p className="text-[11px] text-purple-600 mt-1">Earn 2× base points on their Group Stage matches</p>
                  </div>
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
                        {currentRoundCode && (
                          <span className="ml-2 text-[11px] font-semibold text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full align-middle">
                            {(scoringConfig.rounds as any)[currentRoundCode]?.round_name ?? currentRoundCode} Round
                          </span>
                        )}
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

              {/* No open round — next round teaser */}
              {!currentRoundCode && nextRoundInfo && (
                <div className="mb-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 flex items-center gap-3">
                  <span className="text-xl flex-shrink-0">📅</span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-blue-800">{nextRoundInfo.roundName} opens soon</p>
                    <p className="text-xs text-blue-600 mt-0.5">
                      First kickoff {new Date(nextRoundInfo.kickoff).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}{' '}
                      — check back to submit your tips!
                    </p>
                  </div>
                  <Link href="/predict"
                    className="flex-shrink-0 text-xs font-bold text-blue-700 bg-blue-100 hover:bg-blue-200 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                    Preview →
                  </Link>
                </div>
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
                    const isConfirming = confirmAction?.compId === c.id

                    if (isConfirming) {
                      return (
                        <div key={c.id} className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border-b border-red-100 last:border-0">
                          <span className="flex-1 text-xs text-red-700 font-medium truncate">
                            {confirmAction.action === 'delete' ? `Delete "${c.name}"?` : `Leave "${c.name}"?`}
                          </span>
                          <button onClick={handleCompAction} disabled={compActionBusy}
                            className="text-[11px] font-bold text-white bg-red-500 hover:bg-red-600 disabled:opacity-60 px-2.5 py-1 rounded-lg flex items-center gap-1 flex-shrink-0">
                            {compActionBusy ? <Spinner className="w-3 h-3 text-white" /> : 'Confirm'}
                          </button>
                          <button onClick={() => setConfirmAction(null)} disabled={compActionBusy}
                            className="text-[11px] font-medium text-gray-500 hover:text-gray-700 px-1.5 py-1 flex-shrink-0">
                            Cancel
                          </button>
                        </div>
                      )
                    }

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
                        {isSel && (
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              setConfirmAction({ compId: c.id, action: isAdm ? 'delete' : 'leave', name: c.name })
                            }}
                            title={isAdm ? 'Delete comp' : 'Leave comp'}
                            className="text-gray-300 hover:text-red-400 transition-colors px-1 flex-shrink-0 text-base leading-none">
                            ···
                          </button>
                        )}
                      </button>
                    )
                  })}
                  {/* What is a Comp */}
                  <div className="px-3 py-2 border-t border-gray-100 bg-gray-50/60 flex items-start gap-1.5">
                    <span className="text-[10px] text-gray-400 font-semibold flex-shrink-0 mt-px">ℹ</span>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      A <strong className="text-gray-500">Comp</strong> is your private leaderboard — a group of friends, colleagues, or family all tipping on the same tournament and competing for the top spot.
                    </p>
                  </div>
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

      {/* ── How it works — logged-out only ──────────────────────── */}
      {!session && (() => {
        const isTipster = persona === 'tipster'

        const tipsterSteps: { n:number; color:string; title:string; desc:string; phone:JSX.Element }[] = [
          {
            n:1, color:'#15803d',
            title: 'Accept Your Invite',
            desc:  'Tap the invite link your organiser shared — no code typing needed.',
            phone: (
              <div style={{ background:'#f9fafb', borderRadius:8, padding:'6px' }}>
                <p style={{ margin:'0 0 5px', fontSize:7.5, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px' }}>You&apos;ve been invited 🎉</p>
                <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:6, padding:'6px', marginBottom:5 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:4 }}>
                    <div style={{ width:20, height:20, borderRadius:5, background:'#dcfce7', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, flexShrink:0 }}>⚽</div>
                    <div>
                      <p style={{ margin:0, fontSize:8.5, fontWeight:700, color:'#111827' }}>World Cup Comp</p>
                      <p style={{ margin:0, fontSize:7, color:'#9ca3af' }}>Organised by Jordan · 24 tipsters</p>
                    </div>
                  </div>
                  <div style={{ background:'#15803d', borderRadius:5, padding:'4px 0', textAlign:'center', fontSize:8, fontWeight:700, color:'#fff' }}>
                    Accept &amp; Join →
                  </div>
                </div>
                <p style={{ margin:0, fontSize:7, color:'#9ca3af', textAlign:'center' }}>You&apos;ll be in before the first match kicks off</p>
              </div>
            ),
          },
          {
            n:2, color:'#1d4ed8',
            title: 'Make Your Tips',
            desc:  'Pick every match result before the submission deadline.',
            phone: (
              <div style={{ background:'#f9fafb', borderRadius:8, padding:'6px' }}>
                <p style={{ margin:'0 0 4px', fontSize:7.5, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px' }}>My Tips</p>
                {([{ home:'🇦🇷', away:'🇧🇷', hs:'2', as:'1' }, { home:'🇫🇷', away:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', hs:'1', as:'0' }] as {home:string;away:string;hs:string;as:string}[]).map((m, i) => (
                  <div key={i} style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:5, padding:'4px 5px', marginBottom:4, display:'flex', alignItems:'center', gap:3 }}>
                    <span style={{ fontSize:11 }}>{m.home}</span>
                    <div style={{ flex:1, display:'flex', justifyContent:'center', gap:3 }}>
                      <div style={{ width:15, height:15, background:'#dbeafe', borderRadius:3, display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:800, color:'#1d4ed8' }}>{m.hs}</div>
                      <span style={{ fontSize:7, color:'#9ca3af', alignSelf:'center' }}>–</span>
                      <div style={{ width:15, height:15, background:'#dbeafe', borderRadius:3, display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:800, color:'#1d4ed8' }}>{m.as}</div>
                    </div>
                    <span style={{ fontSize:11 }}>{m.away}</span>
                  </div>
                ))}
                <div style={{ textAlign:'center', marginTop:3 }}>
                  <div style={{ display:'inline-block', background:'#1d4ed8', borderRadius:5, padding:'3px 10px', fontSize:7.5, fontWeight:700, color:'#fff' }}>Submit →</div>
                </div>
              </div>
            ),
          },
          {
            n:3, color:'#7c3aed',
            title: 'Track & Win',
            desc:  'Climb the leaderboard every round and celebrate with your tribe.',
            phone: (
              <div style={{ background:'#f9fafb', borderRadius:8, padding:'6px' }}>
                <p style={{ margin:'0 0 4px', fontSize:7.5, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px' }}>🏆 Leaderboard</p>
                {([{ rank:1, name:'Sarah', pts:142, gold:true }, { rank:2, name:'Marco', pts:128, gold:false }, { rank:3, name:'Priya', pts:115, gold:false }] as {rank:number;name:string;pts:number;gold:boolean}[]).map(r => (
                  <div key={r.rank} style={{ display:'flex', alignItems:'center', gap:3, padding:'3px 0', borderBottom:'1px solid #f3f4f6' }}>
                    <span style={{ fontSize:7.5, fontWeight:800, width:12, flexShrink:0, color: r.gold ? '#f59e0b' : '#9ca3af' }}>#{r.rank}</span>
                    <div style={{ width:13, height:13, borderRadius:'50%', background: r.gold ? '#fef3c7' : '#f3f4f6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:7, fontWeight:700, color: r.gold ? '#b45309' : '#6b7280', flexShrink:0 }}>{r.name[0]}</div>
                    <span style={{ flex:1, fontSize:8, fontWeight:600, color:'#374151' }}>{r.name}</span>
                    <span style={{ fontSize:8, fontWeight:800, color: r.gold ? '#d97706' : '#374151' }}>{r.pts}</span>
                  </div>
                ))}
                <div style={{ marginTop:4, background:'#ede9fe', borderRadius:5, padding:'3px 5px', display:'flex', alignItems:'center', gap:3 }}>
                  <span style={{ fontSize:7.5, fontWeight:700, color:'#7c3aed' }}>You</span>
                  <span style={{ flex:1, fontSize:7.5, color:'#7c3aed' }}>#7 · 88 pts</span>
                  <span style={{ fontSize:7.5, color:'#7c3aed', fontWeight:700 }}>↑3</span>
                </div>
              </div>
            ),
          },
        ]

        const organiserSteps: { n:number; color:string; title:string; desc:string; phone:JSX.Element }[] = [
          {
            n:1, color:'#15803d',
            title: 'Create a Comp',
            desc:  'Name your comp and set it up in under 10 minutes — always free.',
            phone: (
              <div style={{ background:'#f9fafb', borderRadius:8, padding:'6px' }}>
                <p style={{ margin:'0 0 4px', fontSize:7.5, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px' }}>New Comp</p>
                <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:5, padding:'4px 6px', marginBottom:4, fontSize:8, color:'#374151', fontWeight:600 }}>World Cup Comp 2026</div>
                <div style={{ display:'flex', gap:3, marginBottom:4 }}>
                  {['Group A', '🏆 WC 2026'].map(tag => (
                    <div key={tag} style={{ background:'#dcfce7', borderRadius:4, padding:'2px 5px', fontSize:7, fontWeight:700, color:'#15803d' }}>{tag}</div>
                  ))}
                </div>
                <div style={{ background:'#15803d', borderRadius:5, padding:'4px 0', textAlign:'center', fontSize:8, fontWeight:700, color:'#fff' }}>Create free →</div>
                <p style={{ margin:'4px 0 0', fontSize:7, color:'#9ca3af', textAlign:'center' }}>No credit card required</p>
              </div>
            ),
          },
          {
            n:2, color:'#1d4ed8',
            title: 'Invite Your Group',
            desc:  'Share a one-tap link or send bulk emails straight from the app.',
            phone: (
              <div style={{ background:'#f9fafb', borderRadius:8, padding:'6px' }}>
                <p style={{ margin:'0 0 4px', fontSize:7.5, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px' }}>Invite tipsters</p>
                <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:5, padding:'4px 6px', marginBottom:4, display:'flex', alignItems:'center', gap:4 }}>
                  <span style={{ flex:1, fontSize:7.5, color:'#9ca3af', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>tribepicks.com/join?code=ABC…</span>
                  <div style={{ background:'#dbeafe', borderRadius:3, padding:'2px 5px', fontSize:7, fontWeight:700, color:'#1d4ed8', flexShrink:0 }}>Copy</div>
                </div>
                <div style={{ background:'#1d4ed8', borderRadius:5, padding:'4px 0', textAlign:'center', fontSize:8, fontWeight:700, color:'#fff', marginBottom:3 }}>📤 Share invite link</div>
                <div style={{ display:'flex', justifyContent:'space-between', padding:'0 2px' }}>
                  <span style={{ fontSize:7, color:'#9ca3af' }}>12 sent</span>
                  <span style={{ fontSize:7, color:'#9ca3af' }}>9 joined · 3 pending</span>
                </div>
              </div>
            ),
          },
          {
            n:3, color:'#7c3aed',
            title: 'Sit Back & Watch',
            desc:  'Scores auto-update, reminders go out, the leaderboard runs itself.',
            phone: (
              <div style={{ background:'#f9fafb', borderRadius:8, padding:'6px' }}>
                <p style={{ margin:'0 0 4px', fontSize:7.5, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.4px' }}>Comp Health</p>
                {([
                  { icon:'👥', label:'Joined',     val:'19', color:'#374151' },
                  { icon:'🎯', label:'Have tipped', val:'14', color:'#15803d' },
                  { icon:'📩', label:'Awaiting',   val:'3',  color:'#d97706' },
                ] as {icon:string;label:string;val:string;color:string}[]).map(s => (
                  <div key={s.label} style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 0', borderBottom:'1px solid #f3f4f6' }}>
                    <span style={{ fontSize:9 }}>{s.icon}</span>
                    <span style={{ flex:1, fontSize:7.5, color:'#6b7280' }}>{s.label}</span>
                    <span style={{ fontSize:9, fontWeight:800, color:s.color }}>{s.val}</span>
                  </div>
                ))}
                <div style={{ marginTop:4, background:'#dcfce7', borderRadius:5, padding:'3px 6px', display:'flex', alignItems:'center', gap:3 }}>
                  <span style={{ fontSize:7.5, color:'#15803d' }}>⚡</span>
                  <span style={{ fontSize:7, color:'#15803d', fontWeight:600 }}>Scores synced automatically</span>
                </div>
              </div>
            ),
          },
        ]

        const steps = isTipster ? tipsterSteps : organiserSteps
        const cta   = isTipster
          ? { href:'/login', label:'Start Your First Pick →' }
          : { href:'/login?tab=register&role=organiser', label:'Create a Comp Free →' }
        const testimonial = isTipster
          ? { quote: 'I love seeing how my tribe\'s picks stack up each round!', author: 'Alex, TribePicks tipster' }
          : { quote: 'Set it up in an evening — the app does the rest. Our group has never been more engaged.', author: 'Jordan, comp organiser' }

        return (
          <div className="mb-10">
            {/* Section header */}
            <div className="text-center mb-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Simple by design</p>
              <h2 className="text-2xl font-black text-gray-900">How It Works</h2>
            </div>

            {/* Steps — horizontal row */}
            <div className="flex items-start gap-1">
              {steps.map((s, i) => (
                <div key={s.n} className="contents">
                  <div className="flex-1 flex flex-col items-center text-center">
                    <div style={{
                      width:34, height:34, borderRadius:'50%', background:s.color, color:'#fff',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:14, fontWeight:900, flexShrink:0,
                      boxShadow:`0 4px 12px ${s.color}50`, marginBottom:8,
                    }}>{s.n}</div>
                    <h3 className="text-xs font-black text-gray-900 mb-1 leading-tight">{s.title}</h3>
                    <p className="text-[10px] text-gray-500 mb-3 leading-relaxed px-0.5">{s.desc}</p>
                    <div style={{ width:'100%', background:'#111827', borderRadius:14, padding:'7px 6px 9px', boxShadow:'0 6px 20px rgba(0,0,0,0.20)' }}>
                      <div style={{ width:28, height:4, background:'#374151', borderRadius:2, margin:'0 auto 6px' }} />
                      {s.phone}
                    </div>
                  </div>
                  {i < 2 && (
                    <div className="flex-shrink-0 flex items-start pt-3.5">
                      <span style={{ fontSize:16, color:'#d1d5db', lineHeight:1 }}>→</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Testimonial */}
            <div className="mt-8 mb-6 text-center px-4">
              <p className="text-sm italic text-gray-500 leading-relaxed">&ldquo;{testimonial.quote}&rdquo;</p>
              <p className="text-[11px] text-gray-400 mt-1 font-medium">— {testimonial.author}</p>
            </div>

            {/* CTA */}
            <div className="text-center">
              <Link href={cta.href} className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold rounded-2xl transition-colors shadow-md">
                {cta.label}
              </Link>
            </div>
          </div>
        )
      })()}

      {/* ── Why TribePicks — logged-out only ────────────────────── */}
      {!session && (
        <div className="mb-8">
          <div className="text-center mb-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Built for your group</p>
            <h2 className="text-xl font-black text-gray-900">Why TribePicks?</h2>
          </div>

          <div className="grid grid-cols-2 gap-3">

            {/* ── Tipster: Scoring ── */}
            {persona === 'tipster' && (
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
                <div className="flex items-center gap-2 px-3.5 py-2.5 bg-emerald-700">
                  <span className="text-base leading-none">🎯</span>
                  <p className="text-[11px] font-black text-white uppercase tracking-wider">Scoring</p>
                </div>
                <div className="p-3.5 space-y-2.5 flex-1">
                  {([
                    ['⚽', 'Bonus points for calling the penalty winner'],
                    ['⭐', '2× points on your Bonus Team\'s matches'],
                    ['🎰', 'Extra points for predicting the exact score'],
                    ['📈', 'Higher stakes as the tournament progresses'],
                    ['🏆', 'See who\'s rising through every round'],
                  ] as [string, string][]).map(([icon, label]) => (
                    <div key={label} className="flex items-start gap-2">
                      <span className="text-sm leading-none mt-0.5 flex-shrink-0">{icon}</span>
                      <p className="text-[11px] font-medium text-gray-700 leading-tight">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Organiser: Comp Management ── */}
            {persona === 'organiser' && (
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
                <div className="flex items-center gap-2 px-3.5 py-2.5 bg-blue-700">
                  <span className="text-base leading-none">⚙️</span>
                  <p className="text-[11px] font-black text-white uppercase tracking-wider">Comp Mgmt</p>
                </div>
                <div className="p-3.5 space-y-2.5 flex-1">
                  {([
                    ['🔗', 'Invite your group by link or code'],
                    ['👀', 'Track who\'s joined and follow up instantly'],
                    ['💰', 'Collect entry fees without spreadsheets'],
                    ['⚔️', 'Divide your comp into rival Tribes'],
                  ] as [string, string][]).map(([icon, label]) => (
                    <div key={label} className="flex items-start gap-2">
                      <span className="text-sm leading-none mt-0.5 flex-shrink-0">{icon}</span>
                      <p className="text-[11px] font-medium text-gray-700 leading-tight">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Tipster: Social Engagement ── */}
            {persona === 'tipster' && (
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
                <div className="flex items-center gap-2 px-3.5 py-2.5 bg-violet-700">
                  <span className="text-base leading-none">💬</span>
                  <p className="text-[11px] font-black text-white uppercase tracking-wider">Social</p>
                </div>
                <div className="p-3.5 space-y-2.5 flex-1">
                  {([
                    ['💬', 'Trash talk in your Tribe chatroom'],
                    ['👁️', 'See everyone\'s picks after the deadline'],
                    ['🏅', 'Your Tribe has its own leaderboard'],
                    ['📢', 'Broadcast announcements to your comp'],
                    ['⚡', 'Add match prizes to spike the excitement'],
                  ] as [string, string][]).map(([icon, label]) => (
                    <div key={label} className="flex items-start gap-2">
                      <span className="text-sm leading-none mt-0.5 flex-shrink-0">{icon}</span>
                      <p className="text-[11px] font-medium text-gray-700 leading-tight">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Organiser: Reduced Admin ── */}
            {persona === 'organiser' && (
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
                <div className="flex items-center gap-2 px-3.5 py-2.5 bg-amber-600">
                  <span className="text-base leading-none">🔧</span>
                  <p className="text-[11px] font-black text-white uppercase tracking-wider">Reduced Admin</p>
                </div>
                <div className="p-3.5 space-y-2.5 flex-1">
                  {([
                    ['⚡', 'Scores update automatically — no manual entry'],
                    ['🔔', 'Automatic reminders go out before tips close'],
                  ] as [string, string][]).map(([icon, label]) => (
                    <div key={label} className="flex items-start gap-2">
                      <span className="text-sm leading-none mt-0.5 flex-shrink-0">{icon}</span>
                      <p className="text-[11px] font-medium text-gray-700 leading-tight">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
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
            setCompWelcome(comp.name)
          }}
          onManageComp={async (comp) => {
            setModal(null)
            await pickComp(comp as any)
            await refreshComps(comp.id)
            router.push('/comp-admin')
          }}
        />
      )}

      {/* Tournament stats — logged-in only; adds no value on the unsigned hero */}
      {session && (() => {
        const t = selectedTourn
        const stats = [
          { label: 'Matches', value: t?.total_matches != null ? String(t.total_matches) : '—' },
          { label: 'Teams',   value: t?.total_teams   != null ? String(t.total_teams)   : '—' },
          { label: 'Rounds',  value: t?.total_rounds  != null ? String(t.total_rounds)  : '—' },
          { label: 'Max pts', value: (t?.max_base_pts != null && t?.max_bonus_pts != null) ? String((t.max_base_pts ?? 0) + (t.max_bonus_pts ?? 0)) : '—' },
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

