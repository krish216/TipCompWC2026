'use client'

import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { Spinner, Card, EmptyState } from '@/components/ui'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import toast from 'react-hot-toast'

interface Tribe  { id: string; name: string; description?: string | null; invite_code: string; member_count?: number }
interface Member { id: string; display_name: string; email: string; tribe_id: string | null }
interface Org    { id: string; name: string; slug: string; invite_code?: string; logo_url?: string | null }

// ── Create tribe form ──────────────────────────────────────────────────────────
function CreateTribeForm({ compId, onCreated }: { compId: string; onCreated: (t: Tribe) => void }) {
  const [name,        setName]        = useState('')
  const [description, setDescription] = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  const submit = async () => {
    if (!name.trim()) return
    setLoading(true)
    const res = await fetch('/api/tribes', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name: name.trim(), description: description.trim() || null }),
    })
    const { data, error } = await res.json()
    setLoading(false)
    if (error) {
      if (res.status === 409) {
        setError(`A tribe named "${name.trim()}" already exists in this comp. Please choose a different name.`)
      } else {
        setError(error)
      }
    } else {
      toast.success(`Tribe "${data.name}" created`)
      setName(''); setDescription(''); setError(null)
      onCreated(data)
    }
  }

  return (
    <Card className="mb-4">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Create tribe</p>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Tribe name</label>
          <input
            type="text" value={name} onChange={e => { setName(e.target.value); setError(null) }}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="e.g. The Offside Trap"
            maxLength={50}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Short description <span className="text-gray-400 font-normal">(optional, max 200 chars)</span>
          </label>
          <textarea
            value={description} onChange={e => setDescription(e.target.value)}
            placeholder="e.g. For the marketing team — weekly prize for top predictor"
            maxLength={200} rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white resize-none"
          />
          <p className="text-[11px] text-gray-400 mt-1 text-right">{description.length}/200</p>
        </div>
        {error && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {error}
          </div>
        )}
        <button
          onClick={submit} disabled={loading || !name.trim()}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg flex items-center gap-1.5"
        >
          {loading && <Spinner className="w-3 h-3 text-white" />}
          Create tribe
        </button>
      </div>
      <p className="text-[11px] text-gray-400 mt-2">
        Players in your comp can join using the invite code.
      </p>
    </Card>
  )
}

// ── Grant org admin form ───────────────────────────────────────────────────────
function GrantOrgAdminForm({ compId }: { compId: string }) {
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)

  const grant = async () => {
    if (!email.trim()) return
    setLoading(true)
    const res = await fetch('/api/comp-admins', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: email.trim(), comp_id: compId }),
    })
    const { success, error } = await res.json()
    setLoading(false)
    if (success) { toast.success(`Org admin granted to ${email}`); setEmail('') }
    else toast.error(error ?? 'Failed — user must be registered first')
  }

  return (
    <Card className="mb-4">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">
        Grant org admin access
      </p>
      <div className="flex gap-2">
        <input
          type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="user@example.com"
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
        />
        <button
          onClick={grant} disabled={loading || !email.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg flex items-center gap-1.5"
        >
          {loading && <Spinner className="w-3 h-3 text-white" />}
          Grant
        </button>
      </div>
      <p className="text-[11px] text-gray-400 mt-2">
        The user must already have a registered account in your comp.
      </p>
    </Card>
  )
}

