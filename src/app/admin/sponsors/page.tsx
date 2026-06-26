'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Spinner, Card } from '@/components/ui'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { campaignStatus, toSlug } from '@/lib/sponsors/campaigns'
import { AVAILABLE_CHALLENGE_TYPES, challengeTypeLabel, deriveChallengeName, deriveChallengeSlug, leaderboardPathFor } from '@/lib/challenges/registry'
import type { Sponsor, SponsorCampaign, CampaignStatus, LogoTone, SponsorStatus } from '@/lib/sponsors/types'

type CampaignRow = SponsorCampaign & { challenges?: { type: string; name: string; slug: string; tournament_id: string } }

// ── datetime-local <-> ISO helpers ──────────────────────────────────────────
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fromLocalInput(local: string): string | null {
  if (!local) return null
  const d = new Date(local)
  return isNaN(d.getTime()) ? null : d.toISOString()
}
function fmt(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const STATUS_BADGE: Record<CampaignStatus, string> = {
  live:      'bg-emerald-100 text-emerald-700',
  scheduled: 'bg-amber-100 text-amber-700',
  ended:     'bg-gray-100 text-gray-500',
  disabled:  'bg-gray-100 text-gray-400',
}
const SPONSOR_BADGE: Record<SponsorStatus, string> = {
  active:   'bg-emerald-100 text-emerald-700',
  lead:     'bg-blue-100 text-blue-700',
  archived: 'bg-gray-100 text-gray-500',
}

export default function SponsorsAdminPage() {
  const { session } = useSupabase()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [sponsors, setSponsors] = useState<Sponsor[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | SponsorStatus>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Deep-link from a challenge's "Manage sponsor" backlink → auto-expand it.
  const searchParams = useSearchParams()
  useEffect(() => { const s = searchParams.get('sponsor'); if (s) setSelectedId(s) }, [searchParams])

  // Admin gate (same pattern as /admin).
  useEffect(() => {
    if (!session) { setIsAdmin(false); return }
    fetch('/api/admin').then(r => r.json()).then(d => setIsAdmin(!!d.is_admin)).catch(() => setIsAdmin(false))
  }, [session])

  const loadSponsors = useCallback(() => {
    setLoading(true)
    fetch('/api/sponsors').then(r => r.json())
      .then(d => setSponsors(d.sponsors ?? []))
      .catch(() => toast.error('Failed to load sponsors'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { if (isAdmin) loadSponsors() }, [isAdmin, loadSponsors])

  const filtered = useMemo(
    () => filter === 'all' ? sponsors : sponsors.filter(s => s.status === filter),
    [sponsors, filter],
  )

  if (isAdmin === null) return <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
  if (!isAdmin) return <div className="max-w-md mx-auto py-20 text-center text-gray-500">Admin access required.</div>

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link href="/admin" className="text-sm text-emerald-600 hover:underline">← Admin</Link>
          <h1 className="text-2xl font-extrabold text-gray-900 mt-1">Sponsor Campaigns</h1>
          <p className="text-sm text-gray-500">Onboard sponsors and their logos. To attach a sponsor to a specific challenge, use Challenges.</p>
        </div>
        <Link href="/admin/challenges" className="text-sm font-semibold text-emerald-600 hover:underline mt-1">Manage challenges →</Link>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {(['all', 'active', 'lead', 'archived'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={clsx('px-3 py-1.5 rounded-full text-sm font-medium',
              filter === f ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
            {f === 'all' ? 'All' : f === 'lead' ? 'Leads' : f[0].toUpperCase() + f.slice(1)}
            {f !== 'all' && <span className="ml-1 opacity-70">{sponsors.filter(s => s.status === f).length}</span>}
          </button>
        ))}
      </div>

      <NewSponsorForm onCreated={(s) => { loadSponsors(); setSelectedId(s.id) }} />

      {loading ? (
        <div className="flex justify-center py-12"><Spinner className="w-7 h-7" /></div>
      ) : filtered.length === 0 ? (
        <Card><p className="text-center text-gray-400 py-8 text-sm">No sponsors{filter !== 'all' ? ` with status “${filter}”` : ''} yet.</p></Card>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(s => (
            <SponsorRow key={s.id} sponsor={s}
              expanded={selectedId === s.id}
              onToggle={() => setSelectedId(selectedId === s.id ? null : s.id)}
              onChanged={loadSponsors} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── New sponsor ──────────────────────────────────────────────────────────────
function NewSponsorForm({ onCreated }: { onCreated: (s: Sponsor) => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', website_url: '', contact_name: '', contact_email: '', phone: '' })

  const create = async () => {
    if (!form.name.trim()) { toast.error('Name required'); return }
    setBusy(true)
    const res = await fetch('/api/sponsors', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, status: 'active' }),
    })
    setBusy(false)
    const d = await res.json()
    if (!res.ok) { toast.error(d.error ?? 'Failed'); return }
    toast.success('Sponsor created')
    setForm({ name: '', website_url: '', contact_name: '', contact_email: '', phone: '' })
    setOpen(false)
    onCreated(d.sponsor)
  }

  if (!open) return (
    <button onClick={() => setOpen(true)} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700">
      + New sponsor
    </button>
  )

  return (
    <Card className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Sponsor name *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
        <Field label="Website URL" value={form.website_url} onChange={v => setForm(f => ({ ...f, website_url: v }))} placeholder="https://…" />
        <Field label="Contact name" value={form.contact_name} onChange={v => setForm(f => ({ ...f, contact_name: v }))} />
        <Field label="Contact email" value={form.contact_email} onChange={v => setForm(f => ({ ...f, contact_email: v }))} />
        <Field label="Phone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} />
      </div>
      <div className="flex gap-2">
        <button disabled={busy} onClick={create} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
          {busy ? 'Creating…' : 'Create sponsor'}
        </button>
        <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium">Cancel</button>
      </div>
    </Card>
  )
}

// ── Sponsor row (collapsible editor + campaigns) ─────────────────────────────
function SponsorRow({ sponsor, expanded, onToggle, onChanged }: {
  sponsor: Sponsor; expanded: boolean; onToggle: () => void; onChanged: () => void
}) {
  const [edit, setEdit] = useState<Sponsor>(sponsor)
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
  const [loadingCamps, setLoadingCamps] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const logoRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setEdit(sponsor) }, [sponsor])

  const loadCampaigns = useCallback(() => {
    setLoadingCamps(true)
    fetch(`/api/sponsors/${sponsor.id}`).then(r => r.json())
      .then(d => setCampaigns(d.campaigns ?? []))
      .finally(() => setLoadingCamps(false))
  }, [sponsor.id])

  useEffect(() => { if (expanded) loadCampaigns() }, [expanded, loadCampaigns])

  const save = async () => {
    setSaving(true)
    const res = await fetch(`/api/sponsors/${sponsor.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: edit.name, website_url: edit.website_url, contact_name: edit.contact_name,
        contact_email: edit.contact_email, phone: edit.phone, logo_tone: edit.logo_tone,
        status: edit.status, notes: edit.notes,
      }),
    })
    setSaving(false)
    if (res.ok) { toast.success('Saved'); onChanged() } else toast.error('Save failed')
  }

  const uploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast.error('Logo must be under 5 MB'); return }
    setUploading(true)
    try {
      // Upload server-side (service role) so it works regardless of storage RLS
      // and overwrites the sponsor's existing logo cleanly.
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/sponsors/${sponsor.id}/logo`, { method: 'POST', body: fd })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error('Upload failed: ' + (d.error ?? res.status)); return }
      setEdit(p => ({ ...p, logo_url: d.logo_url }))
      toast.success('Logo updated')
      onChanged()
    } finally {
      setUploading(false)
      if (logoRef.current) logoRef.current.value = ''
    }
  }

  const remove = async () => {
    if (!confirm(`Delete “${sponsor.name}” and all its campaigns?`)) return
    const res = await fetch(`/api/sponsors/${sponsor.id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Deleted'); onChanged() } else toast.error('Delete failed')
  }

  const liveCount = campaigns.filter(c => campaignStatus(c) === 'live').length

  return (
    <Card className="overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 text-left">
        <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
          {sponsor.logo_url
            ? <img src={sponsor.logo_url} alt="" className="max-w-full max-h-full object-contain" />
            : <span className="text-gray-300 text-lg">🏷️</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 truncate">{sponsor.name}</span>
            <span className={clsx('text-[10px] uppercase font-bold px-1.5 py-0.5 rounded', SPONSOR_BADGE[sponsor.status])}>{sponsor.status}</span>
          </div>
          <p className="text-xs text-gray-400 truncate">{sponsor.contact_email || sponsor.website_url || sponsor.slug}</p>
        </div>
        {expanded && liveCount > 0 && <span className="text-[11px] font-bold text-emerald-600">{liveCount} live</span>}
        <span className="text-gray-300">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-5">
          {/* Brand details */}
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Name" value={edit.name} onChange={v => setEdit(p => ({ ...p, name: v }))} />
            <Field label="Website URL" value={edit.website_url ?? ''} onChange={v => setEdit(p => ({ ...p, website_url: v }))} />
            <Field label="Contact name" value={edit.contact_name ?? ''} onChange={v => setEdit(p => ({ ...p, contact_name: v }))} />
            <Field label="Contact email" value={edit.contact_email ?? ''} onChange={v => setEdit(p => ({ ...p, contact_email: v }))} />
            <Field label="Phone" value={edit.phone ?? ''} onChange={v => setEdit(p => ({ ...p, phone: v }))} />
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
              <select value={edit.status} onChange={e => setEdit(p => ({ ...p, status: e.target.value as SponsorStatus }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="active">Active</option>
                <option value="lead">Lead</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          {/* Logo + tone */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className={clsx('w-20 h-14 rounded-lg flex items-center justify-center overflow-hidden border',
              edit.logo_tone === 'dark' ? 'bg-white border-gray-200' : 'bg-gray-800 border-gray-700')}>
              {edit.logo_url
                ? <img src={edit.logo_url} alt="" className="max-w-full max-h-full object-contain p-1" />
                : <span className="text-gray-300 text-xs">No logo</span>}
            </div>
            <div className="space-y-2">
              <input ref={logoRef} type="file" accept="image/*" onChange={uploadLogo} className="hidden" />
              <button onClick={() => logoRef.current?.click()} disabled={uploading}
                className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 disabled:opacity-50">
                {uploading ? 'Uploading…' : edit.logo_url ? 'Replace logo' : 'Upload logo'}
              </button>
              <div className="flex gap-1.5">
                {(['dark', 'light'] as LogoTone[]).map(t => (
                  <button key={t} onClick={() => setEdit(p => ({ ...p, logo_tone: t }))}
                    className={clsx('px-2.5 py-1 rounded text-xs font-medium border',
                      edit.logo_tone === t ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-500')}>
                    {t === 'dark' ? 'Dark logo' : 'Light logo'}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 max-w-xs">“Dark logo” = dark ink (gets a light backing on dark surfaces). Folder: <code>sponsors/{sponsor.slug}/</code></p>
            </div>
          </div>

          <div className="flex gap-2">
            <button disabled={saving} onClick={save} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save details'}
            </button>
            <button onClick={remove} className="px-4 py-2 rounded-lg bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100 ml-auto">Delete</button>
          </div>

          {/* Challenges this sponsor backs — grouped by challenge, campaigns nested */}
          <div className="pt-4 border-t border-gray-100">
            <h3 className="text-sm font-bold text-gray-900 mb-2">Challenges</h3>
            {loadingCamps ? (
              <div className="flex justify-center py-4"><Spinner className="w-5 h-5" /></div>
            ) : (
              <div className="space-y-3">
                {groupByChallenge(campaigns).map(g => (
                  <div key={g.challengeId} className="rounded-xl border border-gray-200 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-900 truncate">{g.name}</span>
                      <span className="text-[10px] uppercase font-semibold text-gray-400">{challengeTypeLabel(g.type)}</span>
                      {g.slug && <a href={leaderboardPathFor(g.type, g.slug)} target="_blank" rel="noopener noreferrer" className="ml-auto text-[11px] font-semibold text-emerald-600 hover:underline whitespace-nowrap">Leaderboard ↗</a>}
                    </div>
                    {g.campaigns.map(c => (
                      <CampaignCard key={c.id} campaign={c} hideLabel onChanged={() => { loadCampaigns(); onChanged() }} />
                    ))}
                    {sponsor.status === 'active' && (
                      <AddCampaignToChallenge sponsorId={sponsor.id} challengeId={g.challengeId} onCreated={() => { loadCampaigns(); onChanged() }} />
                    )}
                  </div>
                ))}
                {sponsor.status === 'active'
                  ? <NewChallengeForSponsor sponsorId={sponsor.id} sponsorName={sponsor.name} usedTypes={usedTypesOf(campaigns)} onCreated={() => { loadCampaigns(); onChanged() }} />
                  : <p className="text-[11px] text-gray-400 text-center py-1">Set this sponsor to <b>Active</b> to add a challenge.</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

// Group a sponsor's campaigns by their challenge (one group per challenge).
function groupByChallenge(campaigns: CampaignRow[]): { challengeId: string; name: string; type: string; slug: string; campaigns: CampaignRow[] }[] {
  const m = new Map<string, { challengeId: string; name: string; type: string; slug: string; campaigns: CampaignRow[] }>()
  for (const c of campaigns) {
    const cid = (c as any).challenge_id as string
    if (!cid) continue
    if (!m.has(cid)) m.set(cid, { challengeId: cid, name: c.challenges?.name ?? 'Challenge', type: c.challenges?.type ?? 'bracket', slug: c.challenges?.slug ?? '', campaigns: [] })
    m.get(cid)!.campaigns.push(c)
  }
  return Array.from(m.values())
}
// Challenge types this sponsor already runs (one challenge per type).
function usedTypesOf(campaigns: CampaignRow[]): Set<string> {
  return new Set(campaigns.map(c => c.challenges?.type).filter(Boolean) as string[])
}

// ── Campaign card (edit/toggle/delete) ───────────────────────────────────────
function CampaignCard({ campaign, hideLabel, onChanged }: { campaign: CampaignRow; hideLabel?: boolean; onChanged: () => void }) {
  const [c, setC] = useState(campaign)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setC(campaign) }, [campaign])

  const status = campaignStatus(c)
  const challengeLabel = campaign.challenges?.name ?? 'Bracket Challenge'

  const patch = async (body: any, okMsg?: string) => {
    setBusy(true)
    const res = await fetch(`/api/sponsors/campaigns/${campaign.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    setBusy(false)
    if (res.ok) { if (okMsg) toast.success(okMsg); onChanged() } else toast.error('Update failed')
  }

  const remove = async () => {
    if (!confirm('Delete this campaign?')) return
    const res = await fetch(`/api/sponsors/campaigns/${campaign.id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Deleted'); onChanged() } else toast.error('Delete failed')
  }

  return (
    <div className="rounded-lg border border-gray-200 p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        {!hideLabel && <span className="text-sm font-semibold text-gray-800">{challengeLabel}</span>}
        <span className={clsx('text-[10px] uppercase font-bold px-1.5 py-0.5 rounded', STATUS_BADGE[status])}>{status}</span>
        <button onClick={() => patch({ enabled: !c.enabled }, c.enabled ? 'Disabled' : 'Enabled')} disabled={busy}
          className={clsx('ml-auto text-xs font-medium px-2 py-1 rounded', c.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
          {c.enabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>
      <div className="grid sm:grid-cols-2 gap-2.5">
        <Field label="Headline prize (the total to win)" value={c.prize ?? ''} onChange={v => setC(p => ({ ...p, prize: v }))} placeholder="e.g. $500 worth of fuel vouchers" />
        <Field label="Click-through URL" value={c.click_url ?? ''} onChange={v => setC(p => ({ ...p, click_url: v }))} placeholder="defaults to sponsor website" />
        <Field label="1st place (optional)" value={c.prize_1 ?? ''} onChange={v => setC(p => ({ ...p, prize_1: v }))} placeholder="e.g. $250" />
        <Field label="2nd place (optional)" value={c.prize_2 ?? ''} onChange={v => setC(p => ({ ...p, prize_2: v }))} placeholder="e.g. $150" />
        <Field label="3rd place (optional)" value={c.prize_3 ?? ''} onChange={v => setC(p => ({ ...p, prize_3: v }))} placeholder="e.g. $100" />
        <DateField label="Starts" value={c.starts_at} onChange={v => setC(p => ({ ...p, starts_at: v }))} />
        <DateField label="Ends (lock)" value={c.ends_at} onChange={v => setC(p => ({ ...p, ends_at: v }))} />
      </div>
      <div className="flex gap-2">
        <button disabled={busy}
          onClick={() => patch({ prize: c.prize, prize_1: c.prize_1, prize_2: c.prize_2, prize_3: c.prize_3, click_url: c.click_url, starts_at: c.starts_at, ends_at: c.ends_at }, 'Saved')}
          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50">Save</button>
        <button onClick={remove} className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 ml-auto">Delete</button>
      </div>
    </div>
  )
}

// ── Add a campaign under an existing challenge ───────────────────────────────
function AddCampaignToChallenge({ sponsorId, challengeId, onCreated }: { sponsorId: string; challengeId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [prize, setPrize] = useState('')
  const [clickUrl, setClickUrl] = useState('')
  const [startsAt, setStartsAt] = useState<string | null>(new Date().toISOString())
  const [endsAt, setEndsAt] = useState<string | null>(null)

  const create = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/sponsors/campaigns', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsor_id: sponsorId, challenge_id: challengeId, prize, click_url: clickUrl, starts_at: startsAt, ends_at: endsAt }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error ?? 'Failed to add campaign'); return }
      toast.success('Campaign added')
      setPrize(''); setClickUrl(''); setStartsAt(new Date().toISOString()); setEndsAt(null); setOpen(false)
      onCreated()
    } catch {
      toast.error('Network error')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return (
    <button onClick={() => setOpen(true)} className="w-full py-1.5 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 hover:border-emerald-400 hover:text-emerald-600">
      + Add a campaign
    </button>
  )

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2.5">
      <p className="text-[11px] text-gray-500">Next promotion under this challenge — must not overlap an existing campaign.</p>
      <div className="grid sm:grid-cols-2 gap-2.5">
        <Field label="Prize" value={prize} onChange={setPrize} placeholder="e.g. $250 Fuel Voucher" />
        <Field label="Click-through URL" value={clickUrl} onChange={setClickUrl} placeholder="defaults to sponsor website" />
        <DateField label="Starts" value={startsAt} onChange={setStartsAt} />
        <DateField label="Ends (lock)" value={endsAt} onChange={setEndsAt} />
      </div>
      <div className="flex gap-2">
        <button disabled={busy} onClick={create} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50">
          {busy ? 'Adding…' : 'Add campaign'}
        </button>
        <button onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium">Cancel</button>
      </div>
    </div>
  )
}

// ── New challenge for this sponsor (type + auto-derived name) ─────────────────
// Creates a challenge of a type the sponsor doesn't run yet, plus its first
// campaign. Name derives from sponsor + type (one challenge per type).
function NewChallengeForSponsor({ sponsorId, sponsorName, usedTypes, onCreated }: { sponsorId: string; sponsorName: string; usedTypes: Set<string>; onCreated: () => void }) {
  const available = AVAILABLE_CHALLENGE_TYPES.filter(t => !usedTypes.has(t))
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [type, setType] = useState<string>(available[0] ?? 'bracket')
  const [access, setAccess] = useState<'open' | 'invite'>('open')
  const [slug, setSlug] = useState('')
  const [touchedSlug, setTouchedSlug] = useState(false)
  const [prize, setPrize] = useState('')
  const [clickUrl, setClickUrl] = useState('')
  const [startsAt, setStartsAt] = useState<string | null>(new Date().toISOString())
  const [endsAt, setEndsAt] = useState<string | null>(null)

  const name = deriveChallengeName(sponsorName, type)
  // Slug = <type-prefix>-<sponsor>, e.g. "br-gatedflow" (globally unique by type).
  const defaultSlug = deriveChallengeSlug(sponsorName, type)
  const effectiveSlug = (touchedSlug && slug.trim() ? toSlug(slug) : defaultSlug) || '—'

  const create = async () => {
    setBusy(true)
    try {
      const cr = await fetch('/api/bracket/challenges', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, access, slug: touchedSlug ? slug.trim() : defaultSlug }),
      })
      const cd = await cr.json().catch(() => ({}))
      if (!cr.ok) { toast.error(cd.error ?? 'Failed to create challenge'); return }
      const camp = await fetch('/api/sponsors/campaigns', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsor_id: sponsorId, challenge_id: cd.challenge.id, prize, click_url: clickUrl, starts_at: startsAt, ends_at: endsAt }),
      })
      const campd = await camp.json().catch(() => ({}))
      if (!camp.ok) {
        // Roll back the challenge so a rejected sponsor doesn't leave an orphan.
        toast.error(`Couldn’t attach sponsor: ${campd.error ?? 'failed'}. No challenge created.`)
        await fetch(`/api/bracket/challenges/${cd.challenge.id}`, { method: 'DELETE' }).catch(() => {})
        return
      }
      toast.success('Challenge created for this sponsor')
      setOpen(false)
      onCreated()
    } catch {
      toast.error('Network error')
    } finally {
      setBusy(false)
    }
  }

  if (!available.length) return (
    <p className="text-[11px] text-gray-400 text-center py-1">{sponsorName} already runs every available challenge type.</p>
  )

  if (!open) return (
    <button onClick={() => setOpen(true)} className="w-full py-2 rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 hover:border-emerald-400 hover:text-emerald-600">
      + Add a challenge for {sponsorName}
    </button>
  )

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2.5">
      <p className="text-xs text-gray-500">New <b>{challengeTypeLabel(type)}</b> challenge for <b>{sponsorName}</b> → <b className="text-gray-700">{name}</b>. Starts now → live immediately.</p>
      <div className="grid sm:grid-cols-2 gap-2.5">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
          <select value={type} onChange={e => setType(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none">
            {available.map(t => <option key={t} value={t}>{challengeTypeLabel(t)}</option>)}
          </select>
        </div>
        <div>
          <Field label="Slug" value={touchedSlug ? slug : ''} placeholder="auto from sponsor" onChange={v => { setSlug(v); setTouchedSlug(true) }} />
          <p className="text-[11px] text-gray-400 mt-1"><b className="text-gray-600">{leaderboardPathFor(type, effectiveSlug)}</b></p>
        </div>
        <Field label="Prize" value={prize} onChange={setPrize} placeholder="e.g. $250 Fuel Voucher" />
        <Field label="Click-through URL" value={clickUrl} onChange={setClickUrl} placeholder="defaults to sponsor website" />
        <DateField label="Starts" value={startsAt} onChange={setStartsAt} />
        <DateField label="Ends (lock)" value={endsAt} onChange={setEndsAt} />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-xs font-medium text-gray-500">Access</label>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          {(['open', 'invite'] as const).map(a => (
            <button key={a} type="button" onClick={() => setAccess(a)}
              className={clsx('px-2.5 py-1 font-medium', access === a ? 'bg-emerald-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50')}>
              {a === 'open' ? 'Open · anyone' : 'Invite-only · link'}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button disabled={busy} onClick={create} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50">
          {busy ? 'Creating…' : 'Create challenge'}
        </button>
        <button onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium">Cancel</button>
      </div>
    </div>
  )
}

// ── Small inputs ─────────────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
    </div>
  )
}
function DateField({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input type="datetime-local" value={toLocalInput(value)} onChange={e => onChange(fromLocalInput(e.target.value))}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
    </div>
  )
}
