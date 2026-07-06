'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Spinner, Card } from '@/components/ui'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { campaignStatus, toSlug } from '@/lib/sponsors/campaigns'
import { AVAILABLE_CHALLENGE_TYPES, challengeTypeLabel, deriveChallengeName, deriveChallengeSlug, leaderboardPathFor } from '@/lib/challenges/registry'
import type { CampaignStatus } from '@/lib/sponsors/types'

interface ManagedChallenge {
  id: string; slug: string; name: string; type: string; access: string; closes_at: string | null; enabled: boolean; entrants: number
  sponsor: { id?: string; name: string; logo: string; prize: string; url: string; logo_tone: string; starts_at?: string | null; ends_at?: string | null } | null
  sponsor_state?: 'live' | 'scheduled' | 'ended' | 'none'
  fixture?: { id: number; home: string; away: string; kickoff_utc: string; home_score: number | null; away_score: number | null; first_goal_min: number | null } | null
  promote_surfaces?: string[]
  home_image_url?: string | null
  away_image_url?: string | null
}

const PROMO_SURFACES: { key: string; label: string }[] = [
  { key: 'home',       label: 'Homepage' },
  { key: 'scoreboard', label: 'Scoreboard' },
]
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
          <Link href="/admin/sponsors" className="text-sm text-emerald-600 hover:underline">← Sponsors</Link>
          <h1 className="text-2xl font-extrabold text-gray-900 mt-1">Challenges</h1>
          <p className="text-sm text-gray-500">Create bracket or single-match challenges (each with its own leaderboard) and attach a sponsor to each.</p>
        </div>
        <Link href="/admin" className="text-sm font-semibold text-emerald-600 hover:underline mt-1">Admin home →</Link>
      </div>

      <NewChallengeForm sponsors={sponsors} onCreated={(c) => { load(); setOpenId(c.id) }} />

      {loading ? (
        <div className="flex justify-center py-12"><Spinner className="w-7 h-7" /></div>
      ) : challenges.length === 0 ? (
        <Card><p className="text-center text-gray-400 py-8 text-sm">No challenges yet — create one above.</p></Card>
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
  const [touchedName, setTouchedName] = useState(false)
  const [type, setType] = useState<string>(AVAILABLE_CHALLENGE_TYPES[0] ?? 'bracket')
  // Match challenges: pick an upcoming fixture; entries auto-lock 5 min before kickoff.
  const [fixtures, setFixtures] = useState<{ id: number; home: string; away: string; kickoff_utc: string; round: string }[]>([])
  const [fixtureId, setFixtureId] = useState<string>('')
  const [access, setAccess] = useState<'open' | 'invite'>('open')
  const [closesAt, setClosesAt] = useState<string | null>(null)   // blank → first R32 kick-off
  const [slug, setSlug] = useState('')          // blank → auto from name
  const [touchedSlug, setTouchedSlug] = useState(false)
  // The sponsor campaign attached at creation (optional). Starts now → live now.
  const [sponsorId, setSponsorId] = useState('')
  const [prize, setPrize]       = useState('')
  const [clickUrl, setClickUrl] = useState('')
  const [startsAt, setStartsAt] = useState<string | null>(new Date().toISOString())
  const [endsAt, setEndsAt]     = useState<string | null>(null)   // blank → backend default (R32 lock)

  // Load upcoming fixtures once, when the admin switches to a match challenge.
  useEffect(() => {
    if (type !== 'match' || fixtures.length) return
    fetch('/api/fixtures').then(r => r.json()).then(d => {
      const now = Date.now()
      const list = ((d?.data ?? []) as any[])
        .filter(f => !f.result && f.kickoff_utc && new Date(f.kickoff_utc).getTime() > now)
        .map(f => ({ id: f.id, home: f.home, away: f.away, kickoff_utc: f.kickoff_utc, round: f.round }))
      setFixtures(list)
    }).catch(() => {})
  }, [type, fixtures.length])

  // Name/slug derive from the fixture (match) or sponsor + type, unless overridden.
  const sponsorName = sponsors.find(s => s.id === sponsorId)?.name ?? null
  const matchFx = type === 'match' ? fixtures.find(f => String(f.id) === fixtureId) : undefined
  const derivedName = matchFx ? `${matchFx.home} v ${matchFx.away} · Pick the Score` : deriveChallengeName(sponsorName, type)
  const effName = touchedName && name.trim() ? name : derivedName
  // Slug = <type-prefix>-<sponsor|teams> (e.g. "br-gatedflow", "mt-australia-egypt").
  const defaultSlug = matchFx
    ? deriveChallengeSlug(`${matchFx.home}-${matchFx.away}`, 'match')
    : deriveChallengeSlug(sponsorName || effName, type)
  const effectiveSlug = (touchedSlug && slug.trim() ? toSlug(slug) : defaultSlug) || '—'

  const reset = () => {
    setName(''); setTouchedName(false); setType(AVAILABLE_CHALLENGE_TYPES[0] ?? 'bracket'); setFixtureId(''); setAccess('open'); setClosesAt(null); setSlug(''); setTouchedSlug(false)
    setSponsorId(''); setPrize(''); setClickUrl(''); setStartsAt(new Date().toISOString()); setEndsAt(null)
    setOpen(false)
  }

  const create = async () => {
    if (!effName.trim()) { toast.error('Name required'); return }
    if (type === 'match' && !fixtureId) { toast.error('Pick a fixture for the match challenge'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/bracket/challenges', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: effName.trim(), type, access, closes_at: closesAt, slug: touchedSlug ? slug.trim() : defaultSlug, ...(type === 'match' ? { fixture_id: Number(fixtureId) } : {}) }),
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
        if (!cr.ok) {
          // Roll back the challenge so a rejected sponsor doesn't leave an orphan.
          toast.error(`Couldn’t attach sponsor: ${cd.error ?? 'failed'}. No challenge created.`)
          await fetch(`/api/bracket/challenges/${d.challenge.id}`, { method: 'DELETE' }).catch(() => {})
          reset()
          onCreated(d.challenge)
          return
        }
        toast.success('Challenge + sponsor created')
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
        <Field label="Challenge name *" value={effName} onChange={v => { setName(v); setTouchedName(true) }} placeholder="auto from sponsor + type" />
        <div>
          <Field label="Slug (leaderboard URL)" value={touchedSlug ? slug : ''} placeholder="auto from name"
            onChange={v => { setSlug(v); setTouchedSlug(true) }} />
          <p className="text-[11px] text-gray-400 mt-1"><b className="text-gray-600">{leaderboardPathFor(type, effectiveSlug)}</b></p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
          <select value={type} onChange={e => setType(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none">
            {AVAILABLE_CHALLENGE_TYPES.map(t => <option key={t} value={t}>{challengeTypeLabel(t)}</option>)}
          </select>
        </div>
        {type === 'match' && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Match fixture *</label>
            <select value={fixtureId} onChange={e => setFixtureId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none">
              <option value="">{fixtures.length ? 'Pick a fixture…' : 'Loading fixtures…'}</option>
              {fixtures.map(f => (
                <option key={f.id} value={f.id}>
                  {f.home} v {f.away} · {new Date(f.kickoff_utc).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Sydney' })} AEST
                </option>
              ))}
            </select>
          </div>
        )}
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

      <div className="sm:max-w-xs">
        <DateField
          label={type === 'match' ? 'Entries close (blank → 5 min before kick-off)' : 'Entries close (blank → first R32 kick-off)'}
          value={closesAt} onChange={setClosesAt} />
        {type === 'match' && !closesAt && matchFx && (
          <p className="text-[11px] text-gray-400 mt-1">Auto-locks at {new Date(new Date(matchFx.kickoff_utc).getTime() - 5 * 60 * 1000).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Sydney' })} AEST (5 min before kick-off).</p>
        )}
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
  const [closesAt, setClosesAt] = useState<string | null>(ch.closes_at)
  const [saving, setSaving] = useState(false)
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loadingCamps, setLoadingCamps] = useState(false)
  const [fgm, setFgm] = useState<string>(ch.fixture?.first_goal_min != null ? String(ch.fixture.first_goal_min) : '')
  const [surfaces, setSurfaces] = useState<string[]>(ch.promote_surfaces ?? [])

  useEffect(() => { setName(ch.name); setSlug(ch.slug); setClosesAt(ch.closes_at); setFgm(ch.fixture?.first_goal_min != null ? String(ch.fixture.first_goal_min) : ''); setSurfaces(ch.promote_surfaces ?? []) }, [ch.name, ch.slug, ch.closes_at, ch.fixture?.first_goal_min, ch.promote_surfaces])
  const toggleSurface = (k: string) => setSurfaces(prev => prev.includes(k) ? prev.filter(s => s !== k) : [...prev, k])

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
            <span className={clsx('text-[10px] uppercase font-bold px-1.5 py-0.5 rounded',
              ch.type === 'match' ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700')}>{challengeTypeLabel(ch.type)}</span>
            {ch.access === 'invite' && <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">invite</span>}
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
                <Link href={leaderboardPathFor(ch.type, ch.slug)} target="_blank" className="text-emerald-600 hover:underline">{leaderboardPathFor(ch.type, ch.slug)} ↗</Link>
              </p>
            </div>
            <DateField label="Entries close (blank → first R32 kick-off)" value={closesAt} onChange={setClosesAt} />
          </div>
          {/* Advertise — promo card surfaces */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Advertise with a promo card on <span className="font-normal text-gray-400">(shown to people who haven’t entered)</span></label>
            <div className="flex gap-2 flex-wrap">
              {PROMO_SURFACES.map(s => (
                <button key={s.key} type="button" onClick={() => toggleSurface(s.key)}
                  className={clsx('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                    surfaces.includes(s.key) ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50')}>
                  {surfaces.includes(s.key) ? '✓ ' : ''}{s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button disabled={saving}
              onClick={() => patch({ name: name.trim(), slug: slug.trim(), closes_at: closesAt, promote_surfaces: surfaces }, 'Saved')}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save details'}
            </button>
            <button disabled={saving} onClick={() => patch({ enabled: !ch.enabled }, ch.enabled ? 'Disabled' : 'Enabled')}
              className={clsx('px-3 py-2 rounded-lg text-sm font-medium', ch.enabled ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>
              {ch.enabled ? 'Enabled' : 'Disabled'}
            </button>
            <button disabled={saving} onClick={() => patch({ access: ch.access === 'invite' ? 'open' : 'invite' }, ch.access === 'invite' ? 'Now open to all' : 'Now invite-only')}
              className={clsx('px-3 py-2 rounded-lg text-sm font-medium', ch.access === 'invite' ? 'bg-purple-50 text-purple-700 hover:bg-purple-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
              title={ch.access === 'invite' ? 'Invite-only — hidden from the hub, join via link' : 'Open — listed in the hub'}>
              {ch.access === 'invite' ? 'Invite-only' : 'Open'}
            </button>
            <button onClick={remove} className="px-4 py-2 rounded-lg bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100 ml-auto">Delete challenge</button>
          </div>

          {/* Match result + tie-breaker (match challenges only) */}
          {ch.type === 'match' && ch.fixture && (
            <div className="pt-4 border-t border-gray-100">
              <h3 className="text-sm font-bold text-gray-900 mb-2">Match &amp; tie-breaker</h3>
              <p className="text-xs text-gray-500 mb-2">
                {ch.fixture.home} v {ch.fixture.away} · {new Date(ch.fixture.kickoff_utc).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Sydney' })} AEST
                {ch.fixture.home_score != null
                  ? <> · <strong className="text-gray-700">FT {ch.fixture.home_score}–{ch.fixture.away_score}</strong></>
                  : <> · <span className="text-amber-600">no result yet</span></>}
              </p>
              <div className="flex items-end gap-2 flex-wrap">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Actual first-goal minute (0 = 0–0)</label>
                  <input value={fgm} onChange={e => setFgm(e.target.value)} inputMode="numeric" placeholder="e.g. 23"
                    className="w-40 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
                </div>
                <button disabled={saving}
                  onClick={() => patch({ first_goal_min: fgm === '' ? null : Number(fgm) }, 'Tie-breaker saved')}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">Enter this once the match kicks off — it breaks ties among entrants on the same score (closest wins). Scores themselves are entered in the results admin.</p>

              {/* Custom team visuals — replace the flag emojis on the hero, share card & board */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <h3 className="text-sm font-bold text-gray-900 mb-0.5">Team visuals <span className="font-normal text-gray-400 text-xs">(optional — replaces the flags on the hero, share card &amp; board)</span></h3>
                <div className="grid sm:grid-cols-2 gap-3 mt-2">
                  <TeamImageUploader challengeId={ch.id} side="home" teamName={ch.fixture.home} current={ch.home_image_url ?? null} onChanged={onChanged} />
                  <TeamImageUploader challengeId={ch.id} side="away" teamName={ch.fixture.away} current={ch.away_image_url ?? null} onChanged={onChanged} />
                </div>
              </div>
            </div>
          )}

          {/* Sponsor campaigns on THIS challenge */}
          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-gray-900">Sponsor</h3>
              {ch.sponsor?.id && <Link href={`/admin/sponsors?sponsor=${ch.sponsor.id}`} className="text-[11px] font-semibold text-emerald-600 hover:underline">Manage {ch.sponsor.name} ↗</Link>}
            </div>
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

// ── Team-visual uploader — custom image for one side of a match challenge ─────
function TeamImageUploader({ challengeId, side, teamName, current, onChanged }: {
  challengeId: string; side: 'home' | 'away'; teamName: string; current: string | null; onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<string | null>(current)
  useEffect(() => { setPreview(current) }, [current])

  const upload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5 MB'); return }
    setBusy(true)
    const fd = new FormData(); fd.append('file', file)
    const res = await fetch(`/api/match/challenges/${challengeId}/team-image?side=${side}`, { method: 'POST', body: fd })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { toast.error(d.error ?? 'Upload failed'); return }
    setPreview(d.url)
    toast.success(`${teamName} image updated`)
    onChanged()
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1 truncate">{teamName}</label>
      <div className="flex items-center gap-3">
        <div className="w-16 h-12 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
          {preview ? <img src={preview} alt={teamName} className="w-full h-full object-cover" /> : <span className="text-gray-300 text-lg">🏳️</span>}
        </div>
        <label className={clsx('px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer', busy ? 'bg-gray-100 text-gray-400' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100')}>
          {busy ? 'Uploading…' : preview ? 'Replace' : 'Upload'}
          <input type="file" accept="image/*" className="hidden" disabled={busy}
            onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
        </label>
      </div>
    </div>
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
        <Field label="Headline prize (the total to win)" value={c.prize ?? ''} onChange={v => setC((p: any) => ({ ...p, prize: v }))} placeholder="e.g. $500 worth of fuel vouchers" />
        <Field label="Click-through URL" value={c.click_url ?? ''} onChange={v => setC((p: any) => ({ ...p, click_url: v }))} placeholder="defaults to sponsor website" />
        <Field label="1st place (optional)" value={(c as any).prize_1 ?? ''} onChange={v => setC((p: any) => ({ ...p, prize_1: v }))} placeholder="e.g. $250" />
        <Field label="2nd place (optional)" value={(c as any).prize_2 ?? ''} onChange={v => setC((p: any) => ({ ...p, prize_2: v }))} placeholder="e.g. $150" />
        <Field label="3rd place (optional)" value={(c as any).prize_3 ?? ''} onChange={v => setC((p: any) => ({ ...p, prize_3: v }))} placeholder="e.g. $100" />
        <DateField label="Starts" value={c.starts_at} onChange={v => setC((p: any) => ({ ...p, starts_at: v }))} />
        <DateField label="Ends (lock)" value={c.ends_at} onChange={v => setC((p: any) => ({ ...p, ends_at: v }))} />
      </div>
      <div className="flex gap-2">
        <button disabled={busy}
          onClick={() => patch({ prize: c.prize, prize_1: (c as any).prize_1, prize_2: (c as any).prize_2, prize_3: (c as any).prize_3, click_url: c.click_url, starts_at: c.starts_at, ends_at: c.ends_at }, 'Saved')}
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
