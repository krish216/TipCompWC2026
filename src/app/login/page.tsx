'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { Spinner } from '@/components/ui'

type Mode = 'login' | 'register' | 'magic' | 'reset'



export default function LoginPage() {
  const { supabase, session } = useSupabase()
  const router  = useRouter()
  const params  = useSearchParams()
  const redirect = params.get('redirect') ?? '/'
  const tabParam    = params.get('tab') as Mode | null
  const isChallenge = params.get('challenge') === '1'

  const [mode, setMode] = useState<Mode>(tabParam === 'register' ? 'register' : 'login')
  const [role, setRole] = useState<'tipster' | 'organiser' | null>(isChallenge ? 'tipster' : null)
  // Pre-filled from magic join link: /join?code=XXXX&email=... → /login?tab=register&code=XXXX&email=...
  const codeParam  = (params.get('code') ?? '').toUpperCase()
  const emailParam = params.get('email') ?? ''

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
  const turnstileRef                          = useRef<TurnstileInstance>(null)
  const [turnstileToken,  setTurnstileToken]  = useState<string | null>(null)
  const [tournaments,  setTournaments]  = useState<{id:string;name:string;slug:string;status:string;start_date?:string}[]>([])
  const [selectedTourn,  setSelectedTourn]  = useState<string>('')

  // Post-registration screens
  const [registered,    setRegistered]    = useState(false)  // show "check email"
  const [resendLoading, setResendLoading] = useState(false)
  const [resendSent,    setResendSent]    = useState(false)

  // Fetch active/upcoming tournaments for registration
  useEffect(() => {
    fetch('/api/tournaments')
      .then(r => r.json())
      .then(async ({ data }) => {
        const active = (data ?? []).filter((t: any) => t.is_active === true && t.status !== 'ended')
        setTournaments(active)
        if (active.length === 1) setSelectedTourn(active[0].id)
      })
      .catch(() => {})
  }, [])

  // Pre-fill email from invite link: /join?code=XXXX&email=... → /login?tab=register&code=XXXX&email=...
  useEffect(() => {
    if (emailParam) setEmail(emailParam)
  }, [emailParam])

  // When session is established, redirect to home (comp setup is handled there)
  useEffect(() => {
    if (!session) return
    router.push(redirect)
    router.refresh()
  }, [session])

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

      // Route through /auth/callback so the PKCE code exchange happens server-side
      // before the user lands on their destination. This also avoids a ?code= param
      // collision with the comp invite code on /join.
      const nextUrl = codeParam
        ? `/join?code=${codeParam}`
        : role === 'organiser'
        ? `/?flow=create`
        : `/`
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextUrl)}`

      const { data: signUpData, error } = await supabase.auth.signUp({
        email, password,
        options: {
          data: { display_name: displayName },
          emailRedirectTo: redirectTo,
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
            }),
          }).catch(() => {}) // fire-and-forget — row written before email confirmation
        }

        // Show "check your email" confirmation
        setSentMode('register'); setRegistered(true)
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
    const nextUrl = codeParam ? `/join?code=${codeParam}` : role === 'organiser' ? `/?flow=create` : `/`
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

  // ── Screen: Check email ───────────────────────────────────
  if (registered) {
    const emailScreenCopy = {
      register: {
        icon:    '📬',
        title:   'Check your email',
        body:    `We sent a verification link to`,
        detail:  isChallenge
          ? 'Your warm-up picks are saved — click the link to activate your account and lock them in!'
          : 'Click the link to activate your account, then come back here to sign in.',
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
          <p className="text-sm text-gray-500 mt-1">Predict every match. Beat your tribe.</p>
        </div>

        {/* Challenge banner — shown when arriving from /su-challenge */}
        {isChallenge && mode === 'register' && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-center">
            <p className="text-green-800 text-sm font-semibold">⚽ Your 4 warm-up picks are saved!</p>
            <p className="text-green-600 text-xs mt-0.5">Create an account to lock them into the competition</p>
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
              {/* Role selection — skip if arriving via an invite link (role is implicitly tipster) */}
              {!codeParam && (
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-2">I want to…</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { value: 'tipster',   icon: '🎯', label: 'Join a comp',     sub: 'Predict & compete' },
                      { value: 'organiser', icon: '🏆', label: 'Run my own comp', sub: 'Set up & manage'   },
                    ] as const).map(({ value, icon, label, sub }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setRole(value)}
                        className={`flex flex-col items-center gap-1 px-3 py-3 rounded-xl border-2 text-center transition-all ${
                          role === value
                            ? 'border-green-500 bg-green-50'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}>
                        <span className="text-2xl">{icon}</span>
                        <span className="text-xs font-semibold text-gray-800">{label}</span>
                        <span className="text-[10px] text-gray-400">{sub}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

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
