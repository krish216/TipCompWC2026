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
function CreateTribeForm({ orgId, onCreated }: { orgId: string; onCreated: (t: Tribe) => void }) {
  const [name,        setName]        = useState('')
  const [description, setDescription] = useState('')
  const [loading,     setLoading]     = useState(false)

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
    if (error) toast.error(error)
    else {
      toast.success(`Tribe "${data.name}" created`)
      setName(''); setDescription('')
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
            type="text" value={name} onChange={e => setName(e.target.value)}
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
        <button
          onClick={submit} disabled={loading || !name.trim()}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg flex items-center gap-1.5"
        >
          {loading && <Spinner className="w-3 h-3 text-white" />}
          Create tribe
        </button>
      </div>
      <p className="text-[11px] text-gray-400 mt-2">
        Players in your organisation can join using the invite code.
      </p>
    </Card>
  )
}

// ── Grant org admin form ───────────────────────────────────────────────────────
function GrantOrgAdminForm({ orgId }: { orgId: string }) {
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)

  const grant = async () => {
    if (!email.trim()) return
    setLoading(true)
    const res = await fetch('/api/org-admins', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: email.trim(), org_id: orgId }),
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
        The user must already have a registered account in your organisation.
      </p>
    </Card>
  )
}

// ── Tribe card ────────────────────────────────────────────────────────────────
function TribeCard({ tribe, members }: { tribe: Tribe; members: Member[] }) {
  const [copied, setCopied] = useState(false)
  const tribeMembers = members.filter(m => m.tribe_id === tribe.id)

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
          <span className="text-xs text-gray-400">{tribeMembers.length} member{tribeMembers.length !== 1 ? 's' : ''}</span>
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
function OrgLogoUpload({ orgId, currentLogo, onUploaded }: {
  orgId: string; currentLogo: string | null; onUploaded: (url: string) => void
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
    if (!file || !orgId || !session) return
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

    await fetch('/api/organisations/create', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: orgId, logo_url: logoUrl, user_id: session.user.id }),
    })

    // Verify saved
    const verifyRes  = await fetch('/api/org-admins')
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

// ── Main org admin page ───────────────────────────────────────────────────────
export default function OrgAdminPage() {
  const { session } = useSupabase()

  const [loading,    setLoading]    = useState(true)
  const [isOrgAdmin, setIsOrgAdmin] = useState<boolean | null>(null)
  const [org,        setOrg]        = useState<Org | null>(null)
  const [tribes,     setTribes]     = useState<Tribe[]>([])
  const [members,    setMembers]    = useState<Member[]>([])
  const [orgLogo,    setOrgLogo]    = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    const load = async () => {
      const adminRes  = await fetch('/api/org-admins')
      const adminData = await adminRes.json()

      if (!adminData.is_org_admin) { setIsOrgAdmin(false); setLoading(false); return }

      setIsOrgAdmin(true)
      setOrg(adminData.org)
      setOrgLogo(adminData.org?.logo_url ?? null)
      const orgId = adminData.org_id

      const [tribesRes, membersRes] = await Promise.all([
        fetch(`/api/tribes/list?org_id=${orgId}`),
        fetch(`/api/org-admins/members?org_id=${orgId}`),
      ])
      if (tribesRes.ok)  { const d = await tribesRes.json();  setTribes(d.data  ?? []) }
      if (membersRes.ok) { const d = await membersRes.json(); setMembers(d.data ?? []) }
      setLoading(false)
    }
    load()
  }, [session])

  if (loading) return <div className="flex justify-center py-24"><Spinner className="w-8 h-8" /></div>

  if (!isOrgAdmin) return (
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
            <h1 className="text-lg font-semibold text-gray-900">Organisation Admin</h1>
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
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Organisation invite code</p>
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

      {/* Org logo */}
      <Card className="mb-4">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Organisation logo</p>
        <OrgLogoUpload orgId={org?.id ?? ''} currentLogo={orgLogo} onUploaded={url => setOrgLogo(url)} />
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

      {/* Grant org admin — shown first so admin can grant access before setting up tribes */}
      {org && <GrantOrgAdminForm orgId={org.id} />}

      {/* Create tribe */}
      {org && <CreateTribeForm orgId={org.id} onCreated={t => setTribes(prev => [...prev, t])} />}

      {/* Tribes list */}
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tribes</p>
        <span className="text-xs text-gray-400">{tribes.length} total</span>
      </div>

      {tribes.length === 0 ? (
        <EmptyState title="No tribes yet" description="Create the first tribe for your organisation using the form above." />
      ) : (
        tribes.map(t => <TribeCard key={t.id} tribe={t} members={members} />)
      )}
    </div>
  )
}