// ── Tribe card ────────────────────────────────────────────────────────────────
function TribeCard({ tribe, members }: { tribe: Tribe; members: Member[] }) {
  const [copied, setCopied] = useState(false)
  const tribeMembers = members.filter(m => m.tribe_id === tribe.id)
  const displayCount = tribe.member_count ?? tribeMembers.length

  const copyCode = async () => {
    await navigator.clipboard.writeText(tribe.invite_code)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
    toast.success('Invite code copied!')
  }

  return (
    <Card className="mb-3">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">{tribe.name}</h3>
          {tribe.description && (
            <p className="text-xs text-gray-500 mt-0.5">{tribe.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          <span className="text-xs text-gray-400">{displayCount} member{displayCount !== 1 ? 's' : ''}</span>
          <button
            onClick={copyCode}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium border transition-colors',
              copied
                ? 'bg-green-100 text-green-700 border-green-300'
                : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
            )}
          >
            {tribe.invite_code} {copied ? '✓' : '⎘'}
          </button>
        </div>
      </div>

      {tribeMembers.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No members yet — share the invite code</p>
      ) : (
        <div className="space-y-1 mt-2">
          {tribeMembers.map(m => (
            <div key={m.id} className="flex items-center gap-2 py-1.5 border-t border-gray-100 first:border-0">
              <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-[10px] font-semibold text-green-700 flex-shrink-0">
                {m.display_name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-800 truncate">{m.display_name}</p>
                <p className="text-[10px] text-gray-400 truncate">{m.email}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ── Logo upload component ─────────────────────────────────────────────────────
function OrgLogoUpload({ compId, currentLogo, onUploaded }: {
  compId: string; currentLogo: string | null; onUploaded: (url: string) => void
}) {
  const { supabase, session } = useSupabase()
  const fileRef    = useRef<HTMLInputElement>(null)
  const [preview,   setPreview]   = useState<string | null>(currentLogo)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (currentLogo && !uploading) setPreview(currentLogo)
  }, [currentLogo])

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !compId || !session) return
    if (file.size > 2 * 1024 * 1024) { alert('Logo must be under 2MB'); return }

    const reader = new FileReader()
    reader.onload = ev => setPreview(ev.target?.result as string)
    reader.readAsDataURL(file)

    setUploading(true)
    const ext  = file.name.split('.').pop()
    const path = `${session.user.id}/logo.${ext}`
    const { data: uploaded, error } = await supabase.storage
      .from('org-logos').upload(path, file, { upsert: true })

    if (error) { alert('Upload failed: ' + error.message); setUploading(false); return }

    const { data: urlData } = supabase.storage.from('org-logos').getPublicUrl(path)
    const logoUrl = urlData.publicUrl

    await fetch('/api/comps/create', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comp_id: compId, logo_url: logoUrl, user_id: session.user.id }),
    })

    // Verify saved
    const verifyRes  = await fetch('/api/comp-admins')
    const verifyData = await verifyRes.json()
    const savedLogo  = verifyData.org?.logo_url ?? logoUrl
    onUploaded(savedLogo)
    setUploading(false)
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative flex-shrink-0">
        {preview ? (
          <img src={preview} alt="Org logo" className="w-16 h-16 rounded-xl object-cover border border-gray-200" />
        ) : (
          <div className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-300">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 rounded-xl bg-black/40 flex items-center justify-center">
            <Spinner className="w-5 h-5 text-white" />
          </div>
        )}
      </div>
      <div>
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50">
          {preview ? 'Change logo' : 'Upload logo'}
        </button>
        <p className="text-[11px] text-gray-400 mt-1.5">Shown on the home page for your org members. Max 2MB.</p>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  )
}

// ── App name panel ────────────────────────────────────────────────────────────
const DEFAULT_APP_NAME = 'World Cup 2026 Tipping Comp'

function AppNamePanel({ compId, currentName, onSaved, userId }: {
  compId: string; currentName: string; onSaved: (name: string) => void; userId: string
}) {
  const [name,    setName]    = useState(currentName)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => { setName(currentName) }, [currentName])

  const save = async () => {
    setSaving(true)
    const res = await fetch('/api/comps/create', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comp_id: compId, app_name: name.trim() || null, user_id: userId }),
    })
    const { success, error } = await res.json()
    setSaving(false)
    if (success !== false && !error) {
      onSaved(name.trim())
      toast.success('App name saved!')
    } else {
      toast.error(error ?? 'Failed to save')
    }
  }

  return (
    <Card className="mb-4">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Competition name</p>
      <p className="text-[11px] text-gray-500 mb-3">
        Shown as the title on the home page for your comp members.
        Leave blank to use the default.
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={DEFAULT_APP_NAME}
          maxLength={60}
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
        />
        <button onClick={save} disabled={saving}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg flex items-center gap-1.5">
          {saving && <Spinner className="w-3 h-3 text-white" />}
          Save
        </button>
      </div>
      <p className="text-[11px] text-gray-400 mt-1.5">
        Preview: <span className="font-medium text-gray-600">{name.trim() || DEFAULT_APP_NAME}</span>
      </p>
    </Card>
  )
}

