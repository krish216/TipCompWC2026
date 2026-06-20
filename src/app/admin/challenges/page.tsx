'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Spinner, Card } from '@/components/ui'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { campaignStatus, toSlug } from '@/lib/sponsors/campaigns'
import type { CampaignStatus } from '@/lib/sponsors/types'

interface ManagedChallenge {
  id: string; slug: string; name: string; enabled: boolean; entrants: number
  sponsor: { name: string; logo: string; prize: string; url: string; logo_tone: string; starts_at?: string | null; ends_at?: string | null } | null
  sponsor_state?: 'live' | 'scheduled' | 'ended' | 'none'
}
interface SponsorOpt { id: string; name: string; logo_url: string | null }

const STATUS_BADGE: Record<CampaignStatus, string> = {
  live:      'bg-emerald-100 text-emerald-700',
  scheduled: 'bg-amber-100 text-amber-700',
  ended:     'bg-gray-100 text-gray-500',
  disabled:  'bg-gray-100 text-gray-400',
}

export default function ChallengesAdminPage() {
  const { session } = useSupabase()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [challenges, setChallenges] = useState<ManagedChallenge[]>([])
  const [sponsors, setSponsors] = useState<SponsorOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    if (!session) { setIsAdmin(false); return }
    fetch('/api/admin').then(r => r.json()).then(d => setIsAdmin(!!d.is_admin)).catch(() => setIsAdmin(false))
  }, [session])

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/bracket/challenges?manage=1').then(r => r.json()),
      fetch('/api/sponsors').then(r => r.json()),
    ])
      .then(([c, s]) => {
        setChallenges(Array.isArray(c?.challenges) ? c.challenges : [])
        setSponsors((s?.sponsors ?? []).map((x: any) => ({ id: x.id, name: x.name, logo_url: x.logo_url })))
      })
      .catch(() => toast.error('Failed to load challenges'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { if (isAdmin) load() }, [isAdmin, load])

  if (isAdmin === null) return <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
  if (!isAdmin) return <div className="max-w-md mx-auto py-20 text-center text-gray-500">Admin access required.</div>

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link href="/admin" className="text-sm text-emerald-600 hover:underline">← Admin</Link>
          <h1 className="text-2xl font-extrabold text-gray-900 mt-1">Bracket Challenges</h1>
          <p className="text-sm text-gray-500">Create challenges (each with its own leaderboard) and attach a sponsor to each.</p>
        </div>
        <Link href="/admin/sponsors" className="text-sm font-semibold text-emerald-600 hover:underline mt-1">Manage sponsors →</Link>
      </div>

      <NewChallengeForm sponsors={sponsors} onCreated={(c) => { load(); setOpenId(c.id) }} />

      {loading ? (
        <div className="flex justify-center py-12"><Spinner className="w-7 h-7" /></div>
      ) : challenges.length === 0 ? (
        <Card><p className="text-center text-gray-400 py-8 text-sm">No bracket challenges yet — create one above.</p></Card>
      ) : (
        <div className="space-y-2.5">
          {challenges.map(c => (
            <ChallengeRow key={c.id} ch={c} sponsors={sponsors}
              expanded={openId === c.id}
              onToggle={() => setOpenId(openId === c.id ? null : c.id)}
              onChanged={load} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── New challenge (with its sponsor campaign) ────────────────────────────────
function NewChallengeForm({ sponsors, onCreated }: { sponsors: SponsorOpt[]; onCreated: (c: { id: string }) => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')          // blank → auto from name
  const [touchedSlug, setTouchedSlug] = useState(false)
  // The sponsor campaign attached at creation (optional). Starts now → live now.
  const [sponsorId, setSponsorId] = useState('')
  const [prize, setPrize]       = useState('')
  const [clickUrl, setClickUrl] = useState('')
  const [startsAt, setStartsAt] = useState<string | null>(new Date().toISOString())
  const [endsAt, setEndsAt]     = useState<string | null>(null)   // blank → backend default (R32 lock)

  const effectiveSlug = (touchedSlug && slug.trim() ? toSlug(slug) : toSlug(name)) || '—'

  const reset = () => {
    setName(''); setSlug(''); setTouchedSlug(false)
    setSponsorId(''); setPrize(''); setClickUrl(''); setStartsAt(new Date().toISOString()); setEndsAt(null)
    setOpen(false)
  }

  const create = async () => {
    if (!name.trim()) { toast.error('Name required'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/bracket/challenges', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), slug: touchedSlug ? slug.trim() : undefined }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error ?? 'Failed to create'); return }

      // Attach the sponsor campaign in the same step (if chosen).
      if (sponsorId) {
        const cr = await fetch('/api/sponsors/campaigns', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sponsor_id: sponsorId, challenge_id: d.challenge.id, prize, click_url: clickUrl, starts_at: startsAt, ends_at: endsAt }),
        })
        const cd = await cr.json().catch(() => ({}))
        if (!cr.ok) toast.error(`Challenge created, but sponsor not attached: ${cd.error ?? 'failed'}`)
        else toast.success('Challenge + sponsor created')
      } else {
        toast.success('Challenge created')
      }
      reset()
      onCreated(d.challenge)
    } catch {
      toast.error('Network error')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return (
    <button onClick={() => setOpen(true)} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700">
      + New challenge
    </button>
  )

  return (
    <Card className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Challenge name *" value={name} onChange={setName} placeholder="e.g. GatedFlow Bracket Challenge" />
        <div>
          <Field label="Slug (leaderboard URL)" value={touchedSlug ? slug : ''} placeholder="auto from name"
            onChange={v => { setSlug(v); setTouchedSlug(true) }} />
          <p className="text-[11px] text-gray-400 mt-1">/bracket/leaderboard/<b className="text-gray-600">{effectiveSlug}</b></p>
        </div>
      </div>

      {/* Sponsor campaign — attached in the same step */}
      <div className="border-t border-gray-100 pt-3 space-y-2.5">
        <p className="text-xs font-semibold text-gray-500">Sponsor campaign <span className="font-normal text-gray-400">(optional)</span></p>
        {sponsors.length === 0 ? (
          <p className="text-[11px] text-gray-400">No sponsors yet — <Link href="/admin/sponsors" className="text-emerald-600 hover:underline">create one</Link> to attach.</p>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Sponsor</label>
                <select value={sponsorId} onChange={e => setSponsorId(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none">
                  <option value="">No sponsor</option>
                  {sponsors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <Field label="Prize" value={prize} onChange={setPrize} placeholder="e.g. $250 Fuel Voucher" />
              <Field label="Click-through URL" value={clickUrl} onChange={setClickUrl} placeholder="defaults to sponsor website" />
              <div className="grid grid-cols-2 gap-2.5">
                <DateField label="Starts" value={startsAt} onChange={setStartsAt} />
                <DateField label="Ends (lock)" value={endsAt} onChange={setEndsAt} />
              </div>
            </div>
            {sponsorId && <p className="text-[11px] text-gray-400">Starts now → goes live immediately. Leave Ends blank for the default (first R32 kick-off).</p>}
          </>
        )}
      </div>

      <div className="flex gap-2">
        <button disabled={busy} onClick={create} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
          {busy ? 'Creating…' : 'Create challenge'}
        </button>
        <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium">Cancel</button>
      </div>
    </Card>
  )
}

// ── Challenge row ─────────────────────────────────────────────────────────────
function ChallengeRow({ ch, sponsors, expanded, onToggle, onChanged }: {
  ch: ManagedChallenge; sponsors: SponsorOpt[]; expanded: boolean; onToggle: () => void; onChanged: () => void
}) {
  const [name, setName] = useState(ch.name)
  const [slug, setSlug] = useState(ch.slug)
  const [saving, setSaving] = useState(false)
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loadingCamps, setLoadingCamps] = useState(false)

  useEffect(() => { setName(ch.name); setSlug(ch.slug) }, [ch.name, ch.slug])

  const loadCampaigns = useCallback(() => {
    setLoadingCamps(true)
    fetch(`/api/sponsors/campaigns?challenge_id=${ch.id}`).then(r => r.json())
      .then(d => setCampaigns(d.campaigns ?? []))
      .finally(() => setLoadingCamps(false))
  }, [ch.id])

  useEffect(() => { if (expanded) loadCampaigns() }, [expanded, loadCampaigns])

  const patch = async (body: any, okMsg?: string) => {
    setSaving(true)
    const res = await fetch(`/api/bracket/challenges/${ch.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { toast.error(d.error ?? 'Update failed'); return false }
    if (okMsg) toast.success(okMsg)
    onChanged()
    return true
  }

  const remove = async () => {
    if (!confirm(`Delete “${ch.name}”? Its ${ch.entrants} entr${ch.entrants === 1 ? 'y' : 'ies'} will be removed. Brackets themselves are kept.`)) return
    const res = await fetch(`/api/bracket/challenges/${ch.id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Challenge deleted'); onChanged() } else toast.error('Delete failed')
  }

  return (
    <Card className="overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 text-left">
        <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
          {ch.sponsor?.logo ? <img src={ch.sponsor.logo} alt="" className="max-w-full max-h-full object-contain p-0.5" /> : <span className="text-gray-300 text-lg">🏆</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 truncate">{ch.name}</span>
            {!ch.enabled && <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">disabled</span>}
          </div>
          <p className="text-xs text-gray-400 truncate">
            <span className="font-mono">/{ch.slug}</span> · {ch.entrants} entr{ch.entrants === 1 ? 'y' : 'ies'}
            {ch.sponsor_state === 'live' && ch.sponsor ? <> · <span className="text-emerald-600">{ch.sponsor.name} · live</span></>
              : ch.sponsor_state === 'scheduled' && ch.sponsor ? <> · <span className="text-amber-600">{ch.sponsor.name} · live {ch.sponsor.starts_at ? new Date(ch.sponsor.starts_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : 'soon'}</span></>
              : ch.sponsor_state === 'ended' && ch.sponsor ? <> · <span className="text-gray-400">{ch.sponsor.name} · ended</span></>
              : <> · <span className="text-amber-600">no sponsor</span></>}
          </p>
        </div>
        <span className="text-gray-300">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-5">
          {/* Details */}
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Name" value={name} onChange={setName} />
            <div>
              <Field label="Slug (leaderboard URL)" value={slug} onChange={setSlug} />
              <p className="text-[11px] text-gray-400 mt-1">
                <Link href={`/bracket/leaderboard/${ch.slug}`} target="_blank" className="text-emerald-600 hover:underline">/bracket/leaderboard/{ch.slug} ↗</Link>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button disabled={saving}
              onClick={() => patch({ name: name.trim(), slug: slug.trim() }, 'Saved')}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save details'}
            </button>
            <button disabled={saving} onClick={() => patch({ enabled: !ch.enabled }, ch.enabled ? 'Disabled' : 'Enabled')}
              className={clsx('px-3 py-2 rounded-lg text-sm font-medium', ch.enabled ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>
              {ch.enabled ? 'Enabled' : 'Disabled'}
            </button>
            <button onClick={remove} className="px-4 py-2 rounded-lg bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100 ml-auto">Delete challenge</button>
          </div>

          {/* Sponsor campaigns on THIS challenge */}
          <div className="pt-4 border-t border-gray-100">
            <h3 className="text-sm font-bold text-gray-900 mb-2">Sponsor</h3>
            {loadingCamps ? (
              <div className="flex justify-center py-4"><Spinner className="w-5 h-5" /></div>
            ) : (
              <div className="space-y-2">
                {campaigns.map(c => (
                  <CampaignCard key={c.id} campaign={c} onChanged={() => { loadCampaigns(); onChanged() }} />
                ))}
                <AttachSponsorForm challengeId={ch.id} sponsors={sponsors} onCreated={() => { loadCampaigns(); onChanged() }} />
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

// ── Campaign card (edit/toggle/delete) — scoped to one challenge ──────────────
function CampaignCard({ campaign, onChanged }: { campaign: any; onChanged: () => void }) {
  const [c, setC] = useState(campaign)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setC(campaign) }, [campaign])

  const status = campaignStatus(c)
  const sponsorName = campaign.sponsors?.name ?? 'Sponsor'

  const patch = async (body: any, okMsg?: string) => {
    setBusy(true)
    const res = await fetch(`/api/sponsors/campaigns/${campaign.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    setBusy(false)
    if (res.ok) { if (okMsg) toast.success(okMsg); onChanged() } else toast.error('Update failed')
  }

  const remove = async () => {
    if (!confirm(`Remove ${sponsorName} from this challenge?`)) return
    const res = await fetch(`/api/sponsors/campaigns/${campaign.id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Sponsor removed'); onChanged() } else toast.error('Delete failed')
  }

  return (
    <div className="rounded-lg border border-gray-200 p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-800 truncate">{sponsorName}</span>
        <span className={clsx('text-[10px] uppercase font-bold px-1.5 py-0.5 rounded', STATUS_BADGE[status])}>{status}</span>
        <button onClick={() => patch({ enabled: !c.enabled }, c.enabled ? 'Disabled' : 'Enabled')} disabled={busy}
          className={clsx('ml-auto text-xs font-medium px-2 py-1 rounded', c.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
          {c.enabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>
      <div className="grid sm:grid-cols-2 gap-2.5">
        <Field label="Prize" value={c.prize ?? ''} onChange={v => setC((p: any) => ({ ...p, prize: v }))} placeholder="e.g. $500 voucher" />
        <Field label="Click-through URL" value={c.click_url ?? ''} onChange={v => setC((p: any) => ({ ...p, click_url: v }))} placeholder="defaults to sponsor website" />
        <DateField label="Starts" value={c.starts_at} onChange={v => setC((p: any) => ({ ...p, starts_at: v }))} />
        <DateField label="Ends (lock)" value={c.ends_at} onChange={v => setC((p: any) => ({ ...p, ends_at: v }))} />
      </div>
      <div className="flex gap-2">
        <button disabled={busy}
          onClick={() => patch({ prize: c.prize, click_url: c.click_url, starts_at: c.starts_at, ends_at: c.ends_at }, 'Saved')}
          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50">Save</button>
        <button onClick={remove} className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 ml-auto">Remove</button>
      </div>
    </div>
  )
}

// ── Attach a sponsor to this challenge ────────────────────────────────────────
function AttachSponsorForm({ challengeId, sponsors, onCreated }: {
  challengeId: string; sponsors: SponsorOpt[]; onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sponsorId, setSponsorId] = useState('')
  const [prize, setPrize] = useState('')
  const [clickUrl, setClickUrl] = useState('')
  const [startsAt, setStartsAt] = useState<string | null>(null)
  const [endsAt, setEndsAt] = useState<string | null>(null)

  const create = async () => {
    if (!sponsorId) { toast.error('Pick a sponsor'); return }
    setBusy(true)
    const res = await fetch('/api/sponsors/campaigns', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sponsor_id: sponsorId, challenge_id: challengeId, prize, click_url: clickUrl, starts_at: startsAt, ends_at: endsAt }),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { toast.error(d.error ?? 'Failed to attach'); return }
    toast.success('Sponsor attached')
    setSponsorId(''); setPrize(''); setClickUrl(''); setStartsAt(null); setEndsAt(null); setOpen(false)
    onCreated()
  }

  if (!sponsors.length) return (
    <p className="text-xs text-gray-400 text-center py-2">
      No sponsors yet — <Link href="/admin/sponsors" className="text-emerald-600 hover:underline">create one</Link> first.
    </p>
  )

  if (!open) return (
    <button onClick={() => setOpen(true)} className="w-full py-2 rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 hover:border-emerald-400 hover:text-emerald-600">
      + Attach a sponsor
    </button>
  )

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2.5">
      <p className="text-xs text-gray-500">Leave dates blank for the default 5-day window ending at the first R32 kick-off.</p>
      <div className="grid sm:grid-cols-2 gap-2.5">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Sponsor *</label>
          <select value={sponsorId} onChange={e => setSponsorId(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none">
            <option value="">Select a sponsor…</option>
            {sponsors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <Field label="Prize" value={prize} onChange={setPrize} placeholder="e.g. $300 Fuel Voucher" />
        <Field label="Click-through URL" value={clickUrl} onChange={setClickUrl} placeholder="defaults to sponsor website" />
        <div className="grid grid-cols-2 gap-2.5 sm:col-span-2">
          <DateField label="Starts" value={startsAt} onChange={setStartsAt} />
          <DateField label="Ends (lock)" value={endsAt} onChange={setEndsAt} />
        </div>
      </div>
      <div className="flex gap-2">
        <button disabled={busy} onClick={create} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50">
          {busy ? 'Attaching…' : 'Attach sponsor'}
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
  const toLocal = (iso: string | null) => {
    if (!iso) return ''
    const d = new Date(iso); const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const fromLocal = (local: string) => { if (!local) return null; const d = new Date(local); return isNaN(d.getTime()) ? null : d.toISOString() }
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input type="datetime-local" value={toLocal(value)} onChange={e => onChange(fromLocal(e.target.value))}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
    </div>
  )
}
