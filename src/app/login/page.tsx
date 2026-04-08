'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { Spinner } from '@/components/ui'
import { TIMEZONES, COUNTRIES, detectTimezone, getTimezonesForCountry } from '@/lib/timezone'

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
  const redirect = params.get('redirect') ?? '/predict'
  const tabParam = params.get('tab') as Mode | null

  const [mode,     setMode]     = useState<Mode>(tabParam === 'register' ? 'register' : 'login')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  // Registration fields
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [name,     setName]     = useState('')
  const [country,  setCountry]  = useState('')
  const [timezone, setTimezone] = useState('UTC')
  const [favTeam,  setFavTeam]  = useState('')

  // Post-registration screens
  const [registered, setRegistered] = useState(false)  // show "check email"

  // Post-login onboarding (first login after verification)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [orgStep,    setOrgStep]    = useState<OrgStep>('choose')
  const [onboardingLoading, setOnboardingLoading] = useState(false)
  const [onboardingError,   setOnboardingError]   = useState<string | null>(null)
  const [onboardingUserId,  setOnboardingUserId]  = useState<string | null>(null)

  // Org join fields
  const [orgCode,    setOrgCode]    = useState('')
  const [orgLookup,  setOrgLookup]  = useState<{id:string;name:string} | null>(null)
  const [orgCodeErr, setOrgCodeErr] = useState<string | null>(null)
  const [lookingUp,  setLookingUp]  = useState(false)

  // Org create fields
  const [newOrgName,  setNewOrgName]  = useState('')
  const [ownerPhone,  setOwnerPhone]  = useState('')
  const [ownerEmail,  setOwnerEmail]  = useState('')
  const [logoFile,    setLogoFile]    = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const tournamentStarted = Date.now() >= TOURNAMENT_KICKOFF.getTime()

  useEffect(() => { setTimezone(detectTimezone()) }, [])

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
      else setRegistered(true)  // reuse "check email" screen for magic link
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
      else setRegistered(true)
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
      setLoading(true)
      const displayName = name.trim() || email.split('@')[0]

      // Check display name uniqueness
      const { data: nameCheck } = await supabase
        .from('users').select('id').ilike('display_name', displayName).single()
      if (nameCheck) {
        setError(`Display name "${displayName}" is already taken — please choose another`)
        setLoading(false)
        return
      }

      // Check email uniqueness (Supabase auth will also catch this, but gives a nicer message)
      const { data: emailCheck } = await supabase
        .from('users').select('id').ilike('email', email.trim()).single()
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
        // Upsert user row — PUBLIC org by default, onboarding_complete = false
        const { data: publicOrg } = await supabase
          .from('organisations').select('id').eq('slug', 'public').single()
        await supabase.from('users').upsert({
          id:                  newUser.id,
          email:               newUser.email!,
          display_name:        displayName,
          favourite_team:      favTeam || null,
          country:             country || null,
          timezone:            timezone || 'UTC',
          org_id:              (publicOrg as any)?.id ?? null,
          onboarding_complete: false,
        }, { onConflict: 'id', ignoreDuplicates: false })

        // Show "check your email" confirmation
        setRegistered(true)
      }
    }
  }

  // ── Onboarding: look up org code ──────────────────────────
  const lookupOrgCode = async () => {
    setLookingUp(true); setOrgCodeErr(null); setOrgLookup(null)
    const res = await fetch(`/api/organisations?code=${orgCode}`)
    const { data, error } = await res.json()
    setLookingUp(false)
    if (error || !data) setOrgCodeErr('Code not found — check with your tournament admin')
    else setOrgLookup(data)
  }

  // ── Onboarding: complete (marks onboarding_complete = true) ─
  const completeOnboarding = async (orgId?: string, inviteCode?: string, createPayload?: any) => {
    setOnboardingLoading(true); setOnboardingError(null)
    try {
      if (orgId && inviteCode) {
        // Join existing org
        const res = await fetch('/api/org-admins/self-register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ org_id: orgId, invite_code: inviteCode }),
        })
        const { success, error } = await res.json()
        if (!success) { setOnboardingError(error ?? 'Failed to join organisation'); setOnboardingLoading(false); return }
      }

      if (createPayload) {
        // Create new org
        const res = await fetch('/api/organisations/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createPayload),
        })
        const { data: org, error: orgErr } = await res.json()
        if (orgErr || !org) { setOnboardingError(orgErr ?? 'Failed to create organisation'); setOnboardingLoading(false); return }

        // Upload logo
        if (logoFile && session?.user.id) {
          const ext  = logoFile.name.split('.').pop()
          const path = `${session.user.id}/logo.${ext}`
          const { data: uploaded } = await supabase.storage
            .from('org-logos').upload(path, logoFile, { upsert: true })
          if (uploaded) {
            const { data: urlData } = supabase.storage.from('org-logos').getPublicUrl(path)
            await fetch('/api/organisations/create', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ org_id: org.id, logo_url: urlData.publicUrl, user_id: session.user.id }),
            })
          }
        }
      }

      // Mark onboarding complete
      await supabase.from('users')
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
  if (registered) return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="max-w-sm w-full text-center">
        <div className="text-6xl mb-5">📬</div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Check your email</h1>
        <p className="text-sm text-gray-600 mb-2">
          We sent a verification link to <strong>{email}</strong>.
        </p>
        <p className="text-sm text-gray-500 mb-6">
          Click the link in the email to verify your account, then come back here to sign in.
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left mb-6">
          <p className="text-xs font-semibold text-amber-800 mb-1">⚠️ Don't skip this step</p>
          <p className="text-xs text-amber-700">You won't be able to sign in until your email is verified.</p>
        </div>
        <button onClick={() => { setRegistered(false); setMode('login'); setError(null) }}
          className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-xl">
          Back to sign in
        </button>
        <p className="text-xs text-gray-400 mt-4">Didn't receive it? Check your spam folder.</p>
      </div>
    </div>
  )

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
            {orgStep === 'choose' ? "Welcome to TipComp 2026!" : orgStep === 'join' ? 'Join an organisation' : 'Create an organisation'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {orgStep === 'choose'
              ? 'Set up your organisation to compete with your group'
              : orgStep === 'join'
              ? 'Enter the code shared by your tournament admin'
              : 'Register your organisation for the tournament'}
          </p>
        </div>

        {/* Choose screen */}
        {orgStep === 'choose' && (
          <div className="space-y-3">
            <button onClick={() => setOrgStep('join')}
              className="w-full flex items-center gap-4 bg-white border-2 border-gray-200 hover:border-green-400 rounded-xl p-4 text-left transition-colors">
              <span className="text-2xl">🔑</span>
              <div>
                <p className="text-sm font-semibold text-gray-900">Join an organisation</p>
                <p className="text-xs text-gray-500 mt-0.5">I have an invite code from my tournament admin</p>
              </div>
            </button>
            <button onClick={() => setOrgStep('create')}
              className="w-full flex items-center gap-4 bg-white border-2 border-gray-200 hover:border-green-400 rounded-xl p-4 text-left transition-colors">
              <span className="text-2xl">✨</span>
              <div>
                <p className="text-sm font-semibold text-gray-900">Create an organisation</p>
                <p className="text-xs text-gray-500 mt-0.5">Set up a new org for my company or group</p>
              </div>
            </button>
            <button onClick={() => completeOnboarding()}
              disabled={onboardingLoading}
              className="w-full flex items-center gap-4 bg-white border-2 border-gray-200 hover:border-gray-300 rounded-xl p-4 text-left transition-colors disabled:opacity-50">
              <span className="text-2xl">🌍</span>
              <div>
                <p className="text-sm font-semibold text-gray-900">Continue with Public</p>
                <p className="text-xs text-gray-500 mt-0.5">Join the public competition — anyone can see your results</p>
              </div>
              {onboardingLoading && <Spinner className="w-4 h-4 ml-auto" />}
            </button>
          </div>
        )}

        {/* Join org screen */}
        {orgStep === 'join' && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Organisation code</label>
              <div className="flex gap-2">
                <input type="text" value={orgCode}
                  onChange={e => { setOrgCode(e.target.value.toUpperCase()); setOrgLookup(null); setOrgCodeErr(null) }}
                  placeholder="e.g. ACME1234" maxLength={8}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg font-mono uppercase focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
                <button type="button" onClick={lookupOrgCode}
                  disabled={lookingUp || orgCode.length < 6}
                  className="px-3 py-2 text-xs font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50">
                  {lookingUp ? <Spinner className="w-3 h-3" /> : 'Verify'}
                </button>
              </div>
              {orgLookup && <p className="text-[11px] text-green-700 mt-1.5">✓ <strong>{orgLookup.name}</strong> — you'll be added as org admin</p>}
              {orgCodeErr && <p className="text-[11px] text-red-600 mt-1.5">{orgCodeErr}</p>}
            </div>
            {onboardingError && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{onboardingError}</p>}
            <button
              onClick={() => orgLookup && completeOnboarding(orgLookup.id, orgCode)}
              disabled={onboardingLoading || !orgLookup}
              className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium rounded-xl flex items-center justify-center gap-2">
              {onboardingLoading && <Spinner className="w-4 h-4 text-white" />}
              Join organisation →
            </button>
          </div>
        )}

        {/* Create org screen */}
        {orgStep === 'create' && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Organisation name <span className="text-red-500">*</span></label>
              <input type="text" value={newOrgName} onChange={e => setNewOrgName(e.target.value)}
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
                name:        newOrgName.trim(),
                owner_phone: ownerPhone.trim(),
                owner_email: ownerEmail.trim(),
                owner_name:  '',
                user_id:     session!.user.id,
                email:       session!.user.email ?? ownerEmail,
              })}
              disabled={onboardingLoading || !newOrgName.trim()}
              className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium rounded-xl flex items-center justify-center gap-2">
              {onboardingLoading && <Spinner className="w-4 h-4 text-white" />}
              Create organisation →
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
          <div className="text-4xl mb-3">⚽</div>
          <h1 className="text-xl font-semibold text-gray-900">TipComp 2026</h1>
          <p className="text-sm text-gray-500 mt-1">Predict every match. Beat your tribe.</p>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-6">
          {(['login','register','magic','reset'] as Mode[]).map(m => (
            <button key={m} onClick={() => { setMode(m); setError(null) }}
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
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Display name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="GoalMaster99" maxLength={40}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Country</label>
                <select value={country} onChange={e => {
                    setCountry(e.target.value)
                    const tzs = getTimezonesForCountry(e.target.value)
                    if (tzs.length > 0 && tzs.length < TIMEZONES.length) setTimezone(tzs[0].value)
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white">
                  <option value="">Select your country</option>
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Timezone</label>
                <select value={timezone} onChange={e => setTimezone(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white">
                  {getTimezonesForCountry(country).map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                </select>
              </div>
              {!tournamentStarted && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Favourite team <span className="text-gray-400 font-normal">(earn 2× points)</span>
                  </label>
                  <select value={favTeam} onChange={e => setFavTeam(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white">
                    <option value="">Select a team (optional)</option>
                    {ALL_TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
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