// ── Age restriction panel ─────────────────────────────────────────────────────
function AgeRestrictionPanel({ compId, currentMinAge, onSaved, userId }: {
  compId: string; currentMinAge: number | null; onSaved: (age: number | null) => void; userId: string
}) {
  const [minAge, setMinAge] = useState<string>(currentMinAge ? String(currentMinAge) : '')
  const [saving, setSaving] = useState(false)

  useEffect(() => { setMinAge(currentMinAge ? String(currentMinAge) : '') }, [currentMinAge])

  const save = async () => {
    const val = minAge.trim() ? parseInt(minAge) : null
    if (val !== null && (val < 13 || val > 99)) { toast.error('Age must be between 13 and 99'); return }
    setSaving(true)
    const res = await fetch('/api/comps/create', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comp_id: compId, min_age: val, user_id: userId }),
    })
    const { success, error } = await res.json()
    setSaving(false)
    if (success !== false && !error) { onSaved(val); toast.success(val ? `Minimum age set to ${val}` : 'Age restriction removed') }
    else toast.error(error ?? 'Failed to save')
  }

  return (
    <Card className="mb-4">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Age restriction</p>
      <p className="text-[11px] text-gray-500 mb-3">
        Set a minimum age requirement for joining your comp. Players must provide their date of birth at registration.
        Leave blank for no age restriction.
      </p>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1">
          <span className="text-sm text-gray-600 whitespace-nowrap">Minimum age</span>
          <input
            type="number" value={minAge} onChange={e => setMinAge(e.target.value)}
            placeholder="e.g. 18" min={13} max={99}
            className="w-24 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
          />
          <span className="text-sm text-gray-500">years</span>
        </div>
        <button onClick={save} disabled={saving}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg flex items-center gap-1.5">
          {saving && <Spinner className="w-3 h-3 text-white" />}
          Save
        </button>
        {currentMinAge && (
          <button onClick={() => { setMinAge(''); setTimeout(save, 0) }}
            className="px-3 py-2 border border-red-300 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium rounded-lg">
            Remove
          </button>
        )}
      </div>
      {currentMinAge && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
          ⚠️ Players under {currentMinAge} will be blocked from joining your comp.
          Existing members under {currentMinAge} are not affected.
        </p>
      )}
    </Card>
  )
}

// ── Domain restriction panel (Enterprise only) ────────────────────────────────
function DomainRestrictionPanel({ compId, tier }: { compId: string; tier: string }) {
  const [domain,  setDomain]  = useState('')
  const [current, setCurrent] = useState<string | null>(null)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    // Fetch current domain restriction from comps table
    fetch(`/api/comps/domain?comp_id=${compId}`)
      .then(r => r.json())
      .then(d => { setCurrent(d.email_domain ?? null); setDomain(d.email_domain ?? '') })
      .catch(() => {})
  }, [compId])

  const save = async () => {
    setSaving(true)
    const res = await fetch('/api/comps/domain', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comp_id: compId, email_domain: domain.trim().toLowerCase() || null }),
    })
    const { success, error } = await res.json()
    setSaving(false)
    if (success) { setCurrent(domain.trim() || null); toast.success('Domain restriction saved') }
    else toast.error(error ?? 'Failed to save')
  }

  if (tier !== 'enterprise') return (
    <Card className="mb-4">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Email domain restriction</p>
      <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl p-3">
        <span className="text-2xl">🔒</span>
        <div>
          <p className="text-xs font-medium text-gray-700">Enterprise subscription required</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Restrict comp membership to players with a specific email domain (e.g. @acmecorp.com).</p>
        </div>
      </div>
    </Card>
  )

  return (
    <Card className="mb-4">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Email domain restriction</p>
      <p className="text-[11px] text-gray-500 mb-3">
        When set, only players whose email address matches this domain can join your comp.
        Leave blank to allow any email address.
      </p>
      {current && (
        <div className="mb-3 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <span className="text-green-600 text-xs">✓ Currently restricted to</span>
          <span className="text-xs font-mono font-semibold text-green-800">@{current}</span>
        </div>
      )}
      <div className="flex gap-2">
        <div className="flex items-center flex-1 border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-green-400 bg-white">
          <span className="px-3 text-sm text-gray-400 border-r border-gray-200 bg-gray-50 py-2">@</span>
          <input type="text" value={domain} onChange={e => setDomain(e.target.value.toLowerCase().replace(/^@/, ''))}
            placeholder="acmecorp.com"
            className="flex-1 px-3 py-2 text-sm focus:outline-none bg-white" />
        </div>
        <button onClick={save} disabled={saving}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg flex items-center gap-1.5">
          {saving && <Spinner className="w-3 h-3 text-white" />}
          Save
        </button>
        {current && (
          <button onClick={() => { setDomain(''); save() }}
            className="px-3 py-2 border border-red-300 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium rounded-lg">
            Clear
          </button>
        )}
      </div>
    </Card>
  )
}

