'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { Spinner, Card, RemoveAdsButton } from '@/components/ui'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'
import { TIMEZONES, COUNTRIES, COUNTRY_CODE_MAP, getTimezonesForCountry } from '@/lib/timezone'
import { SOCIALS, cleanSocials, normalizeSocial } from '@/lib/socials'
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
  const { isAdFree, adsEnabled } = useUserPrefs()

  // Ad-free purchase success (Stripe success_url → /settings?adfree=1)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const p = new URLSearchParams(window.location.search)
    if (p.get('adfree') === '1') {
      toast.success('🎉 Ads removed — thanks for supporting TribePicks!')
      window.history.replaceState({}, '', '/settings')
    }
  }, [])

  const [displayName,    setDisplayName]    = useState('')
  const [firstName,      setFirstName]      = useState('')
  const [lastName,       setLastName]       = useState('')
  const [showFirstName,  setShowFirstName]  = useState(true)
  const [country,       setCountry]       = useState('')
  const [timezone,      setTimezone]      = useState('UTC')
  const [savedCountry,  setSavedCountry]  = useState('')
  const [savedTimezone, setSavedTimezone] = useState('UTC')
  const [savingProfile, setSavingProfile] = useState(false)
  const [tagline,       setTagline]       = useState('')
  const [bio,           setBio]           = useState('')
  const [savedBio,      setSavedBio]      = useState('')     // JSON of {tagline, bio}
  const [savingBio,     setSavingBio]     = useState(false)
  const [socials,       setSocials]       = useState<Record<string, string>>({})
  const [savedSocials,  setSavedSocials]  = useState('{}')
  const [savingSocials, setSavingSocials] = useState(false)
  const [prefs,         setPrefs]         = useState<NotifPrefs>({ push_enabled: true, email_enabled: true, tribe_nudges: false })
  const [loading,       setLoading]       = useState(true)
  const [savingName,    setSavingName]    = useState(false)
  const [birthYear,     setBirthYear]     = useState('')
  const [savingYear,    setSavingYear]    = useState(false)
  const [avatar,        setAvatar]        = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [savingPrefs,   setSavingPrefs]   = useState(false)

  const tournamentStarted = isTournamentStarted()

  useEffect(() => {
    if (!session) return
    const load = async () => {
      const [userRes, prefRes] = await Promise.all([
        (supabase.from('users') as any).select('display_name, first_name, last_name, show_first_name, country, timezone, avatar_url, date_of_birth').eq('id', session.user.id).maybeSingle(),
        (supabase.from('notification_prefs') as any).select('*').eq('user_id', session.user.id).maybeSingle(),
      ])
      if (userRes.data) {
        setDisplayName((userRes.data as any).display_name ?? '')
        setFirstName((userRes.data as any).first_name ?? '')
        setLastName((userRes.data as any).last_name ?? '')
        setShowFirstName((userRes.data as any).show_first_name ?? true)
        setAvatar((userRes.data as any).avatar_url ?? null)
        // Extract year from stored date_of_birth (stored as YYYY-01-01 from registration)
        const dob = (userRes.data as any).date_of_birth ?? ''
        setBirthYear(dob ? dob.split('-')[0] : '')
        const ct = (userRes.data as any).country ?? ''
        const tz = (userRes.data as any).timezone ?? 'UTC'
        setCountry(ct); setSavedCountry(ct)
        setTimezone(tz); setSavedTimezone(tz)
      }
      // Bio — separate tolerant fetch so Settings still loads if migration 160 (users.bio)
      // hasn't been applied yet (missing column → error is ignored, bio stays empty).
      // Separate tolerant fetches: bio (migration 160, applied) and tagline (165, may not be)
      // — kept apart so a missing tagline column doesn't also block bio from loading.
      const bioRes = await (supabase.from('users') as any).select('bio').eq('id', session.user.id).maybeSingle()
      const b = !bioRes.error ? ((bioRes.data as any)?.bio ?? '') : ''
      const tagRes = await (supabase.from('users') as any).select('tagline').eq('id', session.user.id).maybeSingle()
      const t = !tagRes.error ? ((tagRes.data as any)?.tagline ?? '') : ''
      setBio(b); setTagline(t); setSavedBio(JSON.stringify({ t, b }))
      // Socials — tolerant fetch (migration 162). Missing column → stays empty.
      const socRes = await (supabase.from('users') as any).select('socials').eq('id', session.user.id).maybeSingle()
      if (!socRes.error) { const s = (socRes.data as any)?.socials ?? {}; setSocials(s); setSavedSocials(JSON.stringify(s)) }
      if (prefRes.data) setPrefs({
        push_enabled:  (prefRes.data as any).push_enabled,
        email_enabled: (prefRes.data as any).email_enabled,
        tribe_nudges:  (prefRes.data as any).tribe_nudges,
      })
      setLoading(false)
    }
    load()
  }, [session, supabase])

  const saveDisplayName = async (e: FormEvent) => {
    e.preventDefault()
    if (!session || !displayName.trim()) return
    setSavingName(true)
    const { error } = await (supabase.from('users') as any)
      .update({ display_name: displayName.trim(), first_name: firstName.trim() || null, last_name: lastName.trim() || null })
      .eq('id', session.user.id)
    setSavingName(false)
    if (error) toast.error('Failed to save name')
    else toast.success('Display name updated')
  }

  const saveBio = async () => {
    if (!session) return
    setSavingBio(true)
    let { error } = await (supabase.from('users') as any)
      .update({ tagline: tagline.trim() || null, bio: bio.trim() || null })
      .eq('id', session.user.id)
    if (error) {
      // tagline column may not exist yet (migration 165) — save the bio on its own.
      const r = await (supabase.from('users') as any).update({ bio: bio.trim() || null }).eq('id', session.user.id)
      error = r.error
    }
    setSavingBio(false)
    if (error) toast.error('Couldn’t save')
    else { setSavedBio(JSON.stringify({ t: tagline.trim(), b: bio.trim() })); toast.success('Profile updated') }
  }

  const saveSocials = async () => {
    if (!session) return
    // Drop blanks + anything that fails host-validation before storing.
    const cleaned = cleanSocials(socials)
    const invalid = SOCIALS.filter(d => (socials[d.key] ?? '').trim() && !normalizeSocial(d.key, socials[d.key]))
    if (invalid.length) { toast.error(`Check your ${invalid.map(d => d.label).join(', ')} link`); return }
    setSavingSocials(true)
    const { error } = await (supabase.from('users') as any)
      .update({ socials: cleaned })
      .eq('id', session.user.id)
    setSavingSocials(false)
    if (error) { toast.error('Couldn’t save links'); return }
    setSocials(cleaned); setSavedSocials(JSON.stringify(cleaned)); toast.success('Links updated')
  }

  const saveProfile = async () => {
    if (!session) return
    setSavingProfile(true)
    const { error } = await (supabase.from('users') as any)
      .update({ country: country || null, timezone: timezone || 'UTC' })
      .eq('id', session.user.id)
    setSavingProfile(false)
    if (error) toast.error('Failed to save profile')
    else {
      setSavedCountry(country); setSavedTimezone(timezone)
      toast.success('Profile updated')
    }
  }


  const updatePref = async (key: keyof NotifPrefs, value: boolean) => {
    const updated = { ...prefs, [key]: value }
    setPrefs(updated)
    setSavingPrefs(true)
    const { error } = await (supabase.from('notification_prefs') as any)
      .upsert({ user_id: session!.user.id, ...updated })
    setSavingPrefs(false)
    if (error) { toast.error('Failed to save preference'); setPrefs(prefs) }
  }

  const saveYear = async () => {
    if (!session || !birthYear) return
    const yr = parseInt(birthYear, 10)
    const maxYr = new Date().getFullYear() - 5
    if (isNaN(yr) || yr < 1920 || yr > maxYr) {
      toast.error(`Year must be between 1920 and ${maxYr}`)
      return
    }
    setSavingYear(true)
    await (supabase.from('users') as any).update({ date_of_birth: `${birthYear}-01-01` }).eq('id', session.user.id)
    setSavingYear(false)
    toast.success('Year of birth saved')
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting,      setDeleting]      = useState(false)
  const [showDeleteBox, setShowDeleteBox] = useState(false)

  const deleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') return
    setDeleting(true)
    const res = await fetch('/api/account', { method: 'DELETE' })
    if (res.ok) {
      await supabase.auth.signOut()
      window.location.href = '/?deleted=1'
    } else {
      const { error } = await res.json()
      toast.error(error ?? 'Failed to delete account')
      setDeleting(false)
    }
  }

  if (loading) return <div className="flex justify-center py-24"><Spinner className="w-7 h-7" /></div>

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-lg font-semibold text-gray-900 mb-5">Settings</h1>

      {/* Profile */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Profile</h2>
        <Card>
          {/* Avatar */}
          <div className="flex items-center gap-4 mb-5 pb-4 border-b border-gray-100">
            <div className="relative flex-shrink-0">
              {avatar ? (
                <img src={avatar} alt="Avatar" className="w-16 h-16 rounded-full object-cover border-2 border-gray-200" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-xl border-2 border-gray-200">
                  {displayName.charAt(0).toUpperCase() || '?'}
                </div>
              )}
              {uploadingAvatar && (
                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                  <Spinner className="w-5 h-5 text-white" />
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-gray-700 mb-1.5">Profile photo</p>
              <label className="cursor-pointer px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors">
                {uploadingAvatar ? 'Uploading…' : avatar ? 'Change photo' : 'Upload photo'}
                <input type="file" accept="image/*" className="hidden" onChange={async e => {
                  const file = e.target.files?.[0]; if (!file || !session) return
                  if (file.size > 2 * 1024 * 1024) { toast.error('Photo must be under 2MB'); return }
                  setUploadingAvatar(true)
                  const ext  = (file.name.split('.').pop() || 'jpg').toLowerCase()
                  const path = `${session.user.id}/avatar.${ext}`
                  const { data: uploaded, error } = await supabase.storage
                    .from('org-logos').upload(path, file, { upsert: true })
                  if (error) { toast.error('Upload failed'); setUploadingAvatar(false); return }
                  const { data: urlData } = supabase.storage.from('org-logos').getPublicUrl(path)
                  // The file path is stable (avatar.<ext>, upserted), so the public URL is
                  // byte-identical every upload → the browser/CDN would keep serving the
                  // cached old image. A version param busts that so the new photo shows.
                  const url = `${urlData.publicUrl}?v=${Date.now()}`
                  await (supabase.from('users') as any).update({ avatar_url: url }).eq('id', session.user.id)
                  setAvatar(url)
                  setUploadingAvatar(false)
                  toast.success('Profile photo updated!')
                }} />
              </label>
              <p className="text-[11px] text-gray-400 mt-1">Max 2MB · JPG, PNG, GIF</p>
            </div>
          </div>
          <form onSubmit={saveDisplayName} className="mb-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Display name</label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                maxLength={40}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">First name</label>
              <input
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                maxLength={40}
                placeholder="e.g. Priya"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
              />
              <p className="text-[11px] text-gray-400 mt-1">Shown beneath your display name on leaderboards (including the global board) when enabled below.</p>
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
          <div className="mt-4 pt-4 border-t border-gray-100">
            <Toggle
              label="Show first name on leaderboards"
              description="Your first name appears beneath your display name on every scoreboard — your comp, your tribe, and the global leaderboard. Turn off to show only your display name to others."
              enabled={showFirstName}
              onChange={async v => {
                setShowFirstName(v)
                await (supabase.from('users') as any)
                  .update({ show_first_name: v })
                  .eq('id', session!.user.id)
              }}
            />
          </div>

          {/* Comp-Chief headline + bio — shown on your public Chief profile */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <label className="block text-sm font-medium text-gray-800 mb-1">Headline &amp; bio</label>
            <p className="text-xs text-gray-500 mb-2">Shown on your public Chief profile, so people vetting your open comps know who you are.</p>
            <input
              type="text"
              value={tagline}
              onChange={e => setTagline(e.target.value.slice(0, 80))}
              placeholder="One-line headline — e.g. Melbourne footy tragic, comp organiser since 2019"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white mb-2"
            />
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value.slice(0, 280))}
              rows={3}
              placeholder="A little more about you — e.g. Running friendly prediction comps for the five-a-side crew. Winner buys the coffees."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white resize-none"
            />
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[11px] text-gray-400">{bio.length}/280</span>
              <button
                onClick={saveBio}
                disabled={savingBio || JSON.stringify({ t: tagline.trim(), b: bio.trim() }) === savedBio}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg flex items-center gap-2 transition-colors">
                {savingBio && <Spinner className="w-3.5 h-3.5 text-white" />}
                Save
              </button>
            </div>
          </div>

          {/* Social links — shown on your public Chief profile */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <label className="block text-sm font-medium text-gray-800 mb-1">Your links</label>
            <p className="text-xs text-gray-500 mb-3">Optional. Shown on your public Chief profile so people can find and trust you. Leave blank to hide.</p>
            <div className="space-y-2">
              {SOCIALS.map(def => {
                const val = socials[def.key] ?? ''
                const bad = !!val.trim() && !normalizeSocial(def.key, val)
                return (
                  <div key={def.key} className="flex items-center gap-2">
                    <span className="flex-shrink-0 w-16 text-xs font-semibold text-gray-500">{def.label}</span>
                    <input
                      type="url"
                      value={val}
                      onChange={e => setSocials(s => ({ ...s, [def.key]: e.target.value }))}
                      placeholder={def.placeholder}
                      className={`flex-1 min-w-0 px-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 bg-white ${bad ? 'border-red-300 focus:ring-red-300' : 'border-gray-300 focus:ring-green-400'}`}
                    />
                  </div>
                )
              })}
            </div>
            <div className="flex justify-end mt-2.5">
              <button
                onClick={saveSocials}
                disabled={savingSocials || JSON.stringify(cleanSocials(socials)) === savedSocials}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg flex items-center gap-2 transition-colors">
                {savingSocials && <Spinner className="w-3.5 h-3.5 text-white" />}
                Save links
              </button>
            </div>
          </div>

          {session && (
            <a href={`/chief/${session.user.id}`} target="_blank" rel="noopener noreferrer"
              className="mt-4 flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-colors">
              <span className="text-sm font-semibold text-emerald-800">🧑‍✈️ View your public Chief profile</span>
              <span className="text-emerald-600 font-bold">→</span>
            </a>
          )}

          <p className="text-xs text-gray-400 mt-3">
            Signed in as <span className="font-medium">{session?.user.email}</span>
          </p>
        </Card>
      </section>

      {/* Ad-free — hidden entirely when ads are off site-wide */}
      {adsEnabled && (
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ads</h2>
          <Card>
            {isAdFree ? (
              <p className="text-sm text-gray-700">✓ You&apos;re <strong>ad-free</strong> for this tournament. Thanks for supporting TribePicks!</p>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800">Tipster Pro</p>
                  <p className="text-xs text-gray-500 mt-0.5">One-time $6.95 — ad-free for the rest of WC 2026, plus advanced personal stats coming this tournament.</p>
                </div>
                <RemoveAdsButton className="flex-shrink-0" />
              </div>
            )}
          </Card>
        </section>
      )}

      {/* Country & Timezone */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Location</h2>
        <Card>
          <p className="text-xs text-gray-500 mb-3">All fixture kickoff times are displayed in your local timezone.</p>
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Country</label>
            <select value={country} onChange={e => {
                setCountry(e.target.value)
                const tzs = getTimezonesForCountry(e.target.value)
                if (tzs.length > 0 && tzs.length < TIMEZONES.length) setTimezone(tzs[0].value)
              }}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white">
              <option value="">Select your country</option>
              {COUNTRIES.map(c => <option key={c} value={COUNTRY_CODE_MAP[c] ?? c}>{c}</option>)}
            </select>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Timezone</label>
            <select value={timezone} onChange={e => setTimezone(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white">
              {getTimezonesForCountry(country).map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
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

      {/* Notifications */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notifications</h2>
          {savingPrefs && <Spinner className="w-3.5 h-3.5" />}
        </div>
        <Card className="py-0 px-0 divide-y divide-gray-100">

          {/* In-app bell — always on, informational only */}
          <div className="px-4 py-3 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-green-50 border border-green-200 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">In-app notifications</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Always on — score updates, member activity, and comp announcements appear in the bell icon in the top bar.
              </p>
            </div>
          </div>

          <div className="px-4">
            <Toggle
              label="Email reminders"
              description="Sent 24h, 12h, and 1h before unpredicted matches lock"
              enabled={prefs.email_enabled}
              onChange={v => updatePref('email_enabled', v)}
            />
          </div>
          <div className="px-4">
            <Toggle
              label="Push notifications"
              description="Browser or mobile push for deadline reminders"
              enabled={prefs.push_enabled}
              onChange={v => updatePref('push_enabled', v)}
            />
          </div>
          <div className="px-4">
            <Toggle
              label="Tribe nudges"
              description="Notify your tribe when you're behind on predictions"
              enabled={prefs.tribe_nudges}
              onChange={v => updatePref('tribe_nudges', v)}
            />
          </div>
        </Card>
      </section>

      {/* Year of birth */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Year of birth</h2>
        <Card>
          <p className="text-xs text-gray-500 mb-3">
            Required if you want to join an age-restricted comp. Not shown publicly.
          </p>
          {(() => {
            const yr         = birthYear ? parseInt(birthYear, 10) : NaN
            const maxYr      = new Date().getFullYear() - 5
            const yearInvalid = birthYear.length === 4 && (isNaN(yr) || yr < 1920 || yr > maxYr)
            const yearValid   = birthYear.length === 4 && !yearInvalid
            return (
              <>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <input
                      type="number"
                      list="settings-birth-year-list"
                      value={birthYear}
                      onChange={e => setBirthYear(e.target.value)}
                      placeholder="e.g. 1990"
                      min={1920}
                      max={maxYr}
                      className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white ${
                        yearInvalid ? 'border-red-400 bg-red-50' : yearValid ? 'border-green-400' : 'border-gray-300'
                      }`}
                    />
                    <datalist id="settings-birth-year-list">
                      {Array.from({ length: maxYr - 1919 }, (_, i) => maxYr - i).map(y => (
                        <option key={y} value={y} />
                      ))}
                    </datalist>
                  </div>
                  <button onClick={saveYear} disabled={savingYear || !yearValid}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg flex items-center gap-1.5">
                    {savingYear && <Spinner className="w-3 h-3 text-white" />}
                    Save
                  </button>
                </div>
                {yearInvalid && (
                  <p className="text-xs text-red-600 mt-1.5">Enter a year between 1920 and {maxYr}</p>
                )}
                {yearValid && (
                  <p className="text-xs text-green-600 mt-1.5">✓ Valid year of birth</p>
                )}
              </>
            )
          })()}
        </Card>
      </section>

      {/* Tournament enrollments */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">My Tournaments</h2>
        <TournamentEnrollments />
      </section>

      {/* My Bracket */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">My Bracket</h2>
        <Card>
          <a href="/bracket" className="flex items-center justify-between group">
            <div className="flex items-center gap-3">
              <span className="text-2xl leading-none">🏆</span>
              <div>
                <p className="text-sm font-semibold text-gray-900">2026 World Cup Bracket</p>
                <p className="text-xs text-gray-500 mt-0.5">Pick your champion and full path to the final</p>
              </div>
            </div>
            <span className="text-gray-400 text-lg group-hover:text-gray-600 transition-colors">→</span>
          </a>
        </Card>
      </section>

      {/* Account */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Account</h2>
        <Card>
          <button onClick={signOut}
            className="w-full text-left text-sm text-red-600 hover:text-red-700 font-medium py-2 border-b border-gray-100 transition-colors">
            Sign out
          </button>
          <div className="pt-3">
            {!showDeleteBox ? (
              <button onClick={() => setShowDeleteBox(true)}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                Delete my account
              </button>
            ) : (
              <div className="space-y-3">
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-red-800 mb-1">⚠️ This cannot be undone</p>
                  <p className="text-[11px] text-red-700">
                    Your account, predictions, points history and tribe membership will be permanently deleted.
                    Your scores will be removed from all leaderboards.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Type <span className="font-mono font-bold">DELETE</span> to confirm
                  </label>
                  <input
                    type="text"
                    value={deleteConfirm}
                    onChange={e => setDeleteConfirm(e.target.value)}
                    placeholder="DELETE"
                    className="w-full px-3 py-2 text-sm border border-red-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 bg-white font-mono"
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setShowDeleteBox(false); setDeleteConfirm('') }}
                    className="flex-1 py-2 text-xs font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50">
                    Cancel
                  </button>
                  <button onClick={deleteAccount}
                    disabled={deleting || deleteConfirm !== 'DELETE'}
                    className="flex-1 py-2 text-xs font-medium bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg flex items-center justify-center gap-1.5">
                    {deleting && <Spinner className="w-3 h-3 text-white" />}
                    Delete my account
                  </button>
                </div>
                <p className="text-[10px] text-gray-400">
                  Under the Australian Privacy Act 1988, you have the right to request deletion of your personal data.
                  This action fulfils that right.{' '}
                  <a href="/privacy" className="underline">Privacy Policy</a>
                </p>
              </div>
            )}
          </div>
        </Card>
      </section>
    </div>
  )
}

// ── Tournament Enrollments ─────────────────────────────────────────────────
function TournamentEnrollments() {
  const { supabase, session } = useSupabase()
  const [allTourns,     setAllTourns]     = useState<any[]>([])
  const [enrolled,      setEnrolled]      = useState<Set<string>>(new Set())
  const [saving,        setSaving]        = useState<string | null>(null)
  const [loading,       setLoading]       = useState(true)

  useEffect(() => {
    if (!session) return
    Promise.all([
      fetch('/api/tournaments').then(r => r.json()),
      fetch('/api/user-tournaments').then(r => r.json()),
    ]).then(([all, mine]) => {
      setAllTourns((all.data ?? []).filter((t: any) => t.status !== 'completed'))
      const map = new Set<string>()
      ;(mine.data ?? []).forEach((e: any) => { map.add(e.tournament_id) })
      setEnrolled(map)
      setLoading(false)
    })
  }, [session])

  const enrol = async (tid: string) => {
    setSaving(tid)
    await fetch('/api/user-tournaments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournament_id: tid }),
    })
    setEnrolled(prev => new Set([...prev, tid]))
    setSaving(null)
    toast.success('Enrolled!')
  }

  const leave = async (tid: string, name: string) => {
    if (!confirm(`Leave ${name}? Your predictions will be kept but you won't appear on the leaderboard.`)) return
    setSaving(tid)
    await fetch(`/api/user-tournaments?tournament_id=${tid}`, { method: 'DELETE' })
    setEnrolled(prev => { const n = new Set(prev); n.delete(tid); return n })
    setSaving(null)
    toast.success('Left tournament')
  }


  if (loading) return <div className="py-4 text-sm text-gray-400">Loading…</div>

  if (allTourns.length === 0) return (
    <Card><p className="text-sm text-gray-400 text-center py-2">No active tournaments</p></Card>
  )

  // teams come from tournament data — fall back to empty (all sorted when rendering)

  return (
    <div className="space-y-3">
      {allTourns.map(t => {
        const isEnrolled = enrolled.has(t.id)
        const isSaving   = saving === t.id
        return (
          <Card key={t.id} className={isEnrolled ? 'border-green-300 bg-green-50/40' : ''}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900">⚽ {t.name}</p>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                    t.status === 'active' ? 'bg-green-200 text-green-800' : 'bg-blue-100 text-blue-700'
                  }`}>{t.status}</span>
                </div>
                {t.start_date && (
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {new Date(t.start_date + 'T00:00:00').toLocaleDateString('en-AU', { day:'numeric', month:'long', year:'numeric' })}
                  </p>
                )}
              </div>
              {isEnrolled ? (
                <button onClick={() => leave(t.id, t.name)} disabled={isSaving}
                  className="text-[11px] font-medium text-red-500 hover:text-red-700 border border-red-200 rounded-lg px-2.5 py-1 hover:bg-red-50 transition-colors flex-shrink-0">
                  Leave
                </button>
              ) : t.enrollment_open === false ? (
                <span title="Enrollment opens soon"
                  className="text-[11px] font-semibold text-gray-400 bg-gray-100 rounded-lg px-3 py-1 flex-shrink-0 cursor-not-allowed">
                  Opens soon
                </span>
              ) : (
                <button onClick={() => enrol(t.id)} disabled={isSaving}
                  className="text-[11px] font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg px-3 py-1 transition-colors flex-shrink-0 flex items-center gap-1.5">
                  {isSaving && <Spinner className="w-3 h-3 text-white" />}
                  Join
                </button>
              )}
            </div>


          </Card>
        )
      })}
    </div>
  )
}
