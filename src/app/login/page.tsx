'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { Spinner } from '@/components/ui'
import { TIMEZONES, COUNTRIES, detectTimezone } from '@/lib/timezone'

type Mode = 'login' | 'register' | 'magic' | 'reset'

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
  const router   = useRouter()
  const params   = useSearchParams()
  const redirect = params.get('redirect') ?? '/predict'

  const [mode,      setMode]      = useState<Mode>('login')
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [name,      setName]      = useState('')
  const [favTeam,   setFavTeam]   = useState('')
  const [country,   setCountry]   = useState('')
  const [timezone,  setTimezone]  = useState('UTC')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [magicSent,  setMagicSent]  = useState(false)
  const [resetSent,  setResetSent]  = useState(false)

  const tournamentStarted = Date.now() >= TOURNAMENT_KICKOFF.getTime()

  // Auto-detect timezone on mount
  useEffect(() => {
    const detected = detectTimezone()
    setTimezone(detected)
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setError(null); setLoading(true)
    try {
      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}${redirect}` },
        })
        if (error) throw error
        setMagicSent(true); return
      }

      if (mode === 'register') {
        const displayName = name || email.split('@')[0]
        const { data: signUpData, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { display_name: displayName } },
        })
        if (error) throw error
        const newUser = signUpData.user
        if (newUser) {
          await supabase.from('users').upsert({
            id:             newUser.id,
            email:          newUser.email!,
            display_name:   displayName,
            favourite_team: favTeam || null,
            country:        country || null,
            timezone:       timezone || 'UTC',
          }, { onConflict: 'id', ignoreDuplicates: false })
        }
        router.push(redirect); router.refresh(); return
      }

      if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/reset-password`,
        })
        if (error) throw error
        setResetSent(true); return
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      router.push(redirect); router.refresh()
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong')
    } finally { setLoading(false) }
  }

  if (magicSent) return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center">
        <div className="text-4xl mb-4">📧</div>
        <h1 className="text-lg font-semibold text-gray-900 mb-2">Check your email</h1>
        <p className="text-sm text-gray-500">Magic link sent to <strong>{email}</strong>.</p>
        <button onClick={() => { setMagicSent(false); setMode('login') }}
          className="mt-6 text-xs text-gray-400 underline">Try a different email</button>
      </div>
    </div>
  )

  if (resetSent) return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center">
        <div className="text-4xl mb-4">📬</div>
        <h1 className="text-lg font-semibold text-gray-900 mb-2">Password reset email sent</h1>
        <p className="text-sm text-gray-500 mb-2">
          We sent a reset link to <strong>{email}</strong>.
        </p>
        <p className="text-xs text-gray-400">Click the link in the email to set a new password. Check your spam folder if it doesn't arrive within a minute.</p>
        <button onClick={() => { setResetSent(false); setMode('login') }}
          className="mt-6 text-xs text-gray-400 underline">Back to sign in</button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-gray-50">
      <div className="max-w-sm w-full">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">⚽</div>
          <h1 className="text-xl font-semibold text-gray-900">TipComp 2026</h1>
          <p className="text-sm text-gray-500 mt-1">Predict every match. Beat your tribe.</p>
        </div>

        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-6">
          {(['login','register','magic','reset'] as Mode[]).map(m => (
            <button key={m} onClick={() => { setMode(m); setError(null) }}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${mode===m?'bg-white text-gray-900 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>
              {m === 'magic' ? 'Magic link' : m === 'reset' ? 'Reset password' : m}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">

          {mode === 'register' && (
            <>
              {/* Display name */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Display name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="GoalMaster99" maxLength={40}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
              </div>

              {/* Country */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Country</label>
                <select value={country} onChange={e => setCountry(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white">
                  <option value="">Select your country</option>
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Timezone */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Timezone <span className="text-gray-400 font-normal">(fixture times displayed in your local time)</span>
                </label>
                <select value={timezone} onChange={e => setTimezone(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white">
                  {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">Auto-detected — change if incorrect</p>
              </div>

              {/* Favourite team */}
              {!tournamentStarted && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Favourite team <span className="text-gray-400 font-normal">(earn 2× points on their matches)</span>
                  </label>
                  <select value={favTeam} onChange={e => setFavTeam(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white">
                    <option value="">Select a team (optional)</option>
                    {ALL_TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {favTeam && (
                    <p className="text-[11px] text-purple-600 mt-1 flex items-center gap-1">
                      ⭐ Double points for correct {favTeam} results
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Email</label>
            <input type="email" name="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
          </div>

          {/* Password — hidden for magic link and reset password modes */}
          {(mode === 'login' || mode === 'register') && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Password</label>
              <input type="password" name="password" required minLength={8}
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'Min 8 characters' : '••••••••'}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
            </div>
          )}

          {error && (
            <div role="alert" className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2">
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