// ── Subscription card ─────────────────────────────────────────────────────────
function SubscriptionCard({ compId }: { compId: string }) {
  const [sub,     setSub]     = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [monetOn, setMonetOn] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch(`/api/comp-subscriptions?comp_id=${compId}`).then(r => r.json()),
      fetch('/api/app-settings').then(r => r.json()),
    ]).then(([subData, settingsData]) => {
      setSub(subData.data)
      setMonetOn(settingsData.data?.monetisation_enabled === 'true')
      setLoading(false)
    })
  }, [compId])

  if (loading) return null
  if (!monetOn) return (
    <Card className="mb-4">
      <div className="flex items-center gap-2">
        <span className="text-base">⏸️</span>
        <div>
          <p className="text-xs font-medium text-gray-700">Monetisation is currently disabled</p>
          <p className="text-[11px] text-gray-400">All comps have full access — no payment required during this period.</p>
        </div>
      </div>
    </Card>
  )

  if (!sub) return null
  const tier         = sub.tier ?? 'trial'
  const trialEnds    = sub.trial_ends_at ? new Date(sub.trial_ends_at) : null
  const trialExpired = trialEnds ? trialEnds < new Date() : false
  const daysLeft     = trialEnds ? Math.max(0, Math.ceil((trialEnds.getTime() - Date.now()) / 86400000)) : null

  const TIER_LABELS: Record<string, string> = {
    trial: 'Free Trial', starter: 'Starter ($29)', business: 'Business ($99)', enterprise: 'Enterprise',
  }
  const TIER_LIMITS: Record<string, string> = {
    trial:      '1 tribe · up to 50 players · 14-day trial',
    starter:    '3 tribes · up to 50 players',
    business:   'Unlimited tribes · up to 200 players',
    enterprise: 'Unlimited everything',
  }

  return (
    <Card className="mb-4">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Subscription</p>
      <div className={clsx('rounded-xl p-3 mb-3', trialExpired ? 'bg-red-50 border border-red-200' : 'bg-blue-50 border border-blue-200')}>
        <div className="flex items-center justify-between">
          <p className={clsx('text-sm font-semibold', trialExpired ? 'text-red-800' : 'text-blue-800')}>
            {TIER_LABELS[tier] ?? tier}
          </p>
          {tier === 'trial' && daysLeft !== null && (
            <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full',
              trialExpired ? 'bg-red-100 text-red-700' : daysLeft <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700')}>
              {trialExpired ? 'Trial expired' : `${daysLeft} days left`}
            </span>
          )}
        </div>
        <p className="text-[11px] text-gray-600 mt-0.5">{TIER_LIMITS[tier]}</p>
      </div>
      {(tier === 'trial' || trialExpired) && (
        <div className="space-y-2">
          <p className="text-[11px] text-gray-500 font-medium">Upgrade your plan:</p>
          {[
            { tier: 'starter',  label: 'Starter — $29', detail: '3 tribes · 50 players' },
            { tier: 'business', label: 'Business — $99', detail: 'Unlimited tribes · 200 players' },
          ].map(t => (
            <div key={t.tier} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2">
              <div>
                <p className="text-xs font-medium text-gray-800">{t.label}</p>
                <p className="text-[10px] text-gray-400">{t.detail}</p>
              </div>
              <a href="mailto:admin@wc2026tipcomp.com?subject=Upgrade%20subscription"
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg">
                Upgrade
              </a>
            </div>
          ))}
          <p className="text-[10px] text-gray-400">Contact the tournament admin to process your upgrade.</p>
        </div>
      )}
    </Card>
  )
}

