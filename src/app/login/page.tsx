'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { Spinner } from '@/components/ui'
import { TIMEZONES, COUNTRIES, detectTimezone } from '@/lib/timezone'

type Mode     = 'login' | 'register' | 'magic' | 'reset'
type RegStep  = 'account' | 'org'   // two-step registration

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
  const { supabase } = useSupabase()
  const router  = useRouter()
  const params  = useSearchParams()
  const redirect  = params.get('redirect') ?? '/predict'
  const tabParam  = params.get('tab') as Mode | null

  const [mode,        setMode]        = useState<Mode>(tabParam === 'register' ? 'register' : 'login')
  const [regStep,     setRegStep]     = useState<RegStep>('account')

  // Account fields
  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [name,        setName]        = useState('')
  const [country,     setCountry]     = useState('')
  const [timezone,    setTimezone]    = useState('UTC')
  const [favTeam,     setFavTeam]     = useState('')

  // Org choice
  const [orgChoice,   setOrgChoice]   = useState<'public' | 'join' | 'create'>('public')

  // Join existing org by code
  const [orgCode,     setOrgCode]     = useState('')
  const [orgLookup,   setOrgLookup]   = useState<{id:string;name:string} | null>(null)
  const [orgCodeErr,  setOrgCodeErr]  = useState<string | null>(null)
  const [lookingUp,   setLookingUp]   = useState(false)

  // Create new org
  const [newOrgName,  setNewOrgName]  = useState('')
  const [ownerName,   setOwnerName]   = useState('')
  const [ownerPhone,  setOwnerPhone]  = useState('')
  const [ownerEmail,  setOwnerEmail]  = useState('')
  const [logoFile,    setLogoFile]    = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [magicSent,   setMagicSent]   = useState(false)
  const [resetSent,   setResetSent]   = useState(false)
  const [newUserId,   setNewUserId]   = useState<string | null>(null)

  const tournamentStarted = Date.now() >= TOURNAMENT_KICKOFF.getTime()

  useEffect(() => { setTimezone(detectTimezone()) }, [])

  // ── Step 1: Create account ────────────────────────────────
  const handleAccountSubmit = async (e: FormEvent) => {
    e.preventDefault(); setError(null)

    if (mode === 'magic') {
      setLoading(true)
      const { error } = await supabase.auth.signInWithOtp({
        email, options: { emailRedirectTo: `${window.location.origin}${redirect}` },
      })
      setLoading(false)
      if (error) setError(error.message)
      else setMagicSent(true)
      return
    }

    if (mode === 'reset') {
      setLoading(true)
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })
      setLoading(false)
      if (error) {
        setError(error.message.toLowerCase().includes('rate limit')
          ? 'Too many attempts — please wait a few minutes.'
          : error.message)
      } else { setResetSent(true) }
      return
    }

    if (mode === 'login') {
      setLoading(true)
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      setLoading(false)
      if (error) setError(error.message)
      else { router.push(redirect); router.refresh() }
      return
    }

    // Register — Step 1: create auth user
    if (mode === 'register') {
      setLoading(true)
      const displayName = name || email.split('@')[0]
      const { data: signUpData, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { display_name: displayName } },
      })
      setLoading(false)
      if (error) { setError(error.message); return }

      const newUser = signUpData.user
      if (newUser) {
        // Create initial user row with PUBLIC org (default)
        const { data: publicOrg } = await supabase
          .from('organisations').select('id').eq('slug', 'public').single()
        const publicOrgId = (publicOrg as any)?.id ?? null

        await supabase.from('users').upsert({
          id:             newUser.id,
          email:          newUser.email!,
          display_name:   displayName,
          favourite_team: favTeam || null,
          country:        country || null,
          timezone:       timezone || 'UTC',
          org_id:         publicOrgId,
        }, { onConflict: 'id', ignoreDuplicates: false })

        setNewUserId(newUser.id)
        setOwnerEmail(email)
        setOwnerName(displayName)
        setRegStep('org')  // proceed to org step
      }
    }
  }

  // ── Step 2: Org setup ─────────────────────────────────────
  const handleOrgSubmit = async () => {
    setError(null); setLoading(true)

    try {
      if (orgChoice === 'public') {
        // Stay in PUBLIC — nothing to do, just redirect
        router.push(redirect); router.refresh()
        return
      }

      if (orgChoice === 'join') {
        if (!orgLookup) { setError('Please verify your organisation code first'); setLoading(false); return }
        // Assign to org and grant org admin
        await fetch('/api/org-admins/self-register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ org_id: orgLookup.id, invite_code: orgCode }),
        })
        router.push(redirect); router.refresh()
        return
      }

      if (orgChoice === 'create') {
        if (!newOrgName.trim()) { setError('Organisation name is required'); setLoading(false); return }

        // Create org
        if (!newUserId) { setError('Session error — please try again'); setLoading(false); return }
        const createRes = await fetch('/api/organisations/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name:           newOrgName.trim(),
            owner_name:     ownerName.trim(),
            owner_phone:    ownerPhone.trim(),
            owner_email:    ownerEmail.trim(),
            user_id:        newUserId,
            // Pass profile so API can upsert the user row if it doesn't exist yet
            email:          email,
            display_name:   name || email.split('@')[0],
            country:        country || null,
            timezone:       timezone || 'UTC',
            favourite_team: favTeam || null,
          }),
        })
        const { data: org, error: orgErr } = await createRes.json()
        if (orgErr || !org) { setError(orgErr ?? 'Failed to create organisation'); setLoading(false); return }

        // Upload logo if provided
        if (logoFile && newUserId) {
          const ext  = logoFile.name.split('.').pop()
          const path = `${newUserId}/logo.${ext}`
          const { data: uploaded } = await supabase.storage
            .from('org-logos').upload(path, logoFile, { upsert: true })
          if (uploaded) {
            const { data: urlData } = supabase.storage.from('org-logos').getPublicUrl(path)
            // Update org with logo URL
            await fetch('/api/organisations/create', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ org_id: org.id, logo_url: urlData.publicUrl, user_id: newUserId }),
            })
          }
        }

        // Assign user to new org and grant org admin
        await fetch('/api/org-admins/self-register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ org_id: org.id, invite_code: org.invite_code }),
        })

        router.push(redirect); router.refresh()
      }
    } catch { setError('Something went wrong — please try again') }
    finally { setLoading(false) }
  }

  const lookupOrgCode = async () => {
    setLookingUp(true); setOrgCodeErr(null); setOrgLookup(null)
    const res = await fetch(`/api/organisations?code=${orgCode}`)
    const { data, error } = await res.json()
    setLookingUp(false)
    if (error || !data) setOrgCodeErr('Code not found — check with your tournament admin')
    else setOrgLookup(data)
  }

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setError('Logo must be under 2MB'); return }
    setLogoFile(file)
    const reader = new FileReader()
    reader.onload = ev => setLogoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  // ── Confirmation screens ──────────────────────────────────
  if (magicSent) return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center">
        <div className="text-4xl mb-4">📧</div>
        <h1 className="text-lg font-semibold mb-2">Check your email</h1>
        <p className="text-sm text-gray-500">Magic link sent to <strong>{email}</strong>.</p>
        <button onClick={() => { setMagicSent(false); setMode('login') }} className="mt-6 text-xs text-gray-400 underline">Back to sign in</button>
      </div>
    </div>
  )

  if (resetSent) return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center">
        <div className="text-4xl mb-4">📬</div>
        <h1 className="text-lg font-semibold mb-2">Password reset sent</h1>
        <p className="text-sm text-gray-500">Check your email at <strong>{email}</strong> for the reset link.</p>
        <button onClick={() => { setResetSent(false); setMode('login') }} className="mt-6 text-xs text-gray-400 underline">Back to sign in</button>
      </div>
    </div>
  )

  // ── Step 2: Org setup screen ──────────────────────────────
  if (mode === 'register' && regStep === 'org') return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-gray-50">
      <div className="max-w-sm w-full">
        <div className="text-center mb-6">
          <div className="text-3xl mb-2">🏢</div>
          <h1 className="text-lg font-semibold text-gray-900">Your organisation</h1>
          <p className="text-sm text-gray-500 mt-1">Join an existing org or create your own</p>
        </div>

        {/* Choice buttons */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          {([
            { key: 'public',  icon: '🌍', label: 'Public' },
            { key: 'join',    icon: '🔑', label: 'Join org' },
            { key: 'create',  icon: '✨', label: 'Create org' },
          ] as const).map(opt => (
            <button key={opt.key} onClick={() => { setOrgChoice(opt.key); setError(null) }}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-xs font-medium transition-all ${
                orgChoice === opt.key
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
              }`}>
              <span className="text-xl">{opt.icon}</span>
              {opt.label}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">

          {/* PUBLIC */}
          {orgChoice === 'public' && (
            <div className="text-center py-2">
              <p className="text-sm text-gray-600 mb-1">You'll join the <strong>Public</strong> organisation.</p>
              <p className="text-xs text-gray-400">You can join tribes available to all public players.</p>
            </div>
          )}

          {/* Join existing */}
          {orgChoice === 'join' && (
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
              <p className="text-[11px] text-gray-400 mt-2">Get this code from your tournament admin.</p>
            </div>
          )}

          {/* Create new */}
          {orgChoice === 'create' && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Organisation name <span className="text-red-500">*</span></label>
                <input type="text" value={newOrgName} onChange={e => setNewOrgName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Your name (org owner)</label>
                <input type="text" value={ownerName} onChange={e => setOwnerName(e.target.value)}
                  placeholder="Full name"
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

              {/* Logo upload */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Organisation logo <span className="text-gray-400 font-normal">(optional, max 2MB)</span></label>
                <div className="flex items-center gap-3">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo preview"
                      className="w-14 h-14 rounded-lg object-cover border border-gray-200 flex-shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-300 flex-shrink-0">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                  <div>
                    <button type="button" onClick={() => fileRef.current?.click()}
                      className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50">
                      {logoFile ? 'Change logo' : 'Upload logo'}
                    </button>
                    {logoFile && <p className="text-[11px] text-gray-400 mt-1">{logoFile.name}</p>}
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                </div>
                <p className="text-[11px] text-gray-400 mt-1.5">Displayed on the app home page for your org members.</p>
              </div>
            </>
          )}

          {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>}

          <button onClick={handleOrgSubmit} disabled={loading}
            className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2">
            {loading && <Spinner className="w-4 h-4 text-white" />}
            {orgChoice === 'public' ? 'Continue to app →' : orgChoice === 'join' ? 'Join organisation →' : 'Create organisation →'}
          </button>
        </div>
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
            <button key={m} onClick={() => { setMode(m); setError(null); setRegStep('account') }}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {m === 'magic' ? 'Magic link' : m === 'reset' ? 'Reset' : m === 'register' ? 'Register' : 'Sign in'}
            </button>
          ))}
        </div>

        <form onSubmit={handleAccountSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">

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
                <select value={country} onChange={e => setCountry(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white">
                  <option value="">Select your country</option>
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Timezone <span className="text-gray-400 font-normal">(for kickoff times)</span>
                </label>
                <select value={timezone} onChange={e => setTimezone(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white">
                  {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
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
            className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2">
            {loading && <Spinner className="w-4 h-4 text-white" />}
            {mode === 'login' ? 'Sign in' : mode === 'register' ? 'Continue →' : mode === 'reset' ? 'Send reset link' : 'Send magic link'}
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
