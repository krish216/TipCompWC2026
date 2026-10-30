'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { RaceCountdown } from '@/components/game/RaceCountdown'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'
import { Spinner } from '@/components/ui'
import { TournamentSwitcher } from '@/components/game/TournamentSwitcher'
import { PRIZE_PRESETS } from '@/lib/sweep/prizes'

type Tournament = { id: string; name: string; race_date: string; enrollment_open?: boolean }
type MyTribe = {
  id: string; name: string; invite_code: string
  comp_id: string; comp_name: string | null; comp_invite_code: string | null
  is_comp_admin: boolean
}
type ScopedComp = { id: string; name: string; invite_code: string }
type PoolPill = { tribe_id: string; tickets: number; field_size: number; full: boolean }
type Offering = {
  comp_id: string; comp_name: string; logo_url: string | null
  tournament_id: string; tournament_name: string | null; race_start_at: string | null
  pools: PoolPill[]
}
type PendingInvite = {
  invitation_id: string; comp_id: string; comp_name: string; invite_code: string
  tournament_format: string | null
}
type TournamentOption = { tournament_id: string; tournament_name: string | null; race_start_at: string | null }
type Pool = {
  tribe_id: string; tribe_name: string
  comp_id: string; comp_name: string | null; comp_invite_code: string | null
  tournament_id: string; tournament_name: string | null; race_start_at: string | null
  locked: boolean; is_comp_admin: boolean; my_tickets: number; my_unclaimed: number; my_open_requests: number
  comp_pools: PoolPill[]; comp_pending_requests: number
  is_practice?: boolean   // practice sweeps (migration 200) — listed in their own card
  draw_open?: boolean; results_in?: boolean   // for the race countdown
}
// One row per SWEEP (comp), not per pool — the pool-level detail (which pools, which one has
// your horses) lives on /tribe now. Built by collapsing myPools (one row per pool) by comp_id.
type SweepGroup = {
  comp_id: string; comp_name: string | null; comp_invite_code: string | null
  tournament_id: string; tournament_name: string | null; race_start_at: string | null
  is_comp_admin: boolean; my_tickets: number; my_unclaimed: number; my_open_requests: number
  comp_pools: PoolPill[]; pending_requests: number
}

function groupByComp(pools: Pool[]): SweepGroup[] {
  const byComp = new Map<string, SweepGroup>()
  for (const p of pools) {
    const g = byComp.get(p.comp_id) ?? {
      comp_id: p.comp_id, comp_name: p.comp_name, comp_invite_code: p.comp_invite_code,
      tournament_id: p.tournament_id, tournament_name: p.tournament_name, race_start_at: p.race_start_at,
      is_comp_admin: false, my_tickets: 0, my_unclaimed: 0, my_open_requests: 0, comp_pools: p.comp_pools,
      pending_requests: p.comp_pending_requests ?? 0,   // already comp-wide, so not summed
    }
    g.is_comp_admin = g.is_comp_admin || p.is_comp_admin
    g.my_tickets += p.my_tickets
    g.my_unclaimed += p.my_unclaimed
    g.my_open_requests += p.my_open_requests ?? 0
    byComp.set(p.comp_id, g)
  }
  return [...byComp.values()]
}

