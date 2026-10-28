'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { Spinner } from '@/components/ui'

type Mode = 'login' | 'register' | 'magic' | 'reset'

const TIMEZONE_OPTIONS = [
  'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles', 'America/Denver',
  'America/Chicago', 'America/New_York', 'America/Sao_Paulo', 'Atlantic/Azores',
  'UTC', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
  'Africa/Johannesburg', 'Africa/Lagos', 'Asia/Dubai', 'Asia/Karachi',
  'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Singapore',
  'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Perth', 'Australia/Darwin',
  'Australia/Adelaide', 'Australia/Sydney', 'Pacific/Auckland',
]

export default function LoginPage() {
  const { supabase, session } = useSupabase()
  const router  = useRouter()
  const params  = useSearchParams()
  const redirect = params.get('redirect') ?? '/'
  const tabParam    = params.get('tab') as Mode | null
  const roleParam   = params.get('role')
  const refParam    = params.get('ref') ?? (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('tp_ref') : null) ?? null
  const isChallenge = params.get('challenge') === '1'
  const isBracket   = params.get('bracket')   === '1'
  const isOrganiser = roleParam === 'organiser'

  const [mode, setMode] = useState<Mode>('login')
  const [role, setRole] = useState<'tipster' | 'organiser' | null>(null)
  // Pre-filled from magic join link: /join?code=XXXX&email=... → /login?tab=register&code=XXXX&email=...
  // Arrived from /sweep — its "Log in" button sends /login?redirect=/sweep[?code=…], so an
  // invite code sits INSIDE redirect rather than as ?code=. Lift it out so the existing
  // sweep invite flow kicks in; and with or without one, this is a sweep signup, not a
  // football one (no tipping pitch, no EPL fixtures, no silent EPL enrolment).
  const redirectUrl = (() => { try { return new URL(redirect, 'https://tribepicks.local') } catch { return null } })()
  const fromSweep   = !!redirectUrl?.pathname.startsWith('/sweep')
  const codeParam  = (params.get('code') ?? (fromSweep ? redirectUrl?.searchParams.get('code') : null) ?? '').toUpperCase()
  const sweepBrowse = fromSweep && !codeParam
  const emailParam = params.get('email') ?? ''

  // Sync mode + role from URL params — runs on mount and whenever params change.
  // Keeping initial state as safe SSR defaults ('login', null) prevents hydration mismatches.
  // Default role is always tipster — organiser only when explicitly ?role=organiser.
  useEffect(() => {
    if (tabParam === 'register') setMode('register')
    else if (tabParam === 'magic') setMode('magic')   // survey gate deep-links here — passwordless, no recall needed
    else if (tabParam === 'login') setMode('login')
    setRole(isOrganiser ? 'organiser' : 'tipster')
  }, [tabParam, isOrganiser, isChallenge])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [sentMode, setSentMode] = useState<Mode>('register')
  const [showPassword,        setShowPassword]        = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Registration fields
  const [email,    setEmail]    = useState('')
  const [password,        setPassword]        = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name,            setName]            = useState('')
  const [firstName,       setFirstName]       = useState('')
  const [timezone,        setTimezone]        = useState('')
  const [showTzSelect,    setShowTzSelect]    = useState(false)
  const [agreedToTerms,   setAgreedToTerms]   = useState(false)
  const turnstileRef                          = useRef<TurnstileInstance>(null)
  const [turnstileToken,  setTurnstileToken]  = useState<string | null>(null)
  const [tournaments,  setTournaments]  = useState<{id:string;name:string;slug:string;status:string;start_date?:string}[]>([])
  const [selectedTourn,  setSelectedTourn]  = useState<string>('')
  // Which tournament this invite belongs to — drives the sweep-vs-football theming below
  // and which tournament the "Tournament" field shows/enrols into (declared up here since
  // the tournaments-fetch effect below reads inviteTournId).
  const [isSweep, setIsSweep] = useState(false)
  const [inviteTournId, setInviteTournId] = useState<string | null>(null)
  const sweepMode = isSweep || fromSweep
  // The upcoming sweep (e.g. Melbourne Cup) — headline for the no-invite sweep signup strip.
  const [sweepTourn, setSweepTourn] = useState<{ name: string; race_date: string | null } | null>(null)
  const [teaserFixtures, setTeaserFixtures] = useState<{id:string;home:string;away:string;kickoff_utc:string;round:string}[]>([])
  const displayNameRef = useRef<HTMLInputElement>(null)

  // Post-registration screens
  const [registered,        setRegistered]        = useState(false)  // show "check email"
  const [resendLoading,     setResendLoading]     = useState(false)
  const [resendSent,        setResendSent]        = useState(false)
  const [emailNotConfirmed, setEmailNotConfirmed] = useState(false)

  // Password reset — 6-digit code (10 min expiry) instead of a magic link. 'sent' shows
  // the code+new-password form; 'done' shows the final "sign in now" success screen.
  const [resetPhase,    setResetPhase]    = useState<'idle' | 'sent' | 'done'>('idle')
  const [resetCode,     setResetCode]     = useState('')
  const [resetNewPw,    setResetNewPw]    = useState('')
  const [resetConfirmPw, setResetConfirmPw] = useState('')

  // Signup verification — 6-digit code instead of a confirmation link. Only reached for
  // non-invite-verified registrations (see register-invited for the other case).
  const [signupCodeSent,   setSignupCodeSent]   = useState(false)
  const [signupCode,       setSignupCode]       = useState('')
  const [signupDestination, setSignupDestination] = useState('/')

  // Auto-detect timezone on mount
  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  }, [])

  // Fetch tournaments for registration. On an invite link, this MUST be the invite's own
  // tournament — not whatever's is_active — or a signup enrols into the wrong one before
  // the join step ever runs (e.g. a Melbourne Cup sweep invite showing/enrolling EPL,
  // since EPL is the only is_active=true tournament right now). Waits for inviteTournId
  // to resolve on an invite flow rather than racing ahead with the generic active list.
  useEffect(() => {
    if (codeParam && !inviteTournId) return   // invite flow — wait for the invite lookup
    // Browsing sweeps with no invite: there's no tournament to enrol into yet — they'll
    // join or create a sweep on /sweep, which handles its own enrolment.
    if (sweepBrowse) { setTournaments([]); return }
    fetch('/api/tournaments')
      .then(r => r.json())
      .then(async ({ data }) => {
        const all = (data ?? []) as any[]
        const picked = codeParam
          ? all.filter(t => t.id === inviteTournId)
          : all.filter(t => t.is_active === true && (t.status === 'upcoming' || t.status === 'active'))
        setTournaments(picked)
        if (picked.length === 1) setSelectedTourn(picked[0].id)
      })
      .catch(() => {})
  }, [codeParam, inviteTournId, sweepBrowse])

  useEffect(() => {
    if (!sweepBrowse) return
    fetch('/api/sweep/context')
      .then(r => r.json())
      .then(({ tournament }) => { if (tournament) setSweepTourn({ name: tournament.name, race_date: tournament.race_date ?? null }) })
      .catch(() => {})
  }, [sweepBrowse])

  // Fetch upcoming fixtures for the teaser — available for tipster role
  useEffect(() => {
    if (codeParam || isChallenge || fromSweep) return
    fetch('/api/fixtures')
      .then(r => r.json())
      .then(({ data }) => {
        if (!Array.isArray(data)) return
        const now = new Date()
        const upcoming = (data as any[])
          .filter(f => f.result === null && new Date(f.kickoff_utc) > now)
          .slice(0, 3)
        setTeaserFixtures(upcoming)
      })
      .catch(() => {})
  }, [])

  // Pre-fill email from invite link and auto-switch to Sign In if already registered
  const [inviteAlreadyRegistered, setInviteAlreadyRegistered] = useState(false)
  useEffect(() => {
    if (emailParam) setEmail(emailParam)
    if (emailParam && codeParam) {
      ;(async () => {
        try {
          const { data } = await supabase.from('users').select('id').ilike('email', emailParam.trim()).maybeSingle()
          if (data) { setMode('login'); setInviteAlreadyRegistered(true) }
        } catch {}
      })()
    }
  }, [emailParam, codeParam])

  // Resolve the invite's comp — see state declarations above.
  useEffect(() => {
    if (!codeParam) return
    fetch(`/api/comps?code=${codeParam}`)
      .then(r => r.json())
      .then(({ data }) => {
        setIsSweep(data?.format === 'sweep')
        setInviteTournId(data?.tournament_id ?? null)
      })
      .catch(() => {})
  }, [codeParam])

  // When session is established, redirect to destination
  useEffect(() => {
    if (!session) return
    router.push(isBracket ? '/bracket' : redirect)
    router.refresh()
  }, [session])

  // ── Handlers ──────────────────────────────────────────────

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setError(null); setEmailNotConfirmed(false)

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
      // Supabase's native recovery OTP — the "Reset Password" email template must be set
      // to show {{ .Token }} (a 6-digit code, 10-min expiry per the Auth settings) rather
      // than {{ .ConfirmationURL }} for this to actually hand the user a code to enter.
      const { error } = await supabase.auth.resetPasswordForEmail(email)
      setLoading(false)
      if (error) setError(error.message.toLowerCase().includes('rate limit')
        ? 'Too many attempts — please wait a few minutes.' : error.message)
      else setResetPhase('sent')
      return
    }

    if (mode === 'login') {
      setLoading(true)
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      setLoading(false)
      if (error) {
        if (error.message.toLowerCase().includes('email not confirmed')) {
          setEmailNotConfirmed(true)
          setError('unconfirmed')
        } else {
          setEmailNotConfirmed(false)
          setError(error.message)
        }
      }
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
      if (!turnstileToken) {
        setError('Verification not complete — please wait a moment and try again')
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

      // Where this user lands once verified — used below either as the explicit redirect
      // after OTP verification, or (invited path) left to the generic session effect.
      const destinationUrl = codeParam
        ? `/join?code=${codeParam}`
        : sweepBrowse
        ? redirect   // back to /sweep — it has its own join/create flow for both roles
        : role === 'organiser'
        ? `/?flow=create`
        : isBracket
        ? `/bracket`
        : `/`

      // If registering via an invite link, fetch comp details. If the invite link
      // also pre-filled an email, check whether that email is in comp_invitations
      // — only formally invited emails skip verification entirely.
      let inviteCompName: string | undefined
      let emailVerifiedByInvite = false
      if (codeParam) {
        const emailQuery = emailParam ? `&email=${encodeURIComponent(emailParam.trim())}` : ''
        const { data: compData } = await fetch(`/api/comps?code=${codeParam}${emailQuery}`)
          .then(r => r.json()).catch(() => ({ data: null }))
        if (compData?.name) inviteCompName = compData.name
        if (emailParam) emailVerifiedByInvite = !!compData?.email_invited
      }

      const tid = selectedTourn || tournaments[0]?.id
      const signupFlow = codeParam && emailParam ? 'invite_email' : codeParam ? 'invite_link' : isChallenge ? 'challenge' : isBracket ? 'bracket' : 'organic'

      if (emailVerifiedByInvite) {
        // Ownership already proven by the invite itself — create pre-confirmed server-side
        // via the Admin API, no OTP code needed at all.
        const { error: createErr } = await fetch('/api/auth/register-invited', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, display_name: displayName, invite_comp_name: inviteCompName, tournament_id: tid }),
        }).then(r => r.json())
        if (createErr) {
          turnstileRef.current?.reset(); setTurnstileToken(null); setLoading(false)
          setError(createErr); return
        }
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
        turnstileRef.current?.reset(); setTurnstileToken(null); setLoading(false)
        if (signInErr) { setError(signInErr.message); return }
        const newUser = signInData.user
        if (newUser) {
          await (supabase.from('users') as any).upsert({
            id: newUser.id, email: newUser.email!, display_name: displayName,
            first_name: firstName.trim() || null,
            timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            onboarding_complete: false, email_verified: true,
            ...(refParam ? { ref_source: refParam } : {}),
            role: role ?? 'tipster', signup_flow: signupFlow,
          }, { onConflict: 'id', ignoreDuplicates: false })
          // Session is already set — the generic session useEffect redirects to `redirect`.
          // Invite joins need the specific /join?code= destination instead.
          if (codeParam) router.push(destinationUrl)
        }
        return
      }

      // Normal path — Supabase's native signup OTP. The "Confirm Signup" email template
      // must show {{ .Token }} (a 6-digit code, per the Auth settings) rather than a link
      // for this to actually hand the user a code to type in.
      const { data: signUpData, error } = await supabase.auth.signUp({
        email, password,
        options: {
          data: { display_name: displayName, ...(inviteCompName ? { invite_comp_name: inviteCompName } : {}) },
          captchaToken: turnstileToken!,
        },
      })
      turnstileRef.current?.reset()
      setTurnstileToken(null)
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
          timezone:            timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          onboarding_complete: false,
          email_verified:      false,
          // Signup attribution — only written once at registration
          ...(refParam ? { ref_source: refParam } : {}),
          role:        role ?? 'tipster',
          signup_flow: signupFlow,
        }, { onConflict: 'id', ignoreDuplicates: false })

        // Enrol in selected tournament immediately — write directly to user_tournaments
        // using the admin endpoint (no session needed yet, uses service-role client)
        if (tid && newUser.id) {
          fetch('/api/user-tournaments/enrol', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id:        newUser.id,
              tournament_id:  tid,
            }),
          }).catch(() => {}) // fire-and-forget — row written before email confirmation
        }

        // If Supabase email confirmations are disabled, a session is returned
        // immediately — the session useEffect handles the redirect. Only show
        // the code-entry screen when no session (confirmation still required).
        if (!signUpData.session) {
          setSignupDestination(destinationUrl)
          setSignupCodeSent(true)
        }
      }
    }
  }

  // Password strength (register mode only)
  const passwordStrength = useMemo(() => {
    if (!password || mode !== 'register') return null
    let score = 0
    if (password.length >= 8)          score++
    if (password.length >= 12)         score++
    if (/[A-Z]/.test(password))        score++
    if (/[0-9]/.test(password))        score++
    if (/[^A-Za-z0-9]/.test(password)) score++
    if (score <= 1) return 'weak'
    if (score <= 3) return 'fair'
    return 'strong'
  }, [password, mode])

  const handleGoogleSignIn = async () => {
    setError(null); setLoading(true)
    const nextUrl = codeParam ? `/join?code=${codeParam}` : sweepBrowse ? redirect : role === 'organiser' ? `/?flow=create` : isBracket ? `/bracket` : redirect
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextUrl)}`,
      },
    })
    setLoading(false)
  }

  const handleResend = async () => {
    setResendLoading(true); setResendSent(false)
    await supabase.auth.resend({ type: 'signup', email })
    setResendSent(true); setResendLoading(false)
    setTimeout(() => setResendSent(false), 8000)
  }

  // ── Screen: enter the 6-digit reset code + new password ───
  if (resetPhase === 'sent') {
    const submitResetConfirm = async (e: React.FormEvent) => {
      e.preventDefault()
      setError(null)
      if (resetCode.trim().length !== 6) { setError('Enter the 6-digit code from your email.'); return }
      if (resetNewPw.length < 8) { setError('Password must be at least 8 characters.'); return }
      if (resetNewPw !== resetConfirmPw) { setError('Passwords don\'t match.'); return }
      setLoading(true)
      // Verifying a recovery OTP establishes a recovery session — updateUser can then set
      // the new password while that session is active. Both native Supabase Auth calls.
      const { error: verifyErr } = await supabase.auth.verifyOtp({ email, token: resetCode.trim(), type: 'recovery' })
      if (verifyErr) {
        setLoading(false)
        setError(verifyErr.message.toLowerCase().includes('expired') || verifyErr.message.toLowerCase().includes('invalid')
          ? 'That code isn\'t right or has expired — check your email and try again.' : verifyErr.message)
        return
      }
      const { error: updateErr } = await supabase.auth.updateUser({ password: resetNewPw })
      setLoading(false)
      if (updateErr) setError(updateErr.message)
      else setResetPhase('done')
    }

    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-gray-50">
        <div className="max-w-sm w-full">
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">🔐</div>
            <h1 className="text-xl font-semibold text-gray-900">Enter your code</h1>
            <p className="text-sm text-gray-500 mt-1">We sent a 6-digit code to <strong>{email}</strong> — it expires in 10 minutes.</p>
          </div>
          <form onSubmit={submitResetConfirm} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">6-digit code</label>
              <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} required
                value={resetCode} onChange={e => setResetCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full px-3 py-2 text-center text-lg tracking-[0.5em] font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">New password</label>
              <input type="password" required minLength={8} autoComplete="new-password"
                value={resetNewPw} onChange={e => setResetNewPw(e.target.value)}
                placeholder="Min 8 characters"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Confirm new password</label>
              <input type="password" required minLength={8} autoComplete="new-password"
                value={resetConfirmPw} onChange={e => setResetConfirmPw(e.target.value)}
                placeholder="Re-enter your password"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
            </div>
            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl">
              {loading ? 'Resetting…' : 'Reset password'}
            </button>
            <button type="button" onClick={() => { setResetPhase('idle'); setError(null); setResetCode(''); setResetNewPw(''); setResetConfirmPw('') }}
              className="w-full text-xs text-gray-500 hover:text-gray-700 text-center">
              Didn't get a code? Try a different email
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ── Screen: reset done ─────────────────────────────────────
  if (resetPhase === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
        <div className="max-w-sm w-full text-center">
          <div className="text-6xl mb-5">✅</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Password updated</h1>
          <p className="text-sm text-gray-500 mb-6">Sign in with your new password.</p>
          <button onClick={() => { setResetPhase('idle'); setMode('login'); setPassword('') }}
            className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-xl">
            Back to sign in
          </button>
        </div>
      </div>
    )
  }

  // ── Screen: enter the 6-digit signup verification code ────
  if (signupCodeSent) {
    const submitSignupCode = async (e: React.FormEvent) => {
      e.preventDefault()
      setError(null)
      if (signupCode.trim().length !== 6) { setError('Enter the 6-digit code from your email.'); return }
      setLoading(true)
      const { error: verifyErr } = await supabase.auth.verifyOtp({ email, token: signupCode.trim(), type: 'signup' })
      if (verifyErr) {
        setLoading(false)
        setError(verifyErr.message.toLowerCase().includes('expired') || verifyErr.message.toLowerCase().includes('invalid')
          ? 'That code isn\'t right or has expired — check your email and try again.' : verifyErr.message)
        return
      }
      // verifyOtp already established the session — sync the DB flag + welcome email
      // (best-effort; the redirect shouldn't wait on it), then go to the real destination.
      fetch('/api/auth/verify-signup', { method: 'POST' }).catch(() => {})
      setLoading(false)
      router.push(signupDestination)
      router.refresh()
    }

    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-gray-50">
        <div className="max-w-sm w-full">
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">📬</div>
            <h1 className="text-xl font-semibold text-gray-900">Verify your email</h1>
            <p className="text-sm text-gray-500 mt-1">We sent a 6-digit code to <strong>{email}</strong> — it expires in 10 minutes.</p>
          </div>
          <form onSubmit={submitSignupCode} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">6-digit code</label>
              <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} required
                value={signupCode} onChange={e => setSignupCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full px-3 py-2 text-center text-lg tracking-[0.5em] font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
            </div>
            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl">
              {loading ? 'Verifying…' : 'Verify & continue'}
            </button>
            <button type="button" onClick={handleResend} disabled={resendLoading}
              className="w-full text-xs text-gray-500 hover:text-gray-700 text-center disabled:opacity-50">
              {resendLoading ? 'Sending…' : resendSent ? 'Code resent ✓' : "Didn't get a code? Resend"}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ── Screen: Check email ───────────────────────────────────
  if (registered) {
    const emailScreenCopy = {
      register: {
        icon:    '📬',
        title:   'Check your email',
        body:    `We sent a verification link to`,
        detail:  isChallenge
          ? 'Your warm-up picks are saved — click the link to verify your account and lock them in!'
          : isOrganiser
          ? "Click the link to verify your account — you'll be taken straight to comp creation."
          : codeParam
          ? "Click the link to verify your account — you'll be automatically added to the comp and can start tipping straight away!"
          : "Click the link to verify your account. You can already sign in and start using TribePicks!",
        warning: false,
      },
      magic: {
        icon:    '✨',
        title:   'Magic link sent!',
        body:    `We sent a sign-in link to`,
        detail:  'Click the link to sign in instantly — it expires in 10 minutes.',
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
          <div className="mt-4 space-y-1.5">
            <p className="text-xs text-gray-400">Didn't receive it? Check your spam folder.</p>
            {sentMode === 'register' && (
              resendSent ? (
                <p className="text-xs text-green-600 font-medium">✓ Verification email resent!</p>
              ) : (
                <button
                  onClick={handleResend}
                  disabled={resendLoading}
                  className="text-xs text-green-600 hover:text-green-700 font-medium disabled:opacity-50 flex items-center justify-center gap-1 mx-auto">
                  {resendLoading && <Spinner className="w-3 h-3" />}
                  Resend verification email
                </button>
              )
            )}
          </div>
        </div>
      </div>
    )
  }

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
          <p className="text-sm text-gray-500 mt-1">
            {sweepMode
              ? 'The home of exciting Sweepstakes'
              : isOrganiser && mode === 'register' ? 'Set up a comp for your group.' : 'Predict every match. Beat your tribe.'}
          </p>
        </div>

        {/* Tipster value strip + fixture teaser — tipster role, not an invite or challenge */}
        {/* Sweep pitch — came from /sweep without an invite (both roles) */}
        {mode === 'register' && sweepBrowse && (
          <div className="mb-4 px-4 py-3.5 rounded-xl bg-amber-50 border border-amber-200">
            <p className="text-amber-900 text-sm font-bold mb-2">
              🐎 {sweepTourn ? sweepTourn.name.replace(/\s*\d{4}$/, '') : 'Race day'} sweeps
              {sweepTourn?.race_date && ` · ${new Date(`${sweepTourn.race_date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}`}
            </p>
            <ul className="space-y-1.5">
              {(role === 'organiser'
                ? [
                    'Set up a sweep for your group in a minute',
                    'Share one link — people buy tickets, you approve payments',
                    'The wheel draws horses fairly; winners are worked out for you',
                  ]
                : [
                    "Draw a horse — no tipping or form guide needed",
                    "Join your group's sweep with their invite link, or browse open sweeps",
                    'Whoever draws the 1st, 2nd or 3rd placed horse wins',
                  ]
              ).map(item => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-amber-600 font-bold text-xs mt-0.5 flex-shrink-0">✓</span>
                  <span className="text-amber-900 text-xs">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {mode === 'register' && role === 'tipster' && !codeParam && !isChallenge && !fromSweep && (
          <div className="mb-4 px-4 py-3.5 rounded-xl bg-green-50 border border-green-200">
            <p className="text-green-900 text-sm font-bold mb-2">🎯 Tip every match. Beat your tribe.</p>
            <ul className="space-y-1.5 mb-3">
              {[
                'Predict every match from Group Stage to the Final',
                'Private leaderboard — compete with your group only',
                'Automatic scoring as results come in',
              ].map(item => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-green-500 font-bold text-xs mt-0.5 flex-shrink-0">✓</span>
                  <span className="text-green-800 text-xs">{item}</span>
                </li>
              ))}
            </ul>
            {teaserFixtures.length > 0 && (
              <div className="border-t border-green-200 pt-2.5 space-y-1.5">
                <p className="text-[10px] font-semibold text-green-600 uppercase tracking-wide">Coming up — sign up to tip</p>
                {teaserFixtures.map(f => (
                  <div key={f.id} className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-green-900">{f.home} vs {f.away}</p>
                    <p className="text-[11px] text-green-600 flex-shrink-0">
                      {new Date(f.kickoff_utc).toLocaleString('en-AU', {
                        weekday: 'short', day: 'numeric', month: 'short',
                        hour: '2-digit', minute: '2-digit',
                        timeZone: timezone || 'UTC',
                      })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Organiser pitch — organiser role, not an invite */}
        {mode === 'register' && role === 'organiser' && !codeParam && !fromSweep && (
          <div className="mb-4 px-4 py-3.5 rounded-xl bg-blue-50 border border-blue-200">
            <p className="text-blue-900 text-sm font-bold mb-2">🏆 Run your group's World Cup comp</p>
            <ul className="space-y-1.5 mb-3">
              {[
                'Invite your group via a single WhatsApp link',
                'Automatic scoring — no spreadsheets',
                'See who\'s tipped and send nudges',
              ].map(item => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-blue-500 font-bold text-xs mt-0.5 flex-shrink-0">✓</span>
                  <span className="text-blue-800 text-xs">{item}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2">
              {['Create account', 'Set up comp', 'Invite friends'].map((s, i) => (
                <div key={s} className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-black flex items-center justify-center flex-shrink-0">{i + 1}</span>
                  <span className="text-[11px] font-semibold text-blue-800">{s}</span>
                  {i < 2 && <span className="text-blue-300 text-[10px]">→</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Challenge banner — shown when arriving from /su-challenge */}
        {isChallenge && mode === 'register' && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-center">
            <p className="text-green-800 text-sm font-semibold">⚽ Your 4 warm-up picks are saved!</p>
            <p className="text-green-600 text-xs mt-0.5">Create an account to save your picks — warm-up points reset when the tournament begins</p>
          </div>
        )}

        {/* Bracket banner — shown when arriving from /bracket */}
        {isBracket && mode === 'register' && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
            <p className="text-emerald-800 text-sm font-semibold">🏆 Your bracket picks are saved!</p>
            <p className="text-emerald-600 text-xs mt-0.5">Create a free account to keep them — you'll be taken straight back to your bracket.</p>
          </div>
        )}

        {/* Invite banner — shown when arriving from a comp invite link */}
        {codeParam && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 text-center">
            <p className="text-blue-800 text-sm font-semibold">
              {isSweep ? '🔑 You\'ve been invited to a Sweepstake Comp!' : '🔑 You\'ve been invited to a comp!'}
            </p>
            {inviteAlreadyRegistered
              ? <p className="text-blue-600 text-xs mt-0.5">Your email is already registered — sign in below to accept your invite.</p>
              : <p className="text-blue-600 text-xs mt-0.5">Already have an account? <button type="button" onClick={() => setMode('login')} className="font-semibold underline">Sign in</button> to accept your invite.</p>
            }
          </div>
        )}

        {/* Tipster teaser — static preview shown alongside comp invite */}
        {codeParam && (
          <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 pt-2.5 pb-2">
              Here's how it works
            </p>

            {isSweep ? (
              <>
                {/* Mock — your horse, revealed */}
                <div className="mx-3 mb-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 flex items-center gap-2">
                  <span className="text-base flex-shrink-0">🐎</span>
                  <div className="flex-1">
                    <p className="text-[10px] text-green-600 font-semibold uppercase tracking-wide">Your horse</p>
                    <p className="text-[11px] font-bold text-green-900">#7 Media Package</p>
                  </div>
                  <span className="text-[10px] font-bold text-green-700 bg-green-100 rounded px-1.5 py-0.5 flex-shrink-0 whitespace-nowrap">🎟️ Entered</span>
                </div>

                {/* Mock — spin to pick, not yet drawn */}
                <div className="mx-3 mb-3 rounded-lg border border-gray-200 bg-white px-3 py-2 flex items-center gap-2 opacity-55">
                  <span className="text-base flex-shrink-0">🎡</span>
                  <div className="flex-1">
                    <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">Spin the wheel</p>
                    <p className="text-[11px] font-medium text-gray-400">Tap to claim your horse</p>
                  </div>
                  <span className="text-[10px] text-gray-400 flex-shrink-0">Spin →</span>
                </div>

                {/* Mini draw list */}
                <div className="border-t border-gray-100 px-3 py-2 flex items-center gap-4">
                  {([{ name: 'GoalMaster99', horse: '#3 Vauban' }, { name: 'You', horse: '#7 Media Package' }] as const).map(r => (
                    <div key={r.name} className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-semibold ${r.name === 'You' ? 'text-blue-700' : 'text-gray-600'}`}>{r.name}</span>
                      <span className={`text-[10px] ${r.name === 'You' ? 'text-blue-500' : 'text-gray-400'}`}>{r.horse}</span>
                    </div>
                  ))}
                  <span className="text-[9px] text-gray-400 ml-auto">Private pool</span>
                </div>
              </>
            ) : (
              <>
                {/* Mock fixture — correct prediction */}
                <div className="mx-3 mb-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 flex items-center gap-2">
                  <span className="text-base flex-shrink-0">🇧🇷</span>
                  <div className="flex gap-1.5 flex-1">
                    {([['Brazil', true], ['Draw', false], ['Argentina', false]] as const).map(([label, selected]) => (
                      <div key={label} className={`flex-1 flex flex-col items-center rounded-lg py-1.5 border text-[10px] font-medium transition-colors
                        ${selected ? 'bg-white border-green-400 text-green-800' : 'bg-white/60 border-gray-200 text-gray-400'}`}>
                        <div className={`w-3 h-3 rounded-full border mb-0.5 flex-shrink-0
                          ${selected ? 'border-green-500 bg-green-500' : 'border-gray-300'}`} />
                        {label}
                      </div>
                    ))}
                  </div>
                  <span className="text-base flex-shrink-0">🇦🇷</span>
                  <span className="ml-1 text-[10px] font-bold text-green-700 bg-green-100 rounded px-1.5 py-0.5 flex-shrink-0 whitespace-nowrap">✓ 3 pts</span>
                </div>

                {/* Mock fixture — not yet tipped */}
                <div className="mx-3 mb-3 rounded-lg border border-gray-200 bg-white px-3 py-2 flex items-center gap-2 opacity-55">
                  <span className="text-base flex-shrink-0">🇫🇷</span>
                  <div className="flex gap-1.5 flex-1">
                    {['France', 'Draw', 'Germany'].map(label => (
                      <div key={label} className="flex-1 flex flex-col items-center rounded-lg py-1.5 border border-gray-200 text-[10px] font-medium text-gray-400">
                        <div className="w-3 h-3 rounded-full border border-gray-300 mb-0.5" />
                        {label}
                      </div>
                    ))}
                  </div>
                  <span className="text-base flex-shrink-0">🇩🇪</span>
                  <span className="ml-1 text-[10px] text-gray-400 flex-shrink-0">Tip →</span>
                </div>

                {/* Mini leaderboard */}
                <div className="border-t border-gray-100 px-3 py-2 flex items-center gap-4">
                  {([{ pos: 1, name: 'GoalMaster99', pts: 9 }, { pos: 2, name: 'You', pts: 3 }] as const).map(r => (
                    <div key={r.pos} className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-black ${r.name === 'You' ? 'text-blue-600' : 'text-gray-400'}`}>#{r.pos}</span>
                      <span className={`text-[10px] font-semibold ${r.name === 'You' ? 'text-blue-700' : 'text-gray-600'}`}>{r.name}</span>
                      <span className={`text-[10px] ${r.name === 'You' ? 'text-blue-500' : 'text-gray-400'}`}>{r.pts} pts</span>
                    </div>
                  ))}
                  <span className="text-[9px] text-gray-400 ml-auto">Private leaderboard</span>
                </div>
              </>
            )}
          </div>
        )}

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

        {/* Google sign-in — available on Sign in + Register tabs */}
        {(mode === 'login' || mode === 'register') && (
          <div className="mb-4">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 bg-white border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition-colors shadow-sm">
              {/* Google G logo */}
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.46 14.013 17.64 11.79 17.64 9.2z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
                <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.96L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>
            <div className="flex items-center gap-3 mt-4 mb-1">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-[11px] text-gray-400 font-medium">or</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          {mode === 'register' && (
            <>
              {/* Role radio — only when no explicit role in URL; hidden for invites + challenges */}
              {!roleParam && !codeParam && !isChallenge && (
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-2">I want to…</p>
                  <div className="flex gap-2">
                    {([
                      { value: 'tipster',   icon: sweepBrowse ? '🐎' : '🎯', label: sweepBrowse ? 'Join a sweep' : 'Join a Tipping comp', activeClass: 'border-green-500 bg-green-50', dotClass: 'border-green-500 bg-green-500' },
                      { value: 'organiser', icon: '🏆', label: sweepBrowse ? 'Run a sweep' : 'Run a comp',  activeClass: 'border-blue-500 bg-blue-50',  dotClass: 'border-blue-500 bg-blue-500'  },
                    ] as const).map(({ value, icon, label, activeClass, dotClass }) => (
                      <label key={value} className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl border-2 cursor-pointer transition-all ${
                        role === value ? activeClass : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}>
                        <input type="radio" name="role" value={value} checked={role === value}
                          onChange={() => { setRole(value); setTimeout(() => displayNameRef.current?.focus(), 0) }} className="sr-only" />
                        <span className="text-base leading-none">{icon}</span>
                        <span className="text-xs font-semibold text-gray-800 flex-1">{label}</span>
                        <span className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 transition-all ${
                          role === value ? dotClass : 'border-gray-300'
                        }`}>
                          {role === value && (
                            <span className="flex items-center justify-center w-full h-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-white block" />
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Display name <span className="text-red-500">*</span>
                </label>
                <input type="text" value={name} ref={displayNameRef}
                  onChange={e => setName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                  placeholder="GoalMaster99" maxLength={40} required
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white ${
                    name.trim().length > 0 && name.trim().length < 3
                      ? 'border-amber-400'
                      : 'border-gray-300'
                  }`} />
                {name.trim().length > 0 && name.trim().length < 3 && (
                  <p className="text-[11px] text-amber-600 mt-1">Minimum 3 characters</p>
                )}
                <p className="text-[11px] text-gray-400 mt-1">A fun username shown on scoreboards and Tip Sheets. Letters, numbers and underscores only.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  First name <span className="text-red-500">*</span>
                </label>
                <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
                  placeholder="Alex" maxLength={50} required
                  autoComplete="given-name"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
                <p className="text-[11px] text-gray-400 mt-1">Personalises your experience — not visible to other players.</p>
              </div>

              {/* Timezone — auto-detected, changeable */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Timezone</label>
                {!showTzSelect ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                    <span className="text-sm text-gray-700 flex-1 truncate">📍 {timezone || 'Detecting…'}</span>
                    <button type="button" onClick={() => setShowTzSelect(true)}
                      className="text-xs text-green-600 hover:text-green-700 font-medium flex-shrink-0">
                      Change
                    </button>
                  </div>
                ) : (
                  <select
                    value={timezone}
                    onChange={e => { setTimezone(e.target.value); setShowTzSelect(false) }}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white">
                    {TIMEZONE_OPTIONS.map(tz => (
                      <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                )}
                <p className="text-[11px] text-gray-400 mt-1">To help you view match times in your timezone.</p>
              </div>
              {/* Tournament selection — single tournament */}
              {tournaments.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Tournament <span className="text-red-500">*</span>
                  </label>
                  {tournaments.length === 1 ? (
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-green-50 border border-green-200 rounded-xl">
                      <span className="text-lg">{isSweep ? '🐎' : '⚽'}</span>
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


            </>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
            {mode === 'register' && (
              <p className="text-[11px] text-gray-400 mt-1">Used to log in and for reminders &amp; notifications.</p>
            )}
          </div>

          {(mode === 'login' || mode === 'register') && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} required minLength={8}
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'Min 8 characters' : '••••••••'}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  className="w-full px-3 py-2 pr-10 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-medium">
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {/* Strength indicator — register only */}
              {mode === 'register' && password && passwordStrength && (
                <div className="mt-1.5">
                  <div className="flex gap-1 mb-1">
                    {(['weak','fair','strong'] as const).map((level, i) => {
                      const active = passwordStrength === 'weak' ? i < 1 : passwordStrength === 'fair' ? i < 2 : i < 3
                      return (
                        <div key={level} className={`flex-1 h-1 rounded-full transition-colors ${
                          active
                            ? passwordStrength === 'weak'  ? 'bg-red-400'
                            : passwordStrength === 'fair'  ? 'bg-amber-400'
                            : 'bg-green-500'
                            : 'bg-gray-200'
                        }`} />
                      )
                    })}
                  </div>
                  <p className={`text-[11px] font-medium ${
                    passwordStrength === 'weak' ? 'text-red-500' : passwordStrength === 'fair' ? 'text-amber-500' : 'text-green-600'
                  }`}>
                    {passwordStrength === 'weak' ? 'Weak — add uppercase, numbers or symbols' : passwordStrength === 'fair' ? 'Fair — make it longer or add symbols' : 'Strong'}
                  </p>
                </div>
              )}
            </div>
          )}
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Confirm password</label>
              <div className="relative">
                <input type={showConfirmPassword ? 'text' : 'password'} required
                  value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  className={`w-full px-3 py-2 pr-10 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white ${
                    confirmPassword && confirmPassword !== password
                      ? 'border-red-400 bg-red-50'
                      : confirmPassword && confirmPassword === password
                      ? 'border-green-400'
                      : 'border-gray-300'
                  }`} />
                <button type="button" onClick={() => setShowConfirmPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-medium">
                  {showConfirmPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {confirmPassword && confirmPassword !== password && (
                <p className="text-[11px] text-red-600 mt-1">Passwords do not match</p>
              )}
              {confirmPassword && confirmPassword === password && (
                <p className="text-[11px] text-green-600 mt-1">✓ Passwords match</p>
              )}
            </div>
          )}

          {/* Turnstile + T&C — register only */}
          {mode === 'register' && (
            <>
              <Turnstile
                ref={turnstileRef}
                siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '1x00000000000000000000AA'}
                options={{ size: 'invisible' }}
                onSuccess={token => setTurnstileToken(token)}
                onError={() => setError('Verification failed — please refresh and try again')}
                onExpire={() => setTurnstileToken(null)}
              />

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
                  {' '}of TribePicks. I confirm I am 18 years of age or older.
                </label>
              </div>
            </>
          )}

          {error && (
            emailNotConfirmed ? (
              <div className="px-3 py-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1.5">
                <p>Please check your inbox or spam for the <strong>TribePicks signup confirmation email</strong> we sent you, before continuing.</p>
                <p>
                  {"You can resend the email from this page if you didn't receive it. "}
                  {resendSent ? (
                    <span className="text-green-700 font-medium">✓ Confirmation email resent!</span>
                  ) : (
                    <button type="button" onClick={handleResend} disabled={resendLoading}
                      className="font-semibold text-green-700 hover:text-green-800 underline disabled:opacity-50 inline-flex items-center gap-1">
                      {resendLoading && <Spinner className="w-3 h-3" />}
                      Resend confirmation email
                    </button>
                  )}
                </p>
              </div>
            ) : (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>
            )
          )}

          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium rounded-xl flex items-center justify-center gap-2">
            {loading && <Spinner className="w-4 h-4 text-white" />}
            {mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : mode === 'reset' ? 'Send reset code' : 'Send magic link'}
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