// ── Prizes panel ───────────────────────────────────────────────────────────────
function PrizesPanel({ compId }: { compId: string }) {
  const [prizes,  setPrizes]  = useState<any[]>([])
  const [place,   setPlace]   = useState('1')
  const [desc,    setDesc]    = useState('')
  const [sponsor, setSponsor] = useState('')
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    fetch(`/api/comp-prizes?comp_id=${compId}`).then(r => r.json()).then(d => setPrizes(d.data ?? []))
  }, [compId])

  const addPrize = async () => {
    if (!desc.trim()) return
    setSaving(true)
    const res = await fetch('/api/comp-prizes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comp_id: compId, place: parseInt(place), description: desc.trim(), sponsor: sponsor.trim() }),
    })
    const { data } = await res.json()
    setSaving(false)
    if (data) {
      setPrizes(prev => [...prev.filter(p => p.place !== data.place), data].sort((a,b) => a.place - b.place))
      setDesc(''); setSponsor('')
      toast.success('Prize saved!')
    }
  }

  const removePrize = async (p: number) => {
    await fetch(`/api/comp-prizes?comp_id=${compId}&place=${p}`, { method: 'DELETE' })
    setPrizes(prev => prev.filter(x => x.place !== p))
    toast.success('Prize removed')
  }

  const MEDALS = ['🥇','🥈','🥉','4️⃣','5️⃣']

  return (
    <Card className="mb-4">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Prizes</p>
      {prizes.length > 0 && (
        <div className="space-y-2 mb-4">
          {prizes.map(p => (
            <div key={p.place} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
              <span className="text-base">{MEDALS[p.place - 1] ?? `${p.place}th`}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800">{p.description}</p>
                {p.sponsor && <p className="text-[10px] text-gray-400">Sponsored by {p.sponsor}</p>}
              </div>
              <button onClick={() => removePrize(p.place)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-2">
        <div className="flex gap-2">
          <select value={place} onChange={e => setPlace(e.target.value)}
            className="w-20 px-2 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white">
            {[1,2,3,4,5].map(n => <option key={n} value={n}>{n === 1 ? '🥇 1st' : n === 2 ? '🥈 2nd' : n === 3 ? '🥉 3rd' : `${n}th`}</option>)}
          </select>
          <input type="text" value={desc} onChange={e => setDesc(e.target.value)}
            placeholder="Prize description e.g. $100 gift voucher"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
        </div>
        <div className="flex gap-2">
          <input type="text" value={sponsor} onChange={e => setSponsor(e.target.value)}
            placeholder="Sponsor name (optional)"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
          <button onClick={addPrize} disabled={saving || !desc.trim()}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg">
            {saving ? <Spinner className="w-4 h-4 text-white" /> : 'Save'}
          </button>
        </div>
      </div>
    </Card>
  )
}

// ── Announcements panel ────────────────────────────────────────────────────────
function AnnouncementsPanel({ compId, compName, userId }: { compId: string; compName: string; userId: string }) {
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [title,   setTitle]   = useState('')
  const [body,    setBody]    = useState('')
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    fetch('/api/announcements').then(r => r.json()).then(d =>
      setAnnouncements((d.data ?? []).filter((a: any) => a.org_id === compId || !a.comp_id))
    )
    // Re-fetch all and filter by this org
    fetch('/api/announcements').then(r => r.json()).then(d => {
      const mine = (d.data ?? []).filter((a: any) => {
        const orgRaw = a.comps
        const aOrg   = Array.isArray(orgRaw) ? orgRaw[0] : orgRaw
        return aOrg?.name === compName
      })
      setAnnouncements(mine)
    })
  }, [compId, compName])

  const post = async () => {
    if (!title.trim() || !body.trim()) return
    setSaving(true)
    const res = await fetch('/api/announcements', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comp_id: compId, title: title.trim(), body: body.trim() }),
    })
    const { data, error } = await res.json()
    setSaving(false)
    if (error) { toast.error(error); return }
    setAnnouncements(prev => [data, ...prev])
    setTitle(''); setBody('')
    toast.success('Announcement posted to PUBLIC members!')
  }

  const deleteAnnouncement = async (id: string) => {
    await fetch(`/api/announcements?id=${id}`, { method: 'DELETE' })
    setAnnouncements(prev => prev.filter(a => a.id !== id))
    toast.success('Deleted')
  }

  return (
    <Card className="mb-4">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Announcements</p>
      <p className="text-[11px] text-gray-500 mb-3">Post a message visible to all PUBLIC comp members — invite them to join <strong>{compName}</strong>.</p>

      {/* Compose */}
      <div className="space-y-2 mb-4">
        <input type="text" value={title} onChange={e => setTitle(e.target.value)}
          placeholder="Announcement title e.g. Join PetzBFF TipComp!"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
        <textarea value={body} onChange={e => setBody(e.target.value)}
          placeholder="Message body — include your org invite code so PUBLIC members can join"
          rows={3} maxLength={500}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white resize-none" />
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-gray-400">{body.length}/500</p>
          <button onClick={post} disabled={saving || !title.trim() || !body.trim()}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg flex items-center gap-1.5">
            {saving && <Spinner className="w-3 h-3 text-white" />}
            Post announcement
          </button>
        </div>
      </div>

      {/* Posted announcements */}
      {announcements.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-medium text-gray-500">Posted</p>
          {announcements.map(a => (
            <div key={a.id} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-800">{a.title}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{a.body}</p>
                  <p className="text-[10px] text-gray-400 mt-1">{new Date(a.created_at).toLocaleDateString()}</p>
                </div>
                <button onClick={() => deleteAnnouncement(a.id)} className="text-red-400 hover:text-red-600 text-xs flex-shrink-0">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ── Challenges panel ──────────────────────────────────────────────────────────
function ChallengesPanel({ compId }: { compId: string }) {
  const { supabase } = useSupabase()
  const [challenges, setChallenges] = useState<any[]>([])
  const [fixtures,   setFixtures]   = useState<any[]>([])
  const [fixtureId,  setFixtureId]  = useState('')
  const [prize,      setPrize]      = useState('')
  const [sponsor,    setSponsor]    = useState('')
  const [saving,     setSaving]     = useState(false)
  const [groupDate,  setGroupDate]  = useState<string>('all')

  useEffect(() => {
    // Load challenges and upcoming fixtures
    Promise.all([
      fetch(`/api/comp-challenges?comp_id=${compId}`).then(r => r.json()),
      fetch('/api/fixtures').then(r => r.json()),
    ]).then(([challengeData, fxData]) => {
      setChallenges(challengeData.data ?? [])
      const upcoming = ((fxData.data ?? []) as any[])
        .filter((f: any) => !f.result && new Date(f.kickoff_utc) > new Date())
        .sort((a: any, b: any) => new Date(a.kickoff_utc).getTime() - new Date(b.kickoff_utc).getTime())
      setFixtures(upcoming)
    })
  }, [compId])

  const createChallenge = async () => {
    if (!fixtureId || !prize.trim()) return
    setSaving(true)
    const res = await fetch('/api/comp-challenges', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comp_id: compId, fixture_id: parseInt(fixtureId), prize: prize.trim(), sponsor: sponsor.trim() }),
    })
    const { data, error } = await res.json()
    setSaving(false)
    if (error) { toast.error(error); return }
    setChallenges(prev => [data, ...prev])
    setFixtureId(''); setPrize(''); setSponsor('')
    toast.success('Challenge created!')
  }

  const deleteChallenge = async (id: string) => {
    if (!confirm('Delete this challenge?')) return
    const res = await fetch(`/api/comp-challenges?id=${id}`, { method: 'DELETE' })
    const { success, error } = await res.json()
    if (success) { setChallenges(prev => prev.filter(c => c.id !== id)); toast.success('Deleted') }
    else toast.error(error)
  }

  // Group fixtures by date for the dropdown
  const fixturesByDate = fixtures.reduce((acc: any, f: any) => {
    const date = new Date(f.kickoff_utc).toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'short' })
    if (!acc[date]) acc[date] = []
    acc[date].push(f)
    return acc
  }, {})

  // Used challenge dates (one per day limit)
  const usedDates = new Set(challenges.filter(c => !c.settled).map((c: any) => c.challenge_date))

  return (
    <Card className="mb-4">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Daily challenges</p>
      <p className="text-[11px] text-gray-500 mb-3">
        Set one challenge per day — players in your comp who predict the exact score for that fixture win the prize.
      </p>

      {/* Create form */}
      <div className="space-y-2 mb-4 bg-gray-50 rounded-xl p-3">
        <div>
          <label className="block text-[11px] font-medium text-gray-600 mb-1">Select fixture</label>
          <select value={fixtureId} onChange={e => setFixtureId(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white">
            <option value="">Choose a match…</option>
            {Object.entries(fixturesByDate).map(([date, fxs]: any) => (
              <optgroup key={date} label={date}>
                {(fxs as any[]).map((f: any) => {
                  const dateStr = f.kickoff_utc.slice(0, 10)
                  const taken   = usedDates.has(dateStr)
                  return (
                    <option key={f.id} value={f.id} disabled={taken}>
                      {f.home} vs {f.away}{taken ? ' (challenge exists)' : ''}
                    </option>
                  )
                })}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <input type="text" value={prize} onChange={e => setPrize(e.target.value)}
            placeholder="Prize e.g. $50 voucher, bottle of wine"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
          <input type="text" value={sponsor} onChange={e => setSponsor(e.target.value)}
            placeholder="Sponsor (optional)"
            className="w-32 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
        </div>
        <button onClick={createChallenge} disabled={saving || !fixtureId || !prize.trim()}
          className="w-full py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2">
          {saving && <Spinner className="w-3 h-3 text-white" />}
          🎯 Create challenge
        </button>
      </div>

      {/* Challenge list */}
      {challenges.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No challenges yet</p>
      ) : (
        <div className="space-y-2">
          {challenges.map((c: any) => {
            const fx      = Array.isArray(c.fixtures) ? c.fixtures[0] : c.fixtures
            const winners = c.challenge_winners ?? []
            return (
              <div key={c.id} className={clsx('border rounded-xl p-3', c.settled ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-gray-800">
                          {fx ? `${fx.home} vs ${fx.away}` : `Fixture #${c.fixture_id}`}
                        </span>
                        {c.settled && <span className="text-[10px] font-medium text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">Settled ✓</span>}
                      </div>
                      {fx && (
                        <p className="text-[11px] text-gray-500">
                          📅 <span className="font-medium">Challenge date:</span>{' '}
                          {new Date(c.challenge_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'long', year:'numeric' })}
                        </p>
                      )}
                      {fx && (
                        <p className="text-[11px] text-gray-500">
                          ⏰ <span className="font-medium">Kick-off:</span>{' '}
                          {new Date(fx.kickoff_utc).toLocaleString('en-AU', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', timeZoneName:'short' })}
                        </p>
                      )}
                    </div>
                    <p className="text-[11px] text-purple-700 mt-0.5">🎯 {c.prize}{c.sponsor ? ` · ${c.sponsor}` : ''}</p>
                    {winners.length > 0 && (
                      <div className="mt-1.5">
                        <p className="text-[10px] font-medium text-green-700">
                          {winners.length} winner{winners.length !== 1 ? 's' : ''}:
                        </p>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {winners.map((w: any) => {
                            const u = Array.isArray(w.users) ? w.users[0] : w.users
                            return (
                              <span key={w.user_id} className="text-[10px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded-full">
                                {u?.display_name ?? 'Player'} ({w.prediction})
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    {c.settled && winners.length === 0 && (
                      <p className="text-[10px] text-gray-400 mt-1">No exact score predictions</p>
                    )}
                  </div>
                  {!c.settled && (
                    <button onClick={() => deleteChallenge(c.id)} className="text-red-400 hover:text-red-600 text-xs flex-shrink-0">✕</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

// ── Main org admin page ───────────────────────────────────────────────────────
export default function OrgAdminPage() {
  const { session } = useSupabase()

  const [loading,    setLoading]    = useState(true)
  const [isCompAdmin, setIsOrgAdmin] = useState<boolean | null>(null)
  const [org,        setOrg]        = useState<Org | null>(null)
  const [tribes,     setTribes]     = useState<Tribe[]>([])
  const [members,    setMembers]    = useState<Member[]>([])
  const [orgLogo,    setOrgLogo]    = useState<string | null>(null)
  const [compTier,    setOrgTier]    = useState<string>('trial')
  const [compDomain,  setOrgDomain]  = useState<string | null>(null)
  const [compAppName, setOrgAppName] = useState<string>('')
  const [compMinAge,  setOrgMinAge]  = useState<number | null>(null)

  useEffect(() => {
    if (!session) return
    const load = async () => {
      const adminRes  = await fetch('/api/comp-admins')
      const adminData = await adminRes.json()

      if (!adminData.is_org_admin) { setIsOrgAdmin(false); setLoading(false); return }

      setIsOrgAdmin(true)
      setOrg(adminData.org)
      setOrgLogo(adminData.org?.logo_url ?? null)
      setOrgAppName(adminData.org?.app_name ?? '')
      setOrgMinAge(adminData.org?.min_age ?? null)
      // Fetch subscription tier
      if (adminData.comp_id) {
        const [subRes, domainRes] = await Promise.all([
          fetch(`/api/comp-subscriptions?comp_id=${adminData.org_id}`),
          fetch(`/api/comps/domain?comp_id=${adminData.org_id}`),
        ])
        const [subData, domainData] = await Promise.all([subRes.json(), domainRes.json()])
        setOrgTier(subData.data?.tier ?? 'trial')
        setOrgDomain(domainData.email_domain ?? null)
      }
      const compId = adminData.comp_id

      const [tribesRes, membersRes] = await Promise.all([
        fetch(`/api/tribes/list?comp_id=${compId}`),
        fetch(`/api/comp-admins/members?comp_id=${compId}`),
      ])
      if (tribesRes.ok)  { const d = await tribesRes.json();  setTribes((d.data ?? []) as any[]) }
      if (membersRes.ok) { const d = await membersRes.json(); setMembers(d.data ?? []) }
      setLoading(false)
    }
    load()
  }, [session])

  if (loading) return <div className="flex justify-center py-24"><Spinner className="w-8 h-8" /></div>

  if (!isCompAdmin) return (
    <div className="max-w-md mx-auto px-4 py-20 text-center">
      <div className="text-5xl mb-4">🔒</div>
      <h1 className="text-lg font-semibold text-gray-900 mb-2">Access denied</h1>
      <p className="text-sm text-gray-500 mb-6">Contact your tournament administrator to be granted org admin access.</p>
      <a href="/" className="inline-block px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg">Back to home</a>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <h1 className="text-lg font-semibold text-gray-900">Comp Admin</h1>
          </div>
          {org && (
            <p className="text-xs text-gray-500 mt-0.5">
              Managing <span className="font-medium text-blue-600">{org.name}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{tribes.length} tribe{tribes.length !== 1 ? 's' : ''}</span>
          <span>·</span>
          <span>{members.length} member{members.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Org invite code — displayed prominently for sharing */}
      <Card className="mb-4">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Comp invite code</p>
        <p className="text-[11px] text-gray-500 mb-3">
          Share this code with members so they can join <strong>{org?.name}</strong> from the Tribe page.
        </p>
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-center">
            <span className="text-2xl font-mono font-bold tracking-widest text-gray-800 select-all">
              {org?.invite_code ?? '—'}
            </span>
          </div>
          <button
            onClick={async () => {
              if (!org?.invite_code) return
              await navigator.clipboard.writeText(org.invite_code)
              toast.success('Invite code copied!')
            }}
            className="px-4 py-3 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-xl transition-colors"
          >
            Copy
          </button>
        </div>
      </Card>

      {/* Org logo — Business and Enterprise only */}
      <Card className="mb-4">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Comp logo</p>
        {['business','enterprise'].includes(compTier) ? (
          <OrgLogoUpload compId={org?.id ?? ''} currentLogo={orgLogo} onUploaded={url => setOrgLogo(url)} />
        ) : (
          <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl p-3">
            <span className="text-2xl">🔒</span>
            <div>
              <p className="text-xs font-medium text-gray-700">Business or Enterprise subscription required</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Upgrade your plan to upload an comp logo.</p>
            </div>
          </div>
        )}
      </Card>

      {/* Role explanation */}
      <div className="mb-5 bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-blue-800 mb-1">Your role</p>
        <div className="text-xs text-blue-700 space-y-1">
          <p>✅ Create and manage tribes within <strong>{org?.name}</strong></p>
          <p>✅ Add a description to each tribe</p>
          <p>✅ Grant org admin access to other members</p>
          <p>❌ Cannot enter match results — that's the Tournament Admin's role</p>
          <p>❌ Cannot lock/unlock rounds — that's the Tournament Admin's role</p>
        </div>
      </div>

      {/* Subscription status */}
      {org && <SubscriptionCard compId={comp.id} />}

      {/* Custom app name */}
      {org && <AppNamePanel compId={comp.id} currentName={compAppName} onSaved={setOrgAppName} userId={session?.user.id ?? ''} />}

      {/* Age restriction */}
      {org && <AgeRestrictionPanel compId={comp.id} currentMinAge={compMinAge} onSaved={setOrgMinAge} userId={session?.user.id ?? ''} />}

      {/* Domain restriction — Enterprise only */}
      {org && <DomainRestrictionPanel compId={comp.id} tier={compTier} />}

      {/* Grant org admin */}
      {org && <GrantOrgAdminForm compId={comp.id} />}

      {/* Prizes */}
      {org && <PrizesPanel compId={comp.id} />}

      {/* Announcements */}
      {/* Announcements — only for orgs without domain restriction */}
      {org && !compDomain && (
        <AnnouncementsPanel compId={comp.id} compName={org.name} userId={session?.user.id ?? ''} />
      )}
      {org && compDomain && (
        <Card className="mb-4">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Announcements</p>
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <span className="text-xl">🔒</span>
            <div>
              <p className="text-xs font-medium text-amber-800">Announcements unavailable</p>
              <p className="text-[11px] text-amber-700 mt-0.5">
                Your comp has a domain restriction (<span className="font-mono font-medium">@{compDomain}</span>).
                Announcements target PUBLIC members who may not have a matching email — remove the domain restriction to enable this feature.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Challenges */}
      {org && <ChallengesPanel compId={comp.id} />}

      {/* Create tribe */}
      {org && <CreateTribeForm compId={comp.id} onCreated={t => setTribes(prev => [...prev, t])} />}

      {/* Tribes list */}
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tribes</p>
        <span className="text-xs text-gray-400">{tribes.length} total</span>
      </div>

      {tribes.length === 0 ? (
        <EmptyState title="No tribes yet" description="Create the first tribe for your comp using the form above." />
      ) : (
        tribes.map(t => <TribeCard key={t.id} tribe={t} members={members} />)
      )}
    </div>
  )
}
