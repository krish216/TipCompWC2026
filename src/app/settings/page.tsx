'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { Spinner, Card } from '@/components/ui'
import { TIMEZONES, COUNTRIES } from '@/lib/timezone'
import toast from 'react-hot-toast'

interface NotifPrefs {
  push_enabled:  boolean
  email_enabled: boolean
  tribe_nudges:  boolean
}

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

// Tournament starts Jun 11 2026 19:00 UTC — lock favourite team from this point
const TOURNAMENT_KICKOFF = new Date('2026-06-11T19:00:00Z')
const isTournamentStarted = () => Date.now() >= TOURNAMENT_KICKOFF.getTime()

function Toggle({ enabled, onChange, label, description }: {
  enabled: boolean; onChange: (v: boolean) => void; label: string; description?: string
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <button
        role="switch"
        aria-checked={enabled}
        onClick={() => onChange(!enabled)}
        className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-green-400 ${
          enabled ? 'bg-green-600' : 'bg-gray-200'
        }`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
          enabled ? 'translate-x-4' : 'translate-x-0'
        }`} />
      </button>
    </div>
  )
}

export default function SettingsPage() {
  const { session, supabase } = useSupabase()

  const [displayName,   setDisplayName]   = useState('')
  const [country,       setCountry]       = useState('')
  const [timezone,      setTimezone]      = useState('UTC')
  const [savedCountry,  setSavedCountry]  = useState('')
  const [savedTimezone, setSavedTimezone] = useState('UTC')
  const [savingProfile, setSavingProfile] = useState(false)
  const [favTeam,       setFavTeam]       = useState('')
  const [savedFavTeam,  setSavedFavTeam]  = useState('')   // track the saved value separately
  const [prefs,         setPrefs]         = useState<NotifPrefs>({ push_enabled: true, email_enabled: true, tribe_nudges: false })
  const [loading,       setLoading]       = useState(true)
  const [savingName,    setSavingName]    = useState(false)
  const [savingFav,     setSavingFav]     = useState(false)
  const [savingPrefs,   setSavingPrefs]   = useState(false)

  const tournamentStarted = isTournamentStarted()

  useEffect(() => {
    if (!session) return
    const load = async () => {
      const [userRes, prefRes] = await Promise.all([
        supabase.from('users').select('display_name, favourite_team, country, timezone').eq('id', session.user.id).single(),
        supabase.from('notification_prefs').select('*').eq('user_id', session.user.id).single(),
      ])
      if (userRes.data) {
        setDisplayName((userRes.data as any).display_name ?? '')
        const ft = (userRes.data as any).favourite_team ?? ''
        setFavTeam(ft); setSavedFavTeam(ft)
        const ct = (userRes.data as any).country ?? ''
        const tz = (userRes.data as any).timezone ?? 'UTC'
        setCountry(ct); setSavedCountry(ct)
        setTimezone(tz); setSavedTimezone(tz)
      }
      if (prefRes.data) setPrefs({
        push_enabled:  prefRes.data.push_enabled,
        email_enabled: prefRes.data.email_enabled,
        tribe_nudges:  prefRes.data.tribe_nudges,
      })
      setLoading(false)
    }
    load()
  }, [session, supabase])

  const saveDisplayName = async (e: FormEvent) => {
    e.preventDefault()
    if (!session || !displayName.trim()) return
    setSavingName(true)
    const { error } = await supabase
      .from('users')
      .update({ display_name: displayName.trim() })
      .eq('id', session.user.id)
    setSavingName(false)
    if (error) toast.error('Failed to save name')
    else toast.success('Display name updated')
  }

  const saveProfile = async () => {
    if (!session) return
    setSavingProfile(true)
    const { error } = await supabase.from('users')
      .update({ country: country || null, timezone: timezone || 'UTC' })
      .eq('id', session.user.id)
    setSavingProfile(false)
    if (error) toast.error('Failed to save profile')
    else {
      setSavedCountry(country); setSavedTimezone(timezone)
      toast.success('Profile updated')
    }
  }

  const saveFavouriteTeam = async () => {
    if (!session || tournamentStarted) return
    setSavingFav(true)
    const { error } = await supabase
      .from('users')
      .update({ favourite_team: favTeam || null })
      .eq('id', session.user.id)
    setSavingFav(false)
    if (error) {
      toast.error('Failed to save favourite team')
    } else {
      setSavedFavTeam(favTeam)
      toast.success(favTeam ? `Favourite team set to ${favTeam} ⭐` : 'Favourite team cleared')
    }
  }

  const updatePref = async (key: keyof NotifPrefs, value: boolean) => {
    const updated = { ...prefs, [key]: value }
    setPrefs(updated)
    setSavingPrefs(true)
    const { error } = await supabase
      .from('notification_prefs')
      .upsert({ user_id: session!.user.id, ...updated })
    setSavingPrefs(false)
    if (error) { toast.error('Failed to save preference'); setPrefs(prefs) }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  if (loading) return <div className="flex justify-center py-24"><Spinner className="w-7 h-7" /></div>

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-lg font-semibold text-gray-900 mb-5">Settings</h1>

      {/* Profile */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Profile</h2>
        <Card>
          <form onSubmit={saveDisplayName} className="flex gap-2 items-end mb-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Display name</label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                maxLength={40}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
              />
            </div>
            <button
              type="submit"
              disabled={savingName || !displayName.trim()}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg flex items-center gap-1.5"
            >
              {savingName && <Spinner className="w-3 h-3 text-white" />}
              Save
            </button>
          </form>
          <p className="text-xs text-gray-400">
            Signed in as <span className="font-medium">{session?.user.email}</span>
          </p>
        </Card>
      </section>

      {/* Country & Timezone */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Location</h2>
        <Card>
          <p className="text-xs text-gray-500 mb-3">All fixture kickoff times are displayed in your local timezone.</p>
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Country</label>
            <select value={country} onChange={e => setCountry(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white">
              <option value="">Select your country</option>
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Timezone</label>
            <select value={timezone} onChange={e => setTimezone(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white">
              {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
            </select>
          </div>
          <button onClick={saveProfile}
            disabled={savingProfile || (country === savedCountry && timezone === savedTimezone)}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg flex items-center gap-1.5">
            {savingProfile && <Spinner className="w-3 h-3 text-white" />}
            Save location settings
          </button>
        </Card>
      </section>

      {/* Favourite team */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Favourite team</h2>
        <Card>
          <p className="text-xs text-gray-500 mb-3">
            Earn <strong className="text-purple-700">2× points</strong> whenever you correctly predict
            the result of a match involving your favourite team.
          </p>

          {tournamentStarted ? (
            /* ── Tournament has started — show locked state ── */
            <div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <span className="text-xl">🔒</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700">
                    {savedFavTeam
                      ? <><span className="text-purple-700">⭐ {savedFavTeam}</span> — double points active</>
                      : 'No favourite team selected'
                    }
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Favourite team locked — the tournament has started
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-gray-400 mt-2">
                Favourite team selection closes at tournament kickoff (Jun 11, 2026 · 7:00 PM UTC).
              </p>
            </div>
          ) : (
            /* ── Tournament hasn't started — allow changes ── */
            <div>
              <div className="flex gap-2 items-end mb-2">
                <div className="flex-1">
                  <select
                    value={favTeam}
                    onChange={e => setFavTeam(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
                  >
                    <option value="">No favourite team</option>
                    {ALL_TEAMS.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={saveFavouriteTeam}
                  disabled={savingFav || favTeam === savedFavTeam}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center gap-1.5"
                >
                  {savingFav && <Spinner className="w-3 h-3 text-white" />}
                  Save
                </button>
              </div>

              {favTeam && favTeam !== savedFavTeam && (
                <p className="text-[11px] text-amber-600 mt-1.5">
                  Unsaved — click Save to confirm {favTeam} as your favourite team
                </p>
              )}
              {savedFavTeam && favTeam === savedFavTeam && (
                <p className="text-[11px] text-purple-600 mt-1.5 flex items-center gap-1">
                  ⭐ Double points active for <strong>{savedFavTeam}</strong> matches
                </p>
              )}

              <div className="mt-3 flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                <span className="text-sm flex-shrink-0">⚠️</span>
                <p className="text-[11px] text-amber-700">
                  Locks at tournament kickoff — <strong>Jun 11, 2026</strong>. You won't be able to change this once the tournament begins.
                </p>
              </div>
            </div>
          )}
        </Card>
      </section>

      {/* Notifications */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notifications</h2>
          {savingPrefs && <Spinner className="w-3.5 h-3.5" />}
        </div>
        <Card className="py-0 px-0 divide-y divide-gray-100">
          <div className="px-4">
            <Toggle
              label="Push notifications"
              description="Browser/mobile reminders before kickoff"
              enabled={prefs.push_enabled}
              onChange={v => updatePref('push_enabled', v)}
            />
          </div>
          <div className="px-4">
            <Toggle
              label="Email reminders"
              description="24h, 12h, and 1h before unpredicted matches"
              enabled={prefs.email_enabled}
              onChange={v => updatePref('email_enabled', v)}
            />
          </div>
          <div className="px-4">
            <Toggle
              label="Tribe nudges"
              description="Your tribe gets notified when you're behind on predictions"
              enabled={prefs.tribe_nudges}
              onChange={v => updatePref('tribe_nudges', v)}
            />
          </div>
        </Card>
      </section>

      {/* Account */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Account</h2>
        <Card>
          <button
            onClick={signOut}
            className="w-full text-left text-sm text-red-600 hover:text-red-700 font-medium py-1 transition-colors"
          >
            Sign out
          </button>
        </Card>
      </section>
    </div>
  )
}
