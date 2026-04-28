'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { Spinner } from '@/components/ui'

type Mode    = 'login' | 'register' | 'magic' | 'reset'
type OrgStep = 'choose' | 'join' | 'create'

const ALL_TEAMS = [
  'Algeria','Argentina','Australia','Austria','Belgium',
  'Bosnia and Herzegovina','Brazil','Canada','Cape Verde',
  'Colombia','Croatia','Curacao','Czechia','DR Congo',
  'Ecuador','Egypt','England','France','Germany','Ghana',
  'Haiti','Iran','Iraq','Ivory Coast','Japan','Jordan',
  'Mexico','Morocco','Netherlands','New Zealand','Norway',
  'Panama','Paraguay','Portugal','Qatar','Saudi Arabia',
  'Scotland','Senegal','South Africa','South Korea','Spain',
  'Sweden','Switzerland','Tunisia','Turkey','Uruguay',
  'USA','Uzbekistan',
].sort()

const TOURNAMENT_KICKOFF = new Date('2026-06-11T19:00:00Z')

export default function LoginPage() {
  const { supabase, session } = useSupabase()
  const router  = useRouter()
  const params  = useSearchParams()
  const redirect = params.get('redirect') ?? '/'
  const tabParam = params.get('tab') as Mode | null

  const [mode,     setMode]     = useState<Mode>(tabParam === 'register' ? 'register' : 'login')

  // Sync tab from URL param — handles Navbar links pressing Register or Sign in
  // while the page is already mounted
  useEffect(() => {
    if (tabParam === 'register' && mode !== 'register') setMode('register')
    else if ((tabParam === 'login' || !tabParam) && mode !== 'login' && !tabParam) {/* no-op on null */}
    else if (tabParam === 'login') setMode('login')
  }, [tabParam])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [sentMode, setSentMode] = useState<Mode>('register')

  // Registration fields
  const [email,    setEmail]    = useState('')
  const [password,        setPassword]        = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name,            setName]            = useState('')
  const [firstName,       setFirstName]       = useState('')
  const [agreedToTerms,   setAgreedToTerms]   = useState(false)
  // Simple math captcha
  const [captchaA]        = useState(() => Math.floor(Math.random() * 9) + 1)
  const [captchaB]        = useState(() => Math.floor(Math.random() * 9) + 1)
  const [captchaInput,    setCaptchaInput]    = useState('')
  const [favTeam,      setFavTeam]      = useState('')
  const [tournaments,  setTournaments]  = useState<{id:string;name:string;slug:string;status:string;start_date?:string}[]>([])
  const [selectedTourn,  setSelectedTourn]  = useState<string>('')
  const [favTeamForTourn,setFavTeamForTourn] = useState<string>('')
  const [tournTeamsMap,  setTournTeamsMap]   = useState<Record<string, string[]>>({})

  // Post-registration screens
  const [registered, setRegistered] = useState(false)  // show "check email"

  // Post-login onboarding (first login after verification)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [orgStep,    setOrgStep]    = useState<OrgStep>('choose')
  const [onboardingLoading, setOnboardingLoading] = useState(false)
  const [onboardingError,   setOnboardingError]   = useState<string | null>(null)
  const [onboardingUserId,  setOnboardingUserId]  = useState<string | null>(null)

  // Pending comp invitations for the logged-in user
  const [pendingInvites,    setPendingInvites]    = useState<any[]>([])
  const [joiningInviteId,   setJoiningInviteId]   = useState<string | null>(null)
  const [decliningInviteId, setDecliningInviteId] = useState<string | null>(null)
  const [blockFutureLogin,  setBlockFutureLogin]  = useState(false)
  const [decliningLoginBusy,setDecliningLoginBusy]= useState(false)

  // Org join fields
  const [compCode,    setOrgCode]    = useState('')
  const [compLookup,  setOrgLookup]  = useState<{id:string;name:string} | null>(null)
  const [compCodeErr, setOrgCodeErr] = useState<string | null>(null)
  const [lookingUp,  setLookingUp]  = useState(false)

  // Org create fields
  const [newCompName,  setNewOrgName]  = useState('')
  const [ownerPhone,  setOwnerPhone]  = useState('')
  const [ownerEmail,  setOwnerEmail]  = useState('')
  const [logoFile,    setLogoFile]    = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const tournamentStarted = Date.now() >= TOURNAMENT_KICKOFF.getTime()


  // Fetch active/upcoming tournaments for registration
  useEffect(() => {
    fetch('/api/tournaments')
      .then(r => r.json())
      .then(async ({ data }) => {
        const active = (data ?? []).filter((t: any) => t.is_active === true && t.status !== 'ended')
        setTournaments(active)
        if (active.length === 1) setSelectedTourn(active[0].id)
        // Fetch teams from tournament_teams table for each active tournament
        const tmap: Record<string, string[]> = {}
        await Promise.all(active.map(async (t: any) => {
          try {
            const res  = await fetch(`/api/tournament-teams?tournament_id=${t.id}`)
            const json = await res.json()
            const teams = (json.teams ?? []).map((tm: any) => tm.name ?? tm).filter(Boolean).sort() as string[]
            tmap[t.id] = teams.length > 0 ? teams : [...(t.teams ?? [])].sort()
          } catch {
            tmap[t.id] = [...(t.teams ?? [])].sort()
          }
        }))
        setTournTeamsMap(tmap)
      })
      .catch(() => {})
  }, [])

  // When session is established after verification, check onboarding status
  useEffect(() => {
    if (!session) return
    const checkOnboarding = async () => {
      const { data } = await supabase
        .from('users')
        .select('onboarding_complete, display_name, email')
        .eq('id', session.user.id)
        .single()
      if (data && !(data as any).onboarding_complete) {
        setOnboardingUserId(session.user.id)
        setOwnerEmail((data as any).email ?? session.user.email ?? '')
        setShowOnboarding(true)
      } else {
        router.push(redirect)
        router.refresh()
      }
    }
    checkOnboarding()
  }, [session])

  // Fetch pending invitations when onboarding screen appears
  useEffect(() => {
    if (!showOnboarding || !session) return
    fetch('/api/comp-invitations/pending')
      .then(r => r.json())
      .then(d => setPendingInvites(d.data ?? []))
      .catch(() => {})
  }, [showOnboarding, session])

  // ── Handlers ──────────────────────────────────────────────

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setError(null)

    if (mode === 'magic') {
      setLoading(true)
      const { error } = await supabase.auth.signInWithOtp({
        email, options: { emailRedirectTo: `${window.location.origin}${redirect}` },
      })
      setLoading(false)
      if (error) setError(error.message)
      else { setSentMode('magic'); setRegistered(true) }
      return
    }

    if (mode === 'reset') {
      setLoading(true)
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })
      setLoading(false)
      if (error) setError(error.message.toLowerCase().includes('rate limit')
        ? 'Too many attempts — please wait a few minutes.' : error.message)
      else { setSentMode('reset'); setRegistered(true) }
      return
    }

    if (mode === 'login') {
      setLoading(true)
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      setLoading(false)
      if (error) setError(error.message)
      // session change triggers useEffect above which handles redirect/onboarding
      return
    }

    if (mode === 'register') {
      // ── Client-side validation ──────────────────────────────────────────
      const displayName = name.trim()

      if (!displayName) {
        setError('Please enter a display name')
        return
      }
      if (displayName.length < 3) {
        setError('Display name must be at least 3 characters')
        return
      }

      if (!firstName.trim()) {
        setError('First name is required')
        return
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match — please re-enter')
        return
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters')
        return
      }
      if (parseInt(captchaInput) !== captchaA + captchaB) {
        setError(`Captcha incorrect — what is ${captchaA} + ${captchaB}?`)
        return
      }
      if (!agreedToTerms) {
        setError('You must agree to the Terms & Conditions to register')
        return
      }

      setLoading(true)

      // Check display name uniqueness
      const { data: nameCheck } = await supabase
        .from('users').select('id').ilike('display_name', displayName).maybeSingle()
      if (nameCheck) {
        setError(`Display name "${displayName}" is already taken — please choose another`)
        setLoading(false)
        return
      }

      // Check email uniqueness (Supabase auth will also catch this, but gives a nicer message)
      const { data: emailCheck } = await supabase
        .from('users').select('id').ilike('email', email.trim()).maybeSingle()
      if (emailCheck) {
        setError('This email is already registered — use Sign in or Reset password.')
        setLoading(false)
        return
      }

      const { data: signUpData, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { display_name: displayName } },
      })
      setLoading(false)
      if (error) {
        if (error.message.toLowerCase().includes('rate limit')) {
          setError('Too many signups attempted — please wait a few minutes and try again.')
        } else if (error.message.toLowerCase().includes('already registered')) {
          setError('This email is already registered — use Sign in or Reset password.')
        } else if (error.message.toLowerCase().includes('sending confirmation') || error.message.toLowerCase().includes('sending email')) {
          setError('Unable to send confirmation email right now. Please try again in a few minutes, or contact the tournament admin.')
        } else {
          setError(error.message)
        }
        return
      }

      const newUser = signUpData.user
      if (newUser) {
        // Upsert user row — no default comp, user will pick on homepage
        await (supabase.from('users') as any).upsert({
          id:                  newUser.id,
          email:               newUser.email!,
          display_name:        displayName,
          first_name:          firstName.trim() || null,
          timezone:            Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          onboarding_complete: false,
        }, { onConflict: 'id', ignoreDuplicates: false })

        // Enrol in selected tournament immediately — write directly to user_tournaments
        // using the admin endpoint (no session needed yet, uses service-role client)
        const tid = selectedTourn || tournaments[0]?.id
        if (tid && newUser.id) {
          fetch('/api/user-tournaments/enrol', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id:        newUser.id,
              tournament_id:  tid,
              favourite_team: favTeamForTourn || null,
            }),
          }).catch(() => {}) // fire-and-forget — row written before email confirmation
        }

        // Show "check your email" confirmation
        setSentMode('register'); setRegistered(true)
      }
    }
  }

  // ── Onboarding: accept a pending invitation in one tap ────
  const acceptInvitation = async (invite: { comp_id: string; invite_code: string; invitation_id: string }) => {
    setJoiningInviteId(invite.invitation_id)
    setOnboardingError(null)
    try {
      const res = await fetch('/api/comp-admins/self-register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comp_id: invite.comp_id, invite_code: invite.invite_code }),
      })
      const { success, error } = await res.json()
      if (!success) { setOnboardingError(error ?? 'Failed to join comp') }
      else await completeOnboarding()  // mark onboarding complete and redirect
    } catch { setOnboardingError('Something went wrong — please try again') }
    finally { setJoiningInviteId(null) }
  }

  // ── Onboarding: decline a pending invitation ─────────────
  const declineInvitation = async (inv: any, block: boolean) => {
    setDecliningLoginBusy(true)
    try {
      await fetch('/api/comp-invitations/pending', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitation_id: inv.invitation_id, block }),
      })
      setPendingInvites(prev => prev.filter(i => i.invitation_id !== inv.invitation_id))
      setDecliningInviteId(null)
      setBlockFutureLogin(false)
    } finally {
      setDecliningLoginBusy(false)
    }
  }

  // ── Onboarding: look up org code ──────────────────────────
  const lookupOrgCode = async () => {
    setLookingUp(true); setOrgCodeErr(null); setOrgLookup(null)
    const res = await fetch(`/api/comps?code=${compCode}`)
    const { data, error } = await res.json()
    setLookingUp(false)
    if (error || !data) setOrgCodeErr('Code not found — check with your tournament admin')
    else setOrgLookup(data)
  }

  // ── Onboarding: complete (marks onboarding_complete = true) ─
  const completeOnboarding = async (compId?: string, inviteCode?: string, createPayload?: any) => {
    setOnboardingLoading(true); setOnboardingError(null)
    try {
      if (compId && inviteCode) {
        // Join existing org
        const res = await fetch('/api/comp-admins/self-register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comp_id: compId, invite_code: inviteCode }),
        })
        const { success, error } = await res.json()
        if (!success) { setOnboardingError(error ?? 'Failed to join comp'); setOnboardingLoading(false); return }
      }

      if (createPayload) {
        // Create new org
        const res = await fetch('/api/comps/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createPayload),
        })
        const { data: org, error: orgErr } = await res.json()
        if (orgErr || !org) { setOnboardingError(orgErr ?? 'Failed to create comp'); setOnboardingLoading(false); return }

        // Upload logo
        if (logoFile && session?.user.id) {
          const ext  = logoFile.name.split('.').pop()
          const path = `${session.user.id}/logo.${ext}`
          const { data: uploaded } = await supabase.storage
            .from('org-logos').upload(path, logoFile, { upsert: true })
          if (uploaded) {
            const { data: urlData } = supabase.storage.from('org-logos').getPublicUrl(path)
            await fetch('/api/comps/create', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ comp_id: org.id, logo_url: urlData.publicUrl, user_id: session.user.id }),
            })
          }
        }
      }

      // Tournament enrolment was already written at registration time via /api/user-tournaments/enrol
      // No sessionStorage processing needed

      // Mark onboarding complete
      await (supabase.from('users') as any)
        .update({ onboarding_complete: true })
        .eq('id', session!.user.id)

      router.push(redirect); router.refresh()
    } catch { setOnboardingError('Something went wrong — please try again') }
    finally { setOnboardingLoading(false) }
  }

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setOnboardingError('Logo must be under 2MB'); return }
    setLogoFile(file)
    const reader = new FileReader()
    reader.onload = ev => setLogoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  // ── Screen: Check email ───────────────────────────────────
  if (registered) {
    const emailScreenCopy = {
      register: {
        icon:    '📬',
        title:   'Check your email',
        body:    `We sent a verification link to`,
        detail:  'Click the link to activate your account, then come back here to sign in.',
        warning: true,
      },
      magic: {
        icon:    '✨',
        title:   'Magic link sent!',
        body:    `We sent a sign-in link to`,
        detail:  'Click the link to sign in instantly — it expires in 10 minutes.',
        warning: false,
      },
      reset: {
        icon:    '🔐',
        title:   'Check your email',
        body:    `We sent a password reset link to`,
        detail:  'Click the link to choose a new password — it expires in 1 hour.',
        warning: false,
      },
    } as const
    const copy = emailScreenCopy[sentMode as keyof typeof emailScreenCopy] ?? emailScreenCopy.register

    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
        <div className="max-w-sm w-full text-center">
          <div className="text-6xl mb-5">{copy.icon}</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">{copy.title}</h1>
          <p className="text-sm text-gray-600 mb-2">
            {copy.body} <strong>{email}</strong>.
          </p>
          <p className="text-sm text-gray-500 mb-6">{copy.detail}</p>
          {copy.warning && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left mb-6">
              <p className="text-xs font-semibold text-amber-800 mb-1">⚠️ Don't skip this step</p>
              <p className="text-xs text-amber-700">You won't be able to sign in until your email is verified.</p>
            </div>
          )}
          <button onClick={() => { setRegistered(false); setMode('login'); setError(null) }}
            className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-xl">
            Back to sign in
          </button>
          <p className="text-xs text-gray-400 mt-4">Didn't receive it? Check your spam folder.</p>
        </div>
      </div>
    )
  }

  // ── Screen: First-login onboarding ───────────────────────
  if (showOnboarding) return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-gray-50">
      <div className="max-w-sm w-full">
        {orgStep !== 'choose' && (
          <button onClick={() => { setOrgStep('choose'); setOnboardingError(null) }}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 mb-5">
            ← Back
          </button>
        )}

        <div className="text-center mb-6">
          <div className="text-4xl mb-3">{orgStep === 'choose' ? '🎉' : orgStep === 'join' ? '🔑' : '✨'}</div>
          <h1 className="text-xl font-semibold text-gray-900">
            {orgStep === 'choose' ? "Welcome to TribePicks!" : orgStep === 'join' ? 'Join a Comp' : 'Create a Comp'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {orgStep === 'choose'
              ? 'Set up your comp to compete with your group'
              : orgStep === 'join'
              ? 'Enter the invite code shared by your Comp admin'
              : 'Register your comp for the tournament'}
          </p>
        </div>

        {/* Choose screen */}
        {orgStep === 'choose' && (
          <div className="space-y-3">

            {/* Pending invitations — shown first when available */}
            {pendingInvites.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
                  You've been invited to
                </p>
                {pendingInvites.map((inv: any) => (
                  <div key={inv.invitation_id} className="rounded-xl border-2 border-green-300 bg-green-50 overflow-hidden">
                    {decliningInviteId === inv.invitation_id ? (
                      <div className="p-4 space-y-3">
                        <p className="text-sm font-semibold text-gray-800">Decline <span className="text-green-700">{inv.comp_name}</span>?</p>
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={blockFutureLogin}
                            onChange={e => setBlockFutureLogin(e.target.checked)}
                            className="mt-0.5 accent-red-500 flex-shrink-0"
                          />
                          <span className="text-xs text-gray-600">Don't show future invites from this comp</span>
                        </label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => declineInvitation(inv, blockFutureLogin)}
                            disabled={decliningLoginBusy}
                            className="flex-1 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-60 rounded-lg transition-colors flex items-center justify-center gap-1"
                          >
                            {decliningLoginBusy ? <Spinner className="w-4 h-4 text-white" /> : 'Remove'}
                          </button>
                          <button
                            onClick={() => { setDecliningInviteId(null); setBlockFutureLogin(false) }}
                            disabled={decliningLoginBusy}
                            className="flex-1 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-60 rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 p-4">
                        {inv.comp_logo_url
                          ? <img src={inv.comp_logo_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-green-200" />
                          : <span className="text-2xl flex-shrink-0">🏆</span>
                        }
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-green-900 truncate">{inv.comp_name}</p>
                          <p className="text-xs text-green-700 mt-0.5">Tap to join instantly — no code needed</p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => acceptInvitation(inv)}
                            disabled={joiningInviteId === inv.invitation_id || onboardingLoading}
                            className="px-3 py-1.5 text-sm font-bold text-green-700 bg-green-100 hover:bg-green-200 disabled:opacity-60 rounded-lg transition-colors flex items-center gap-1"
                          >
                            {joiningInviteId === inv.invitation_id ? <Spinner className="w-4 h-4 text-green-600" /> : 'Join →'}
                          </button>
                          <button
                            onClick={() => { setDecliningInviteId(inv.invitation_id); setBlockFutureLogin(false) }}
                            disabled={!!joiningInviteId || onboardingLoading}
                            className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-white rounded-md transition-colors disabled:opacity-40 text-xs"
                            title="Decline invitation"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {onboardingError && (
                  <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{onboardingError}</p>
                )}
                <div className="flex items-center gap-2 my-1">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">or</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
              </div>
            )}

            <button onClick={() => setOrgStep('join')}
              className="w-full flex items-center gap-4 bg-white border-2 border-gray-200 hover:border-green-400 rounded-xl p-4 text-left transition-colors">
              <span className="text-2xl">🔑</span>
              <div>
                <p className="text-sm font-semibold text-gray-900">Join a Comp</p>
                <p className="text-xs text-gray-500 mt-0.5">I have an invite code from my Comp admin</p>
              </div>
            </button>
            <button onClick={() => setOrgStep('create')}
              className="w-full flex items-center gap-4 bg-white border-2 border-gray-200 hover:border-green-400 rounded-xl p-4 text-left transition-colors">
              <span className="text-2xl">✨</span>
              <div>
                <p className="text-sm font-semibold text-gray-900">Create a Comp</p>
                <p className="text-xs text-gray-500 mt-0.5">Set up a new Comp for my team</p>
              </div>
            </button>
            <button onClick={() => completeOnboarding()}
              disabled={onboardingLoading}
              className="w-full flex items-center gap-4 bg-white border-2 border-gray-200 hover:border-gray-300 rounded-xl p-4 text-left transition-colors disabled:opacity-50">
              <span className="text-2xl">⏭️</span>
              <div>
                <p className="text-sm font-semibold text-gray-900">Skip for now</p>
                <p className="text-xs text-gray-500 mt-0.5">You can join or create a comp from the home page</p>
              </div>
              {onboardingLoading && <Spinner className="w-4 h-4 ml-auto" />}
            </button>
          </div>
        )}

        {/* Join org screen */}
        {orgStep === 'join' && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Comp code</label>
              <div className="flex gap-2">
                <input type="text" value={compCode}
                  onChange={e => { setOrgCode(e.target.value.toUpperCase()); setOrgLookup(null); setOrgCodeErr(null) }}
                  placeholder="e.g. ACME1234" maxLength={8}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg font-mono uppercase focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
                <button type="button" onClick={lookupOrgCode}
                  disabled={lookingUp || compCode.length < 6}
                  className="px-3 py-2 text-xs font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50">
                  {lookingUp ? <Spinner className="w-3 h-3" /> : 'Verify'}
                </button>
              </div>
              {compLookup && <p className="text-[11px] text-green-700 mt-1.5">✓ <strong>{compLookup.name}</strong> — you'll be added as org admin</p>}
              {compCodeErr && <p className="text-[11px] text-red-600 mt-1.5">{compCodeErr}</p>}
            </div>
            {onboardingError && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{onboardingError}</p>}
            <button
              onClick={() => compLookup && completeOnboarding(compLookup.id, compCode)}
              disabled={onboardingLoading || !compLookup}
              className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium rounded-xl flex items-center justify-center gap-2">
              {onboardingLoading && <Spinner className="w-4 h-4 text-white" />}
              Join comp →
            </button>
          </div>
        )}

        {/* Create org screen */}
        {orgStep === 'create' && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Comp name <span className="text-red-500">*</span></label>
              <input type="text" value={newCompName} onChange={e => setNewOrgName(e.target.value)}
                placeholder="e.g. Acme Corp"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Phone number</label>
              <input type="tel" value={ownerPhone} onChange={e => setOwnerPhone(e.target.value)}
                placeholder="+61 4XX XXX XXX"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Contact email</label>
              <input type="email" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)}
                placeholder="admin@acmecorp.com"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Logo <span className="text-gray-400 font-normal">(optional, max 2MB)</span></label>
              <div className="flex items-center gap-3">
                {logoPreview ? (
                  <img src={logoPreview} alt="Preview" className="w-12 h-12 rounded-lg object-cover border border-gray-200 flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-2xl flex-shrink-0">🏢</div>
                )}
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50">
                  {logoFile ? 'Change logo' : 'Upload logo'}
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
              </div>
            </div>
            {onboardingError && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{onboardingError}</p>}
            <button
              onClick={() => completeOnboarding(undefined, undefined, {
                name:        newCompName.trim(),
                owner_phone: ownerPhone.trim(),
                owner_email: ownerEmail.trim(),
                owner_name:  '',
                user_id:     session!.user.id,
                email:       session!.user.email ?? ownerEmail,
              })}
              disabled={onboardingLoading || !newCompName.trim()}
              className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium rounded-xl flex items-center justify-center gap-2">
              {onboardingLoading && <Spinner className="w-4 h-4 text-white" />}
              Create comp →
            </button>
          </div>
        )}
      </div>
    </div>
  )

  // ── Main login/register form ──────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-gray-50">
      <div className="max-w-sm w-full">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="TribePicks" className="h-16 w-auto"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          </div>
          <h1 className="text-xl font-semibold text-gray-900">TribePicks</h1>
          <p className="text-sm text-gray-500 mt-1">Predict every match. Beat your tribe.</p>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-6">
          {(['login','register','magic','reset'] as Mode[]).map(m => (
            <button key={m} onClick={() => { setMode(m); setError(null); setConfirmPassword('') }}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {m === 'magic' ? 'Magic link' : m === 'reset' ? 'Reset' : m === 'register' ? 'Register' : 'Sign in'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Display name <span className="text-red-500">*</span>
                </label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="GoalMaster99" maxLength={40} required
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white ${
                    name.trim().length > 0 && name.trim().length < 3
                      ? 'border-amber-400'
                      : 'border-gray-300'
                  }`} />
                {name.trim().length > 0 && name.trim().length < 3 && (
                  <p className="text-[11px] text-amber-600 mt-1">Minimum 3 characters</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  First name <span className="text-red-500">*</span>
                </label>
                <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
                  placeholder="Alex" maxLength={50} required
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
              </div>
              {/* Tournament selection — single tournament */}
              {tournaments.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Tournament <span className="text-red-500">*</span>
                  </label>
                  {tournaments.length === 1 ? (
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-green-50 border border-green-200 rounded-xl">
                      <span className="text-lg">⚽</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-green-800">{tournaments[0].name}</p>
                        {tournaments[0].start_date && (
                          <p className="text-[11px] text-green-600">
                            {new Date(tournaments[0].start_date + 'T00:00:00').toLocaleDateString('en-AU', { day:'numeric', month:'short', year:'numeric' })}
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-200 text-green-800">
                        {tournaments[0].status}
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {tournaments.map(t => (
                        <button type="button" key={t.id}
                          onClick={() => setSelectedTourn(t.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${
                            selectedTourn === t.id ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}>
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            selectedTourn === t.id ? 'border-green-500' : 'border-gray-300'
                          }`}>
                            {selectedTourn === t.id && <div className="w-2 h-2 rounded-full bg-green-500" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800">⚽ {t.name}</p>
                            {t.start_date && <p className="text-[11px] text-gray-400">
                              {new Date(t.start_date + 'T00:00:00').toLocaleDateString('en-AU', { day:'numeric', month:'short', year:'numeric' })}
                            </p>}
                          </div>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                            t.status === 'active' ? 'bg-green-200 text-green-800' : 'bg-blue-100 text-blue-700'
                          }`}>{t.status}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {!selectedTourn && tournaments.length > 1 && (
                    <p className="text-[11px] text-amber-600 mt-1.5">Select a tournament to continue</p>
                  )}
                </div>
              )}

              {/* Bonus team for selected tournament */}
              {(selectedTourn || tournaments.length === 1) && !tournamentStarted && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Bonus Team <span className="text-gray-400 font-normal">(earn 2× points in early rounds)</span>
                  </label>
                  <select value={favTeamForTourn} onChange={e => setFavTeamForTourn(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white">
                    <option value="">No Bonus team</option>
                    {(tournTeamsMap[selectedTourn || tournaments[0]?.id] ?? ALL_TEAMS).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  {favTeamForTourn && (
                    <p className="text-[11px] text-purple-600 mt-1">
                      ⭐ Double points on {favTeamForTourn} matches in Group Stage &amp; Rd of 32
                    </p>
                  )}
                </div>
              )}

            </>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
          </div>

          {(mode === 'login' || mode === 'register') && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Password</label>
              <input type="password" required minLength={8}
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'Min 8 characters' : '••••••••'}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
            </div>
          )}
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Confirm password</label>
              <input type="password" required
                value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white ${
                  confirmPassword && confirmPassword !== password
                    ? 'border-red-400 bg-red-50'
                    : confirmPassword && confirmPassword === password
                    ? 'border-green-400'
                    : 'border-gray-300'
                }`} />
              {confirmPassword && confirmPassword !== password && (
                <p className="text-[11px] text-red-600 mt-1">Passwords do not match</p>
              )}
              {confirmPassword && confirmPassword === password && (
                <p className="text-[11px] text-green-600 mt-1">✓ Passwords match</p>
              )}
            </div>
          )}

          {/* Captcha + T&C — register only */}
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Verification <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-700 whitespace-nowrap">
                    What is {captchaA} + {captchaB}?
                  </span>
                  <input
                    type="number"
                    value={captchaInput}
                    onChange={e => setCaptchaInput(e.target.value)}
                    placeholder="Answer"
                    className={`w-24 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white ${
                      captchaInput && parseInt(captchaInput) !== captchaA + captchaB
                        ? 'border-red-400'
                        : captchaInput && parseInt(captchaInput) === captchaA + captchaB
                        ? 'border-green-400'
                        : 'border-gray-300'
                    }`}
                  />
                  {captchaInput && parseInt(captchaInput) === captchaA + captchaB && (
                    <span className="text-green-600 text-sm">✓</span>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id="agree-terms"
                  checked={agreedToTerms}
                  onChange={e => setAgreedToTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-400 flex-shrink-0 cursor-pointer"
                />
                <label htmlFor="agree-terms" className="text-xs text-gray-600 cursor-pointer leading-relaxed">
                  I agree to the{' '}
                  <a href="/terms" target="_blank" rel="noopener noreferrer"
                    className="text-blue-600 underline underline-offset-1 hover:text-blue-800"
                    onClick={e => e.stopPropagation()}>
                    Terms &amp; Conditions
                  </a>
                  {' '}of TipComp. I confirm I am 18 years of age or older.
                </label>
              </div>
            </>
          )}

          {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>}

          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium rounded-xl flex items-center justify-center gap-2">
            {loading && <Spinner className="w-4 h-4 text-white" />}
            {mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Send magic link'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-4">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null) }}
            className="text-green-600 hover:text-green-700 font-medium">
            {mode === 'login' ? 'Register' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