export default function SweepPage() {
  const { session } = useSupabase()
  const router = useRouter()
  const searchParams = useSearchParams()
  const code = searchParams.get('code')
  const compIdParam = searchParams.get('comp_id')
  const invited = !!(code || compIdParam)

  const [loading, setLoading]   = useState(true)
  const [tourn, setTourn]       = useState<Tournament | null>(null)
  const [myTribe, setMyTribe]   = useState<MyTribe | null>(null)
  const [comp, setComp]         = useState<ScopedComp | null>(null)
  const [offerings, setOfferings] = useState<Offering[] | null>(null)
  const [tournamentOptions, setTournamentOptions] = useState<TournamentOption[]>([])
  const [selectedTournId, setSelectedTournId] = useState<string>('')
  const [myPools, setMyPools]   = useState<Pool[] | null>(null)
  const [addMode, setAddMode]   = useState(false)   // "+ Add" from the My Sweeps card — browse/create/join without losing the list
  const [confirmLeave, setConfirmLeave] = useState<string | null>(null)   // comp_id with the inline confirm bar open
  const [leaving, setLeaving]   = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [joining, setJoining]   = useState(false)
  const [name, setName]         = useState('')
  const [maxTribes, setMaxTribes] = useState('1')
  const [ticketPrice, setTicketPrice] = useState('5')
  const [prizePreset, setPrizePreset] = useState(PRIZE_PRESETS[0].id)
  const [billing, setBilling]   = useState<{ enabled: boolean; included_pools: number; per_pool_cents: number } | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [invites, setInvites]   = useState<PendingInvite[]>([])
  const [inviteBusy, setInviteBusy] = useState<string | null>(null)   // invitation_id being joined/declined
  const [startingPractice, setStartingPractice] = useState(false)

  async function loadContext() {
    const qs = code ? `?code=${encodeURIComponent(code)}` : compIdParam ? `?comp_id=${encodeURIComponent(compIdParam)}` : ''
    const [ctx, pools, inv] = await Promise.all([
      fetch(`/api/sweep/context${qs}`).then(r => r.json()),
      fetch('/api/sweep/my-pools').then(r => r.json()),
      // Email invites from an organiser (comp_invitations). They otherwise only show on My
      // Comps, which redirects a sweep-selected user straight back here — so surface them here.
      session?.user
        ? fetch('/api/comp-invitations/pending').then(r => r.json()).catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] }),
    ])
    setTourn(ctx.tournament)
    setMyTribe(ctx.my_tribe)
    setComp(ctx.comp ?? null)
    const pool_list: Pool[] = pools.data ?? []
    setMyPools(pool_list)
    const mine = new Set(pool_list.map(p => p.comp_id))
    setInvites(((inv.data ?? []) as PendingInvite[]).filter(i => i.tournament_format === 'sweep' && !mine.has(i.comp_id)))
    setLoading(false)

    // Browsing with no specific sweep in mind — show what's on offer instead of the single
    // hardcoded create/join screen. Loaded whenever that screen could be reached: no pools
    // at all yet, or the user explicitly asked to add another via the My Sweeps card.
    if ((!pool_list.some(p => !p.is_practice) || addMode) && !invited) {
      const off = await fetch('/api/sweep/offerings').then(r => r.json())
      setOfferings(off.data ?? [])
      const opts: TournamentOption[] = off.tournaments ?? []
      setTournamentOptions(opts)
      const fromQuery = searchParams.get('tournament_id')
      setSelectedTournId(fromQuery && opts.some(t => t.tournament_id === fromQuery) ? fromQuery : (opts[0]?.tournament_id ?? ''))
    }
  }

  useEffect(() => { loadContext() }, [session?.user?.id, code, compIdParam])
  useEffect(() => { fetch('/api/sweep/billing').then(r => r.json()).then(setBilling).catch(() => {}) }, [])

  function selectTournament(tournId: string) {
    setSelectedTournId(tournId)
    router.replace(`/sweep?tournament_id=${tournId}`)
  }

  async function openAddMode() {
    setAddMode(true)
    if (!offerings) {
      const off = await fetch('/api/sweep/offerings').then(r => r.json())
      setOfferings(off.data ?? [])
      const opts: TournamentOption[] = off.tournaments ?? []
      setTournamentOptions(opts)
      setSelectedTournId(opts[0]?.tournament_id ?? '')
    }
  }

  // Whole dollars or cents ("5", "2.50"); null when it isn't a usable price.
  const priceCents = (() => {
    const n = Math.round(parseFloat(ticketPrice) * 100)
    return Number.isFinite(n) && n >= 50 && n <= 100000 ? n : null
  })()

  async function handleCreate() {
    if (!session?.user || !tourn || !name.trim() || !priceCents) return
    setCreating(true); setError(null)
    const res = await fetch('/api/comps/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        user_id: session.user.id,
        email: session.user.email,
        tournament_id: tourn.id,
        prize_type: 'pool',
        max_tribes: Math.max(1, Math.min(5, parseInt(maxTribes, 10) || 1)),
        ticket_price_cents: priceCents,
        prize_split: PRIZE_PRESETS.find(p => p.id === prizePreset)?.split,
      }),
    }).then(r => r.json())
    if (res.error) { setCreating(false); setError(res.error); return }
    // Extra paid pools: the sweep exists with its free pool(s); checkout adds the rest.
    if (res.checkout_url) { window.location.href = res.checkout_url; return }
    setCreating(false)
    // Organisers' next job is setting up and selling, so land on the new sweep's admin page.
    router.push(`/sweep-admin?comp_id=${res.data.id}`)
  }

  async function handleJoin() {
    if (!session?.user || !comp) return
    setJoining(true); setError(null)
    const res = await fetch('/api/comp-admins/self-register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comp_id: comp.id, invite_code: comp.invite_code }),
    }).then(r => r.json())
    setJoining(false)
    if (res.error) { setError(res.error); return }
    router.push(`/tribe?comp_id=${comp.id}`)
  }

  async function acceptInvite(inv: PendingInvite) {
    setInviteBusy(inv.invitation_id); setError(null)
    const res = await fetch('/api/comp-admins/self-register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comp_id: inv.comp_id, invite_code: inv.invite_code }),
    }).then(r => r.json())
    setInviteBusy(null)
    if (res.error) { setError(res.error); return }
    router.push(`/tribe?comp_id=${inv.comp_id}`)
  }

  async function declineInvite(inv: PendingInvite) {
    setInviteBusy(inv.invitation_id)
    await fetch('/api/comp-invitations/pending', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invitation_id: inv.invitation_id }),
    }).catch(() => {})
    setInviteBusy(null)
    setInvites(prev => prev.filter(i => i.invitation_id !== inv.invitation_id))
  }

  async function handleLeave(g: SweepGroup) {
    setLeaving(g.comp_id); setError(null)
    const res = await fetch('/api/comp-members/leave', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comp_id: g.comp_id }),
    }).then(r => r.json())
    setLeaving(null); setConfirmLeave(null)
    if (res.error) { setError(res.error); return }
    await loadContext()
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Spinner className="w-8 h-8 text-emerald-600" /></div>
  }

  if (!tourn && (!myPools || myPools.length === 0)) {
    return <main className="max-w-xl mx-auto px-4 py-16 text-center text-gray-500">
      {invited ? "That sweep invite link isn't valid — ask your organiser for a fresh one." : "No sweeps are set up yet."}
    </main>
  }

  if (!session?.user) {
    const redirect = code ? `/sweep?code=${encodeURIComponent(code)}` : compIdParam ? `/sweep?comp_id=${encodeURIComponent(compIdParam)}` : '/sweep'
    return (
      <main className="max-w-xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-black text-gray-900 mb-2">🐎 {comp?.name ?? tourn?.name ?? 'Sweep'}</h1>
        <p className="text-sm text-gray-500 mb-6">Create a free account or log in to start or join a sweep.</p>
        {/* Both carry the sweep (redirect) — a bare /login?tab=register is a football sign-up. */}
        <div className="flex flex-col items-center gap-3">
          <Link href={`/login?tab=register&redirect=${encodeURIComponent(redirect)}`}
            className="inline-block w-full max-w-xs bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-6 py-3 rounded-xl">Create a free account →</Link>
          <Link href={`/login?tab=login&redirect=${encodeURIComponent(redirect)}`}
            className="inline-block w-full max-w-xs border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-bold px-6 py-3 rounded-xl">I already have an account</Link>
        </div>
      </main>
    )
  }

  // Practice sweeps (migration 200) live in their own card, never mixed in with real ones —
  // and never count as "having sweeps", so a first-timer with only a practice still gets the
  // browse/create screen.
  const realPools = (myPools ?? []).filter(p => !p.is_practice)
  const practiceSweeps = groupByComp((myPools ?? []).filter(p => p.is_practice))

  async function startPractice() {
    setStartingPractice(true); setError(null)
    const res = await fetch('/api/sweep/practice', { method: 'POST' }).then(r => r.json()).catch(() => ({ error: 'Something went wrong' }))
    if (res.error) { setStartingPractice(false); setError(res.error); return }
    router.push(`/sweep-admin?comp_id=${res.data.comp_id}`)
  }

  // One row per sweep in a My Sweeps list — shared by real and practice sweeps so a practice
  // shows everything a real one does (pool pills, "N to approve", sold out, Leave/Bought in).
  const sweepRow = (g: SweepGroup, practice = false) => (
    <div key={g.comp_id}>
      {/* A plain clickable div, not <Link> — the Manage link inside it can't nest
          inside another <a>, which is invalid HTML and breaks click behaviour. */}
      <div onClick={() => router.push(`/tribe?comp_id=${g.comp_id}`)} role="button" tabIndex={0}
        className={`w-full flex items-center justify-between gap-3 py-2.5 text-left rounded-lg transition-colors cursor-pointer ${practice ? 'hover:bg-violet-100/60 px-1' : 'hover:bg-gray-50'}`}>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {g.comp_name}
            {/* Every pool under this sweep sold out. */}
            {g.comp_pools.length > 0 && g.comp_pools.every(cp => cp.full) && (
              <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-600 text-white align-middle">Sold out</span>
            )}
          </p>
          <p className={`text-[11px] mb-1 ${practice ? 'text-violet-700' : 'text-gray-400'}`}>
            {practice ? 'Practice' : (g.tournament_name ?? 'Sweep')}
            {g.my_tickets > 0 ? ` · ${g.my_tickets} ticket${g.my_tickets === 1 ? '' : 's'}${g.my_unclaimed ? ` (${g.my_unclaimed} to spin)` : ''}` : ''}
          </p>
          {/* One pill per pool in this sweep, showing tickets sold — green once sold
              out, amber while still selling. Organiser-only: it's their sales
              dashboard; a buyer only cares about their own pool, which /tribe shows. */}
          {g.is_comp_admin && g.comp_pools.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {g.comp_pools.map(cp => (
                <span key={cp.tribe_id} title={cp.full ? 'Sold out' : 'Still selling'}
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cp.full ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {cp.tickets}/{cp.field_size || '—'}
                </span>
              ))}
            </div>
          )}
        </div>
        {g.is_comp_admin ? (
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            {g.pending_requests > 0 && (
              <Link href={`/sweep-admin?comp_id=${g.comp_id}&tab=requests`} onClick={e => e.stopPropagation()}
                className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white hover:bg-amber-600 whitespace-nowrap">
                {g.pending_requests} to approve
              </Link>
            )}
            <Link href={`/sweep-admin?comp_id=${g.comp_id}`} onClick={e => e.stopPropagation()} className="text-[11px] font-bold text-gray-500 hover:text-gray-700">⚙️ Manage</Link>
          </div>
        ) : !practice && (g.my_tickets > 0 || g.my_open_requests > 0) ? (
          // Bought in → can't leave (the API enforces it too). Say why rather than
          // offering a button that only fails after they confirm. Practice sweeps can
          // always be left (comp-members/leave exempts them).
          <span title="You've bought into this sweep — ask your organiser if you need out."
            className="text-[11px] font-medium text-gray-400 flex-shrink-0 whitespace-nowrap">🎟️ Bought in</span>
        ) : confirmLeave === g.comp_id ? null : (
          <button onClick={e => { e.stopPropagation(); setConfirmLeave(g.comp_id) }}
            className="text-[11px] font-medium text-red-500 hover:text-red-700 flex-shrink-0">Leave</button>
        )}
      </div>
      {confirmLeave === g.comp_id && (
        <div className="flex items-center justify-between gap-2 pb-2.5 px-1 -mt-1">
          <span className="text-[11px] text-red-600">Leave {g.comp_name}?</span>
          <div className="flex gap-2">
            <button onClick={() => setConfirmLeave(null)} className="text-[11px] font-medium text-gray-500 hover:text-gray-700">Cancel</button>
            <button onClick={() => handleLeave(g)} disabled={leaving === g.comp_id}
              className="text-[11px] font-bold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 rounded-lg px-2.5 py-1">
              {leaving === g.comp_id ? 'Leaving…' : 'Confirm'}
            </button>
          </div>
        </div>
      )}
    </div>
  )

  const practiceCard = (
    <div className="border border-violet-200 bg-violet-50 rounded-2xl p-4 mb-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-xs font-bold text-violet-800 uppercase tracking-wide">🧪 My practice sweeps ({practiceSweeps.length})</h2>
      </div>
      <p className="text-xs text-violet-900 mb-3">
        See how a sweep runs, start to finish — buy a ticket, approve it, spin for a horse, then run a pretend race.
        No real money. Share the invite link and friends can join as punters.
      </p>
      {practiceSweeps.length > 0 && (
        <div className="divide-y divide-violet-100 mb-3">
          {practiceSweeps.map(g => sweepRow(g, true))}
        </div>
      )}
      <button onClick={startPractice} disabled={startingPractice}
        className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-bold py-2 rounded-lg">
        {startingPractice ? 'Setting it up…' : practiceSweeps.length ? '+ Start another practice sweep' : '🧪 Start a practice sweep'}
      </button>
    </div>
  )

  const invitesCard = invites.length > 0 && (
    <div className="border border-amber-200 bg-amber-50 rounded-2xl p-4 mb-5">
      <h2 className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-2">
        You've been invited ({invites.length})
      </h2>
      <div className="divide-y divide-amber-100">
        {invites.map(inv => (
          <div key={inv.invitation_id} className="flex items-center justify-between gap-3 py-2">
            <p className="text-sm font-semibold text-gray-900 truncate">🐎 {inv.comp_name}</p>
            <div className="flex items-center gap-3 flex-shrink-0">
              <button onClick={() => declineInvite(inv)} disabled={!!inviteBusy}
                className="text-[11px] font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50">Decline</button>
              <button onClick={() => acceptInvite(inv)} disabled={!!inviteBusy}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                {inviteBusy === inv.invitation_id ? 'Joining…' : 'Join'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  // Arrived via a specific invite but haven't joined that comp yet.
  if (!myTribe && comp) {
    return (
      <main className="max-w-xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-black text-gray-900 mb-2">🐎 {comp.name}</h1>
        <p className="text-sm text-gray-500 mb-6">You've been invited to join this sweep.</p>
        <button onClick={handleJoin} disabled={joining}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold px-6 py-3 rounded-xl">
          {joining ? 'Joining…' : 'Join this sweep →'}
        </button>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </main>
    )
  }

  // No pools at all yet, or the user asked to add another via "+ Add" — browse what's on
  // offer, or start/join one directly.
  const hasPools = realPools.length > 0
  if (!hasPools || addMode) {
    // The switcher shows the sweep being browsed (the selected race tab, else the default
    // sweep tournament) — never the global football pick, which /sweep deliberately leaves
    // untouched and which would make it read "Premier League" on a horse-racing page.
    const browseTourn = tournamentOptions.find(t => t.tournament_id === selectedTournId)
    const browseCurrent = browseTourn
      ? { id: browseTourn.tournament_id, name: browseTourn.tournament_name ?? 'Sweep' }
      : tourn ? { id: tourn.id, name: tourn.name } : { id: 'sweep', name: 'Sweeps' }
    return (
      <main className="max-w-xl mx-auto px-4 py-10">
        {hasPools && (
          <button onClick={() => setAddMode(false)} className="text-xs font-bold text-gray-400 hover:text-gray-600 mb-3">← Back to my sweeps</button>
        )}
        {/* Same way back to a football tournament as the My Sweeps view below — without it,
            a first-time visitor (no pools yet) had no switcher here at all. */}
        <div className="flex items-start justify-between gap-3 mb-1">
          <h1 className="text-2xl font-black text-gray-900">🐎 Sweeps</h1>
          <TournamentSwitcher className="flex-shrink-0 mt-1" leaveOnPick current={browseCurrent} />
        </div>
        <p className="text-sm text-gray-500 mb-6">Random draw, no scoring — whoever's horse places 1st, 2nd or 3rd wins. Cash stays between you and your group.</p>

        {invitesCard}

        {tournamentOptions.length > 1 && (
          <div className="flex gap-2 overflow-x-auto mb-4">
            {tournamentOptions.map(t => (
              <button key={t.tournament_id} onClick={() => selectTournament(t.tournament_id)}
                className={`whitespace-nowrap text-xs font-bold px-3 py-1.5 rounded-full border ${
                  selectedTournId === t.tournament_id ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-gray-300 text-gray-600'
                }`}>
                🏇 {t.tournament_name ?? 'Sweep'}
              </button>
            ))}
          </div>
        )}

        {offerings && offerings.filter(o => !selectedTournId || o.tournament_id === selectedTournId).length > 0 && (
          <div className="border border-gray-200 rounded-2xl p-5 mb-5">
            <h2 className="font-bold text-gray-900 mb-3">Open sweeps</h2>
            <div className="divide-y divide-gray-100">
              {offerings.filter(o => !selectedTournId || o.tournament_id === selectedTournId).map(o => (
                <div key={o.comp_id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">{o.comp_name}</p>
                      {/* Every pool sold out — nothing left to buy here. */}
                      {o.pools.length > 0 && o.pools.every(p => p.full) && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-600 text-white">Sold out</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mb-1.5">{o.tournament_name ?? 'Sweep'}</p>
                    {/* One pill per pool, showing tickets sold — green once every ticket in
                        it is sold, amber while it's still selling. A glance at how much of
                        this sweep is taken, pool by pool, before picking "View". */}
                    <div className="flex gap-1 flex-wrap">
                      {o.pools.map(p => (
                        <span key={p.tribe_id} title={p.full ? 'Sold out' : 'Still selling'}
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${p.full ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {p.tickets}/{p.field_size || '—'}
                        </span>
                      ))}
                      {o.pools.length === 0 && <span className="text-[10px] text-gray-300">No pools yet</span>}
                    </div>
                  </div>
                  <Link href={`/sweep?comp_id=${o.comp_id}`} className="text-xs font-bold text-emerald-600 hover:underline whitespace-nowrap">View →</Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* New sweeps paused for this race (admin → Tournament → "New sweeps"), e.g. until the
            field is announced — point organisers at the interest page instead. */}
        {tourn?.enrollment_open === false ? (
          <div className="border border-amber-200 bg-amber-50 rounded-2xl p-5 mb-5">
            <h2 className="font-bold text-gray-900 mb-1">Start your own sweep</h2>
            <p className="text-sm text-amber-900">New sweeps open on Saturday 31 October, once the final field is declared.</p>
            <Link href="/melbourne-cup" className="inline-block mt-3 text-sm font-bold text-amber-800 hover:underline">
              Register your interest and we'll let you know →
            </Link>
          </div>
        ) : (
        <div className="border border-gray-200 rounded-2xl p-5 mb-5">
          <h2 className="font-bold text-gray-900 mb-3">Start your own sweep</h2>
          <input
            value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Acme Corp Melbourne Cup Sweep"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
          />
          <label className="flex items-center justify-between gap-3 mb-3">
            <span className="text-xs text-gray-500">
              Pools <span className="text-gray-400">— each one only holds as many tickets as the field has horses; once a pool fills, joiners auto-move into the next</span>
            </span>
            <input type="number" min="1" max="5" value={maxTribes} onChange={e => setMaxTribes(e.target.value)}
              className="w-16 flex-shrink-0 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center" />
          </label>
          <label className="flex items-center justify-between gap-3 mb-3">
            <span className="text-xs text-gray-500">Ticket price</span>
            <span className="flex items-center gap-1 flex-shrink-0">
              <span className="text-sm text-gray-500">$</span>
              <input value={ticketPrice} onChange={e => setTicketPrice(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal"
                className={`w-20 border rounded-lg px-2 py-1.5 text-sm text-center ${ticketPrice && !priceCents ? 'border-red-400' : 'border-gray-300'}`} />
            </span>
          </label>
          <div className="mb-3">
            <span className="text-xs text-gray-500">Prizes for 1st / 2nd / 3rd (each pool pays its own)</span>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {PRIZE_PRESETS.map(p => (
                <button key={p.id} type="button" onClick={() => setPrizePreset(p.id)}
                  className={`text-xs font-bold px-2.5 py-1.5 rounded-lg ${prizePreset === p.id ? 'bg-emerald-600 text-white' : 'border border-gray-300 text-gray-600'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            {priceCents && (() => {
              const split = PRIZE_PRESETS.find(p => p.id === prizePreset)!.split
              const pot = priceCents * 24
              return (
                <p className="text-[11px] text-gray-400 mt-1.5">
                  A full pool of 24 at ${(priceCents / 100).toFixed(2)} pays{' '}
                  {split.filter(x => x > 0).map((x, i) => `${['🥇', '🥈', '🥉'][i]} $${Math.floor(pot * x / 100 / 100)}`).join(' · ')}
                </p>
              )
            })()}
          </div>
          {(() => {
            const paidPools = billing?.enabled ? Math.max(0, (parseInt(maxTribes, 10) || 1) - billing.included_pools) : 0
            const cost = paidPools * (billing?.per_pool_cents ?? 0) / 100
            return (
              <>
                {billing?.enabled && (
                  <p className="text-[11px] text-gray-400 -mt-1 mb-3">
                    {billing.included_pools} pool{billing.included_pools === 1 ? '' : 's'} free, then ${(billing.per_pool_cents / 100).toFixed(2)} per extra pool.
                    {paidPools > 0 && ` You'll pay $${cost.toFixed(2)} by card after creating.`}
                  </p>
                )}
                {billing && !billing.enabled && (
                  <p className="text-[11px] text-gray-400 -mt-1 mb-3">
                    Free to run this Cup — every pool, no fees from TribePicks.
                  </p>
                )}
                <button
                  onClick={handleCreate} disabled={creating || !name.trim() || !priceCents}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-lg"
                >
                  {creating ? 'Creating…' : paidPools > 0 ? `Create sweep & pay $${cost.toFixed(2)} →` : 'Create sweep →'}
                </button>
              </>
            )
          })()}
        </div>
        )}

        <div className="border border-gray-200 rounded-2xl p-5">
          <h2 className="font-bold text-gray-900 mb-2">Join one with a code</h2>
          <p className="text-xs text-gray-500">Use the invite link your organiser sent you — it'll start with <code>/sweep?code=</code> or <code>/join?code=</code>.</p>
        </div>

        <div className="mt-5">{practiceCard}</div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <p className="mt-4 text-center text-xs">
          <Link href="/rules/melbourne-cup-2026" className="text-gray-400 hover:text-gray-600 underline">How the sweep works · rules</Link>
        </p>
      </main>
    )
  }

  // Has one or more sweeps — one row per SWEEP (not per pool; pool-level detail lives on
  // /tribe). Mirrors HomeClient's "My Comps" card: click to open, Leave/Manage per row,
  // "+ Add" to browse/create/join without losing the list.
  const sweeps = groupByComp(realPools)

  return (
    <main className="max-w-xl mx-auto px-4 py-10">
      <div className="flex items-start justify-between gap-3 mb-5">
        <h1 className="text-2xl font-black text-gray-900">🐎 My Sweeps</h1>
        {/* /sweep doesn't render CountdownBanner (a race-countdown UI makes no sense here),
            so this is the only way back to a football tournament without a detour through
            /tribe. `current` overrides the display so it shows THIS tournament rather than
            whatever the user's global football pick still is — landing here never changes
            that global selection (see TournamentSheet). */}
        <TournamentSwitcher className="flex-shrink-0 mt-1" leaveOnPick current={sweeps[0] ? { id: sweeps[0].tournament_id, name: sweeps[0].tournament_name ?? 'Sweep' } : undefined} />
      </div>

      {/* Countdown to the next real race you're in (practice sweeps have no race time). */}
      {(() => {
        const next = realPools.filter(p => p.race_start_at)
          .sort((a, b) => a.race_start_at!.localeCompare(b.race_start_at!))[0]
        return next ? (
          <RaceCountdown raceStartAt={next.race_start_at!} drawOpen={next.draw_open !== false} resultsIn={!!next.results_in}
            resultsHref={`/tribe?comp_id=${next.comp_id}`} className="mb-5" />
        ) : null
      })()}

      {invitesCard}

      <div className="border border-gray-200 rounded-2xl p-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">My sweeps ({sweeps.length})</h2>
          <button onClick={openAddMode} className="text-xs font-bold text-emerald-600 hover:underline">+ Add</button>
        </div>
        <div className="divide-y divide-gray-100">
          {sweeps.map(g => sweepRow(g))}
        </div>
      </div>

      {practiceCard}

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      <p className="mt-2 text-center text-xs">
        <Link href="/rules/melbourne-cup-2026" className="text-gray-400 hover:text-gray-600 underline">How the sweep works · rules</Link>
      </p>
    </main>
  )
}
