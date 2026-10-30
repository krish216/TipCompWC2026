'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import QRCode from 'qrcode'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { Spinner } from '@/components/ui'
import { FeedLuckNudge } from '@/components/game/FeedLuckNudge'
import { payIdKind, type PayIdKind } from '@/lib/sweep/organiser'
import { PRIZE_PRESETS, fmtCents, isValidSplit, type PoolPrizes } from '@/lib/sweep/prizes'
import { isPracticeSlug } from '@/lib/sweep/practice'
import { DRAW_OPENS_LABEL } from '@/lib/sweep/field'
import { DRAW_GRACE_HOURS, fmtLeft } from '@/lib/sweep/grace'

type Tab = 'sell' | 'requests' | 'allocation' | 'pools' | 'settings'
const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'sell',       icon: '🔗', label: 'Sell' },
  { id: 'requests',   icon: '💸', label: 'Requests' },
  { id: 'allocation', icon: '🐎', label: 'Allocation' },
  { id: 'pools',      icon: '🪣', label: 'Pools' },
  { id: 'settings',   icon: '⚙️', label: 'Settings' },
]
const VALID_TABS = TABS.map(t => t.id)
const UNSAVED_PROMPT = 'You have unsaved changes on this sweep. Leave and lose them?'

type CompLite = { id: string; name: string; logo_url: string | null; invite_code: string; tournament_id: string }
type CrewMember = { user_id: string; display_name: string; practice_names: string[]; status: 'member' | 'invited' | 'none'; can_email: boolean }
type Settings = {
  allow_iou: boolean; sweep_approval_mode: 'manual' | 'auto'; max_tribes: number
  sweep_ticket_price_cents: number | null; sweep_prize_split: [number, number, number]; sweep_deduct_fee: boolean
}
type RequestRow = {
  id: string; tribe_id: string; tickets_requested: number; payment_method: string; status: string
  amount: number | null; receipt_url: string | null; paid_at: string | null
  buyer: { display_name: string; avatar_url: string | null } | null
}
type Pool = {
  id: string; name: string; invite_code: string; locked: boolean; members: number; tickets: number; claimed: number; field_size: number; prizes: PoolPrizes | null
  draw_open: boolean; refunds: { display_name: string; tickets: number }[]   // migration 201
}
type OrganiserDetails = {
  approval_window_hours: number
  bank_account_name: string; bank_bsb: string; bank_account_number: string; payid: string; payid_kind: PayIdKind
  contact_name: string; contact_phone: string; contact_email: string
  bank_shared_directly: boolean; bank_shared_confirmed: boolean   // migration 202
}
// Tickets bought but not spun yet (refund-bound over-field tickets excluded).
const poolUnspun = (p: Pool) => p.tickets - p.claimed - p.refunds.reduce((s, r) => s + r.tickets, 0)
const APPROVAL_WINDOWS = [2, 6, 12, 24]
const EMPTY_DETAILS: OrganiserDetails = {
  approval_window_hours: 12, bank_account_name: '', bank_bsb: '', bank_account_number: '', payid: '', payid_kind: 'mobile',
  contact_name: '', contact_phone: '', contact_email: '', bank_shared_directly: false, bank_shared_confirmed: false,
}
const PAYID_KINDS: { kind: PayIdKind; label: string; placeholder: string; inputMode: 'tel' | 'email' | 'numeric' }[] = [
  { kind: 'mobile', label: 'Mobile', placeholder: '0412 345 678', inputMode: 'tel' },
  { kind: 'email',  label: 'Email',  placeholder: 'you@example.com', inputMode: 'email' },
  { kind: 'abn',    label: 'ABN',    placeholder: '12 345 678 901', inputMode: 'numeric' },
]
// Same rules as hasPaymentDetails()/hasContact() in lib/sweep/organiser.ts.
const detailsHavePayment = (d: OrganiserDetails) => !!(d.bank_account_name && ((d.bank_bsb && d.bank_account_number) || d.payid))
const detailsHaveContact = (d: OrganiserDetails) => !!(d.contact_phone || d.contact_email)
// …and bankTransferEnabled(): details shown here, or shared directly (and confirmed).
const detailsAllowTransfer = (d: OrganiserDetails) =>
  d.bank_shared_directly ? d.bank_shared_confirmed : detailsHavePayment(d)

export default function SweepAdminPage() {
  const { session } = useSupabase()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [comps, setComps] = useState<CompLite[] | null>(null)
  const [compId, setCompId] = useState<string>('')
  const [activeTab, setActiveTab] = useState<Tab>((VALID_TABS.includes(searchParams.get('tab') as Tab) ? searchParams.get('tab') : 'sell') as Tab)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [settings, setSettings] = useState<Settings | null>(null)
  const [savingSetting, setSavingSetting] = useState<string | null>(null)
  // Prizes card (migration 199). The price locks once anything is sold or requested.
  const [priceInput, setPriceInput] = useState('')
  const [splitInput, setSplitInput] = useState<[string, string, string]>(['70', '20', '10'])
  const [priceLocked, setPriceLocked] = useState(false)
  const [savingPrizes, setSavingPrizes] = useState(false)
  const [prizesSavedAt, setPrizesSavedAt] = useState<number | null>(null)
  const [minMaxTribes, setMinMaxTribes] = useState(1)
  const [maxTribesInput, setMaxTribesInput] = useState('')
  const [savingMaxTribes, setSavingMaxTribes] = useState(false)
  const [billing, setBilling] = useState<{ enabled: boolean; included_pools: number; per_pool_cents: number; max_pools: number } | null>(null)
  // Back from Stripe Checkout. The webhook adds the pools, possibly a moment after the
  // redirect lands, so poll briefly rather than trusting the redirect.
  const [poolsPaid, setPoolsPaid] = useState(searchParams.get('pools') === 'paid')
  // People from this organiser's practice sweeps, to invite into a real one (Sell tab).
  const [crew, setCrew] = useState<CrewMember[]>([])
  const [crewPicked, setCrewPicked] = useState<Set<string>>(new Set())
  const [sendingCrew, setSendingCrew] = useState(false)
  const [crewMsg, setCrewMsg] = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [nameSavedAt, setNameSavedAt] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmDrawPool, setConfirmDrawPool] = useState<string | null>(null)   // pool id awaiting "Draw now" confirm
  const [drawingPool, setDrawingPool] = useState<string | null>(null)
  const [confirmDrawMember, setConfirmDrawMember] = useState<string | null>(null)   // user id awaiting confirm
  const [drawingMember, setDrawingMember] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [requests, setRequests] = useState<RequestRow[]>([])
  const [owingOnly, setOwingOnly] = useState(true)
  const [pools, setPools] = useState<Pool[]>([])
  const [allocTribeId, setAllocTribeId] = useState('')
  const [allocRoster, setAllocRoster] = useState<any[] | null>(null)
  const [now, setNow] = useState(() => Date.now())   // ticks "Draw in 1h 12m" (the 2-hour spin window)
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t) }, [])
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [details, setDetails] = useState<OrganiserDetails>(EMPTY_DETAILS)       // the form
  const [savedDetails, setSavedDetails] = useState<OrganiserDetails>(EMPTY_DETAILS)  // what's on file
  const [savingDetails, setSavingDetails] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [detailsSavedAt, setDetailsSavedAt] = useState<number | null>(null)

  useEffect(() => {
    if (VALID_TABS.includes(searchParams.get('tab') as Tab)) setActiveTab(searchParams.get('tab') as Tab)
  }, [searchParams])

  function setTab(tab: Tab) {
    setActiveTab(tab)
    router.replace(`/sweep-admin?tab=${tab}`)
  }

  useEffect(() => {
    if (!session?.user) return
    ;(async () => {
      const [adminsRes, tournsRes] = await Promise.all([
        fetch('/api/comp-admins').then(r => r.json()),
        fetch('/api/tournaments').then(r => r.json()),
      ])
      const sweepTournIds = new Set(((tournsRes.data ?? []) as any[]).filter(t => t.format === 'sweep').map(t => t.id))
      // Practice sweeps (migration 200) sort after real ones, so a real sweep is the default pick.
      const practiceTournIds = new Set(((tournsRes.data ?? []) as any[]).filter(t => isPracticeSlug(t.slug)).map(t => t.id))
      const sweepComps = ((adminsRes.comps ?? []) as any[])
        .filter(c => sweepTournIds.has(c.tournament_id))
        .map(c => ({ ...c, is_practice: practiceTournIds.has(c.tournament_id) }))
        .sort((a, b) => Number(a.is_practice) - Number(b.is_practice))
      setComps(sweepComps)
      const fromQuery = searchParams.get('comp_id')
      setCompId(fromQuery && sweepComps.some(c => c.id === fromQuery) ? fromQuery : (sweepComps[0]?.id ?? ''))
      setLoading(false)
    })()
  }, [session?.user?.id])

  // Following another "Manage"/"Organiser settings" link while already mounted on this page
  // (e.g. from a different pool's row) updates the URL's comp_id without remounting the
  // component, so the effect above — keyed on session, not searchParams — wouldn't pick it
  // up on its own. This keeps compId in sync with the URL any time it actually changes.
  const compIdParam = searchParams.get('comp_id')
  useEffect(() => {
    if (compIdParam && comps?.some(c => c.id === compIdParam) && compIdParam !== compId) {
      setCompId(compIdParam)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compIdParam, comps])

  function resetPrizeInputs(s: Pick<Settings, 'sweep_ticket_price_cents' | 'sweep_prize_split'> | null | undefined) {
    setPriceInput(s?.sweep_ticket_price_cents ? (s.sweep_ticket_price_cents / 100).toFixed(2).replace(/\.00$/, '') : '')
    const sp = isValidSplit(s?.sweep_prize_split) ? s!.sweep_prize_split : [70, 20, 10]
    setSplitInput(sp.map(String) as [string, string, string])
  }

  async function loadSettings(id: string) {
    const res = await fetch(`/api/comps/${id}/sweep-settings`).then(r => r.json())
    if (res.data) setSettings(res.data)
    setPriceLocked(!!res.price_locked)
    resetPrizeInputs(res.data)
    setMinMaxTribes(res.min_max_tribes ?? 1)
    setBilling(res.billing ?? null)
    setMaxTribesInput(String(res.data?.max_tribes ?? 1))
    const d = res.organiser_details ?? {}
    const loaded: OrganiserDetails = {
      approval_window_hours: d.approval_window_hours ?? 12,
      bank_account_name: d.bank_account_name ?? '', bank_bsb: d.bank_bsb ?? '',
      bank_account_number: d.bank_account_number ?? '', payid: d.payid ?? '', payid_kind: payIdKind(d.payid ?? null) ?? 'mobile',
      contact_name: d.contact_name ?? '', contact_phone: d.contact_phone ?? '', contact_email: d.contact_email ?? '',
      // Saved as "shared directly" means it was confirmed when it was saved.
      bank_shared_directly: !!d.bank_shared_directly, bank_shared_confirmed: !!d.bank_shared_directly,
    }
    setDetails(loaded); setSavedDetails(loaded); setDetailsError(null); setDetailsSavedAt(null)
  }

  async function saveDetails() {
    setSavingDetails(true); setDetailsError(null)
    // Sharing directly → nothing of the bank account stays on TribePicks.
    // Never switched on → leave the flag out, so saving works before migration 202 too.
    const { bank_shared_directly: _s, bank_shared_confirmed: _c, ...rest } = details
    const body = details.bank_shared_directly
      ? { ...details, bank_account_name: '', bank_bsb: '', bank_account_number: '', payid: '' }
      : savedDetails.bank_shared_directly ? details : rest
    const res = await fetch(`/api/comps/${compId}/sweep-settings`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ organiser_details: body }),
    }).then(r => r.json())
    setSavingDetails(false)
    // Inline on the card, like the delete error — the page-top banner is out of view down here.
    if (res.error) { setDetailsError(res.error); return }
    await loadSettings(compId)   // pick up the server's normalised BSB etc.
    setDetailsSavedAt(Date.now())
  }
  async function loadRequests(id: string, owing: boolean) {
    const res = await fetch(`/api/comps/${id}/sweep/requests${owing ? '?owing=true' : ''}`).then(r => r.json())
    setRequests(res.data ?? [])
  }
  async function loadPools(id: string) {
    const res = await fetch(`/api/comps/${id}/sweep/pools`).then(r => r.json())
    setPools(res.data ?? [])
    // Allocation opens on a pool with tickets waiting to spin — that's where "Draw for them" is.
    const firstWaiting = ((res.data ?? []) as Pool[]).find(p => poolUnspun(p) > 0)
    if (!allocTribeId && res.data?.[0]) setAllocTribeId((firstWaiting ?? res.data[0]).id)
  }

  useEffect(() => {
    if (!compId) return
    loadSettings(compId)
    loadRequests(compId, owingOnly)
    loadPools(compId)
  }, [compId])

  useEffect(() => { if (compId) loadRequests(compId, owingOnly) }, [owingOnly])

  useEffect(() => {
    if (!poolsPaid || !compId) return
    let tries = 0
    const t = setInterval(() => {
      loadSettings(compId); loadPools(compId)
      if (++tries >= 5) { clearInterval(t); setPoolsPaid(false) }
    }, 2000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolsPaid, compId])

  useEffect(() => {
    if (!allocTribeId) return
    fetch(`/api/tribes/${allocTribeId}/sweep`).then(r => r.json()).then(s => setAllocRoster(s.roster ?? []))
  }, [allocTribeId])

  const comp = comps?.find(c => c.id === compId) ?? null
  useEffect(() => {
    if (!comp) return
    const url = `https://tribepicks.com/sweep?code=${comp.invite_code}`
    QRCode.toDataURL(url, { margin: 1, width: 220 }).then(setQrDataUrl).catch(() => setQrDataUrl(''))
  }, [comp?.invite_code])
  async function loadCrew(id: string) {
    const res = await fetch(`/api/comps/${id}/sweep/practice-crew`).then(r => r.json()).catch(() => ({}))
    const rows: CrewMember[] = res.data ?? []
    setCrew(rows)
    setCrewPicked(new Set(rows.filter(c => c.status === 'none' && c.can_email).map(c => c.user_id)))
  }
  const isPracticeComp = !!(comp as any)?.is_practice
  useEffect(() => {
    setCrew([]); setCrewMsg(null)
    if (compId && comp && !isPracticeComp) loadCrew(compId)
  }, [compId, !!comp, isPracticeComp]) // eslint-disable-line react-hooks/exhaustive-deps

  async function inviteCrew() {
    setSendingCrew(true); setCrewMsg(null)
    const res = await fetch(`/api/comps/${compId}/sweep/practice-crew`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_ids: [...crewPicked] }),
    }).then(r => r.json()).catch(() => ({ error: 'Something went wrong' }))
    setSendingCrew(false)
    if (res.error) { setCrewMsg(res.error); return }
    setCrewMsg(`✓ Invited ${res.invited} ${res.invited === 1 ? 'person' : 'people'} by email`)
    loadCrew(compId)
  }

  // Switching sweeps mid-rename abandons it.
  useEffect(() => { setEditingName(false); setNameError(null); setNameSavedAt(null) }, [comp?.id])

  function cancelRename() { setEditingName(false); setNameError(null) }

  async function saveName() {
    const next = nameInput.trim()
    if (!comp || !next) return
    if (next === comp.name) { cancelRename(); return }
    setSavingName(true); setNameError(null)
    const res = await fetch('/api/comps/create', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comp_id: comp.id, name: next }),
    }).then(r => r.json()).catch(() => ({ error: 'Something went wrong' }))
    setSavingName(false)
    if (res.error) { setNameError(res.error); return }
    setComps(cs => cs?.map(c => c.id === comp.id ? { ...c, name: next } : c) ?? cs)
    setEditingName(false)
    setNameSavedAt(Date.now())
  }

  async function updateSetting(key: keyof Settings, value: any) {
    setSavingSetting(key)
    const bodyKey = key === 'sweep_approval_mode' ? 'approval_mode' : 'allow_iou'
    const res = await fetch(`/api/comps/${compId}/sweep-settings`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [bodyKey]: value }),
    }).then(r => r.json())
    setSavingSetting(null)
    if (res.error) { setError(res.error); return }
    setSettings(s => s ? { ...s, [key]: value } : s)
  }

  async function deleteSweep() {
    if (!compId) return
    setDeleting(true); setDeleteError(null)
    const res = await fetch('/api/comps/create', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comp_id: compId }),
    }).then(r => r.json())
    setDeleting(false)
    // Shown inline on the Delete card itself, not the page-top banner (setError) — that
    // banner sits above the tab bar, easy to miss once you've scrolled down into Settings.
    if (res.error) { setDeleteError(res.error); setConfirmDelete(false); return }
    router.push('/sweep')
  }

  // `min`/`max` on a number input only bound the spinner — typing 0 or 9 still gets through,
  // so validate here too, against the same bounds the API enforces.
  const maxTribesN = parseInt(maxTribesInput, 10)
  const maxTribesValid = Number.isInteger(maxTribesN) && maxTribesN >= Math.max(1, minMaxTribes) && maxTribesN <= 5

  // Adding pools is a purchase (src/lib/sweep/billing.ts) — free and instant while billing is
  // off, otherwise a trip through Stripe Checkout that lands back here with ?pools=paid.
  const poolsToAdd = settings && maxTribesValid ? Math.max(0, maxTribesN - settings.max_tribes) : 0
  const addPoolsCost = billing?.enabled ? poolsToAdd * billing.per_pool_cents / 100 : 0

  async function saveMaxTribes() {
    const n = maxTribesN
    if (!maxTribesValid || poolsToAdd < 1) return
    setSavingMaxTribes(true); setError(null)
    const res = await fetch(`/api/comps/${compId}/sweep/pools/purchase`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pools: poolsToAdd }),
    }).then(r => r.json())
    if (res.error) { setSavingMaxTribes(false); setError(res.error); return }
    if (res.checkout_url) { window.location.href = res.checkout_url; return }
    setSavingMaxTribes(false)
    setSettings(s => s ? { ...s, max_tribes: n } : s)
    setMinMaxTribes(n)   // can't go back down below what was just saved
    loadPools(compId)
  }

  const priceCentsInput = (() => {
    const n = Math.round(parseFloat(priceInput) * 100)
    return Number.isFinite(n) && n >= 50 && n <= 100000 ? n : null
  })()
  const splitNums = splitInput.map(v => parseInt(v, 10)) as [number, number, number]
  const splitValid = isValidSplit(splitNums)
  const prizesDirty = !!settings && (
    priceCentsInput !== settings.sweep_ticket_price_cents ||
    JSON.stringify(splitNums) !== JSON.stringify(settings.sweep_prize_split))
  const poolsDirty = !!settings && maxTribesInput !== String(settings.max_tribes)
  // Bank details and approvals/contact are one saved record split across two cards, so both
  // cards share one dirty flag and one Save row (either one saves everything).
  const detailsDirty = JSON.stringify(details) !== JSON.stringify(savedDetails)
  const nameDirty = editingName && !!comp && nameInput.trim() !== comp.name

  // Dirty-record guard: edits live only in this page's state until saved, so warn before
  // anything throws them away — closing/reloading the tab, following a link off the page, or
  // switching to another sweep (which reloads every form). Moving between tabs here is safe:
  // the forms' state survives it, and the Settings tab carries a dot while anything's unsaved.
  const settingsDirty = poolsDirty || prizesDirty || detailsDirty
  const isDirty = settingsDirty || nameDirty
  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    // Capture phase on document runs before React's own (root) listeners, so stopping the
    // click here also stops <Link>'s client-side navigation, not just the native one.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey) return
      const url = new URL(a.href, window.location.href)
      // Staying on this page is safe — unless the link points at a different sweep.
      const otherSweep = url.searchParams.get('comp_id')
      if (url.origin === window.location.origin && url.pathname === window.location.pathname && (!otherSweep || otherSweep === compId)) return
      if (!window.confirm(UNSAVED_PROMPT)) { e.preventDefault(); e.stopPropagation() }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [isDirty, compId])

  function discardPools() { if (settings) setMaxTribesInput(String(settings.max_tribes)) }
  function discardPrizes() { resetPrizeInputs(settings) }
  function discardDetails() { setDetails(savedDetails); setDetailsError(null) }

  function switchSweep(id: string) {
    if (isDirty && !window.confirm(UNSAVED_PROMPT)) return
    setCompId(id)
  }

  async function savePrizes() {
    if (!priceCentsInput || !splitValid) return
    setSavingPrizes(true); setError(null)
    const body: Record<string, any> = { prize_split: splitNums }
    if (!priceLocked) body.ticket_price_cents = priceCentsInput
    const res = await fetch(`/api/comps/${compId}/sweep-settings`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then(r => r.json())
    setSavingPrizes(false)
    if (res.error) { setError(res.error); return }
    setSettings(s => s ? { ...s, sweep_prize_split: splitNums, ...(priceLocked ? {} : { sweep_ticket_price_cents: priceCentsInput }) } : s)
    setPrizesSavedAt(Date.now())
    loadPools(compId)
  }

  async function act(tribeId: string, reqId: string, action: 'approve' | 'reject' | 'mark_paid') {
    const res = await fetch(`/api/tribes/${tribeId}/sweep/requests/${reqId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
    }).then(r => r.json())
    if (res.error) { setError(res.error); return }
    await loadRequests(compId, owingOnly)
    await loadPools(compId)
  }

  async function closePool(tribeId: string) {
    const res = await fetch(`/api/tribes/${tribeId}/sweep/close`, { method: 'POST' }).then(r => r.json())
    if (res.error) { setError(res.error); return }
    await loadPools(compId)
  }

  // One member's unspun tickets ("draw for them") — same random draw, never a chosen horse.
  async function drawForMember(tribeId: string, userId: string) {
    setDrawingMember(userId); setConfirmDrawMember(null)
    const res = await fetch(`/api/tribes/${tribeId}/sweep/draw-unspun`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId }),
    }).then(r => r.json())
    setDrawingMember(null)
    if (res.error) { setError(res.error); return }
    fetch(`/api/tribes/${tribeId}/sweep`).then(r => r.json()).then(s => setAllocRoster(s.roster ?? []))
    await loadPools(compId)
  }

  // Random draw for every ticket its holder hasn't spun — the organiser never picks the horse.
  async function drawUnspun(tribeId: string) {
    setDrawingPool(tribeId); setConfirmDrawPool(null)
    const res = await fetch(`/api/tribes/${tribeId}/sweep/draw-unspun`, { method: 'POST' }).then(r => r.json())
    setDrawingPool(null)
    if (res.error) { setError(res.error); return }
    await loadPools(compId)
  }

  async function reopenPool(tribeId: string) {
    const res = await fetch(`/api/tribes/${tribeId}/sweep/lock`, { method: 'DELETE' }).then(r => r.json())
    if (res.error) { setError(res.error); return }
    await loadPools(compId)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner className="w-8 h-8 text-emerald-600" /></div>
  if (!session?.user) return <main className="max-w-xl mx-auto px-4 py-16 text-center text-gray-500">Log in to manage your sweep.</main>
  if (!comps?.length) return <main className="max-w-xl mx-auto px-4 py-16 text-center text-gray-500">You don't organise any sweeps yet. Start one from <Link href="/sweep" className="text-emerald-600 font-bold">/sweep</Link>.</main>

  const inviteUrl = comp ? `https://tribepicks.com/sweep?code=${comp.invite_code}` : ''
  const waText = encodeURIComponent(`Join my sweep "${comp?.name}" on TribePicks: ${inviteUrl}`)

  // Dirty cards get an amber edge and an "Unsaved changes · Discard" note beside their Save.
  const cardClass = (dirty: boolean) => `border rounded-2xl p-5 ${dirty ? 'border-amber-300 bg-amber-50/40' : 'border-gray-200'}`
  const unsavedNote = (dirty: boolean, discard: () => void) => dirty && (
    <span className="text-[11px] font-semibold text-amber-700">
      Unsaved changes · <button type="button" onClick={discard} className="underline hover:text-amber-900">Discard</button>
    </span>
  )

  const saveDetailsRow = (
    <>
      <div className="flex items-center gap-3">
        <button onClick={saveDetails} disabled={savingDetails || !detailsDirty}
          className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-3 py-1.5 rounded-lg">
          {savingDetails ? 'Saving…' : 'Save'}
        </button>
        {detailsSavedAt && !detailsDirty && <span className="text-xs text-emerald-600 font-semibold">✓ Saved</span>}
        {unsavedNote(detailsDirty, discardDetails)}
      </div>
      {detailsError && <p className="text-xs text-red-600 mt-2">{detailsError}</p>}
    </>
  )

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-xl font-black text-gray-900 mb-1">🐎 Sweep organiser</h1>

      {/* Which sweep, with an inline rename. Invite links/codes don't change on a rename. */}
      {comp && (editingName ? (
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <input type="text" value={nameInput} maxLength={80} autoFocus onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') cancelRename() }}
              className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <button onClick={saveName} disabled={savingName || !nameInput.trim()}
              className="text-xs font-bold px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40">
              {savingName ? 'Saving…' : 'Save'}
            </button>
            <button onClick={cancelRename} className="text-xs font-semibold text-gray-500 hover:text-gray-700 px-2 py-2">Cancel</button>
          </div>
          {nameError && <p className="text-xs text-red-600 mt-2">{nameError}</p>}
        </div>
      ) : (
        <div className="flex items-center gap-2 mb-4">
          {comps.length > 1 ? (
            <select value={compId} onChange={e => switchSweep(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-0">
              {comps.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ) : (
            <span className="text-sm font-semibold text-gray-700 truncate">{comp.name}</span>
          )}
          <button onClick={() => { setNameInput(comp.name); setNameError(null); setEditingName(true) }}
            title="Rename this sweep" aria-label="Rename this sweep"
            className="shrink-0 text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100">✏️</button>
          {nameSavedAt && <span className="text-xs text-emerald-600 font-semibold">✓ Renamed</span>}
        </div>
      ))}

      {(comp as any)?.is_practice && (
        <div className="bg-violet-50 border border-violet-200 text-violet-900 text-sm rounded-lg px-4 py-3 mb-4">
          <span className="font-bold">🧪 Practice sweep — no real money.</span> Approve your own ticket requests in the
          Requests tab, then run the pretend race from the pool page.
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">{error}</div>}

      <div className="flex gap-1 overflow-x-auto bg-sky-50 border border-sky-200 rounded-2xl p-1 mb-6">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 whitespace-nowrap text-xs font-bold px-3 py-2 rounded-xl ${activeTab === t.id ? 'bg-white ring-1 ring-sky-200 text-gray-900' : 'text-gray-500'}`}>
            {t.icon} {t.label}
            {t.id === 'settings' && settingsDirty && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 ml-1 align-middle" title="Unsaved changes" />
            )}
          </button>
        ))}
      </div>

      {/* Before sharing the link: which ways buyers can pay, and how to switch the rest on.
          Mirrors what the buy box offers (cash always; transfer needs saved details; IOU is opt-in). */}
      {activeTab === 'sell' && comp && settings && (() => {
        const bankOn = detailsAllowTransfer(savedDetails)
        const channels = [
          { label: 'Cash', on: true, note: 'You tick each request off once you’ve been paid.' },
          { label: 'Bank transfer', on: bankOn,
            note: bankOn
              ? `${savedDetails.bank_shared_directly ? 'You send buyers your bank details yourself; they' : 'Buyers'} attach a receipt — ${settings.sweep_approval_mode === 'auto' ? 'approved automatically' : 'you approve each one'}.`
              : 'Add your bank details or PayID — or share them directly — to turn this on.' },
          { label: 'IOU', on: settings.allow_iou,
            note: settings.allow_iou ? 'Buyers get tickets now and pay you later.' : 'Off — turn on if you’re happy to be paid later.' },
        ]
        return (
          <div className="mb-4 border border-gray-200 rounded-2xl px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-gray-900">How buyers can pay</p>
              <button onClick={() => setTab('settings')} className="text-xs font-bold text-emerald-600 hover:underline">Change in Settings →</button>
            </div>
            <ul className="space-y-1.5">
              {channels.map(c => (
                <li key={c.label} className="flex items-start gap-2 text-xs">
                  <span className={`font-bold ${c.on ? 'text-emerald-600' : 'text-gray-300'}`}>{c.on ? '✓' : '○'}</span>
                  <span>
                    <span className={`font-semibold ${c.on ? 'text-gray-900' : 'text-gray-400'}`}>{c.label}</span>
                    <span className="text-gray-500"> — {c.note}</span>
                  </span>
                </li>
              ))}
            </ul>
            {!detailsHaveContact(savedDetails) && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                Add a phone or email in Settings so buyers can reach you if an approval runs late.
              </p>
            )}
          </div>
        )
      })()}

      {activeTab === 'sell' && comp && (
        <div className="border border-gray-200 rounded-2xl p-5 text-center">
          <h2 className="font-bold text-gray-900 mb-3">{comp.name}</h2>
          {qrDataUrl && <img src={qrDataUrl} alt="QR code" className="mx-auto mb-3 rounded-lg border border-gray-200" />}
          <p className="text-xs text-gray-500 mb-3 break-all">{inviteUrl}</p>
          <div className="flex items-center justify-center gap-3">
            <a href={`https://wa.me/?text=${waText}`} target="_blank" rel="noreferrer" className="text-sm font-bold text-emerald-600 hover:underline">WhatsApp →</a>
            <a href={`mailto:?subject=${encodeURIComponent(`Join my sweep: ${comp.name}`)}&body=${waText}`} className="text-sm font-bold text-emerald-600 hover:underline">Email →</a>
          </div>
        </div>
      )}

      {/* Running a sweep is free this Cup — the organiser nudge to chip in. */}
      {activeTab === 'sell' && comp && !isPracticeComp && (
        <FeedLuckNudge className="mt-4" source="sweep_organiser"
          message="Your sweep is free on TribePicks this Cup — feed our doggies to keep it that way 🐾"
          luckyMessage={name => `🍀 ${name}’s backing your sweep — thanks for feeding the pack!`} />
      )}

      {/* The practice crew → this real sweep. Email invites (with /sweep's one-tap Join) for
          everyone we can reach, plus a ready-made WhatsApp message for the group chat —
          most groups organise there, and we can't message it for them. */}
      {activeTab === 'sell' && comp && !isPracticeComp && crew.length > 0 && (() => {
        const waCrew = encodeURIComponent(`The practice run's over — the real sweep is open! 🐎 Join "${comp.name}" on TribePicks: ${inviteUrl}`)
        const counts = { member: crew.filter(c => c.status === 'member').length, invited: crew.filter(c => c.status === 'invited').length }
        const invitable = crew.filter(c => c.status === 'none' && c.can_email)
        return (
          <div className="mt-4 border border-violet-200 bg-violet-50/60 rounded-2xl p-5">
            <h2 className="font-bold text-gray-900 mb-1 text-sm">🧪 Bring your practice crew</h2>
            <p className="text-xs text-gray-600 mb-3">
              {crew.length} {crew.length === 1 ? 'person' : 'people'} tried your practice sweep
              {counts.member ? ` · ${counts.member} already in` : ''}{counts.invited ? ` · ${counts.invited} invited` : ''}.
              They join with one tap — nobody's added without saying yes.
            </p>
            <ul className="divide-y divide-violet-100 mb-3">
              {crew.map(c => (
                <li key={c.user_id} className="flex items-center justify-between gap-3 py-1.5">
                  <label className="flex items-center gap-2 min-w-0 text-sm">
                    {c.status === 'none' && c.can_email && (
                      <input type="checkbox" checked={crewPicked.has(c.user_id)}
                        onChange={e => setCrewPicked(s => { const n = new Set(s); e.target.checked ? n.add(c.user_id) : n.delete(c.user_id); return n })} />
                    )}
                    <span className="truncate text-gray-900">{c.display_name}</span>
                  </label>
                  <span className={`text-[11px] font-semibold flex-shrink-0 ${c.status === 'member' ? 'text-emerald-600' : c.status === 'invited' ? 'text-amber-700' : 'text-gray-400'}`}>
                    {c.status === 'member' ? '✓ In' : c.status === 'invited' ? 'Invited' : c.can_email ? '' : 'No email — use WhatsApp'}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              {invitable.length > 0 && (
                <button onClick={inviteCrew} disabled={sendingCrew || crewPicked.size === 0}
                  className="text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 px-3 py-1.5 rounded-lg">
                  {sendingCrew ? 'Sending…' : `Email invites to ${crewPicked.size}`}
                </button>
              )}
              <a href={`https://wa.me/?text=${waCrew}`} target="_blank" rel="noreferrer"
                className="text-xs font-bold text-emerald-700 border border-emerald-200 bg-white hover:bg-emerald-50 px-3 py-1.5 rounded-lg">
                Message your group on WhatsApp →
              </a>
            </div>
            {crewMsg && <p className={`text-xs mt-2 ${crewMsg.startsWith('✓') ? 'text-emerald-700' : 'text-red-600'}`}>{crewMsg}</p>}
          </div>
        )
      })()}

      {activeTab === 'requests' && (
        <div>
          <label className="flex items-center gap-2 text-xs text-gray-500 mb-3">
            <input type="checkbox" checked={owingOnly} onChange={e => setOwingOnly(e.target.checked)} />
            Show only pending / owing
          </label>
          <div className="space-y-2">
            {requests.map(r => (
              <div key={r.id} className="border border-gray-200 rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="text-sm">
                  <p className="font-semibold text-gray-900">{r.buyer?.display_name ?? 'Someone'} — {r.tickets_requested} ticket{r.tickets_requested === 1 ? '' : 's'}</p>
                  <p className="text-xs text-gray-500">
                    {r.payment_method.replace('_', ' ')} · {r.status}{r.status === 'approved' && !r.paid_at ? ' · owing' : ''}
                    {r.receipt_url && <> · <a href={r.receipt_url} target="_blank" rel="noreferrer" className="underline">receipt</a></>}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {r.status === 'pending' && (
                    <>
                      <button onClick={() => act(r.tribe_id, r.id, 'approve')} className="text-xs font-bold text-emerald-600 border border-emerald-200 hover:bg-emerald-50 px-2 py-1 rounded-lg">Approve</button>
                      <button onClick={() => act(r.tribe_id, r.id, 'reject')} className="text-xs font-bold text-red-500 border border-red-200 hover:bg-red-50 px-2 py-1 rounded-lg">Reject</button>
                    </>
                  )}
                  {r.status === 'approved' && !r.paid_at && (
                    <button onClick={() => act(r.tribe_id, r.id, 'mark_paid')} className="text-xs font-bold text-gray-700 border border-gray-200 hover:bg-gray-50 px-2 py-1 rounded-lg">Mark paid</button>
                  )}
                </div>
              </div>
            ))}
            {requests.length === 0 && <p className="text-xs text-gray-400 text-center py-6">Nothing here.</p>}
          </div>
        </div>
      )}

      {activeTab === 'allocation' && (
        <div>
          <p className="text-xs text-gray-500 mb-3">
            Who holds which tickets. Someone not spinning? Tap <span className="font-bold text-amber-800">🎲 Draw for them</span> next
            to their name for a random horse — they&apos;re emailed it.
            {!isPracticeComp && ` Everyone gets ${DRAW_GRACE_HOURS} hours to spin for themselves first.`}
          </p>
          {pools.length > 1 && (
            <select value={allocTribeId} onChange={e => setAllocTribeId(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3">
              {pools.map(p => <option key={p.id} value={p.id}>{p.name}{p.draw_open && poolUnspun(p) > 0 ? ` · ${poolUnspun(p)} to spin` : ''}</option>)}
            </select>
          )}
          <div className="border border-gray-200 rounded-2xl p-5">
            <div className="divide-y divide-gray-100">
              {(allocRoster ?? []).map((r: any) => (
                <div key={r.user_id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="text-gray-700">{r.display_name}</span>
                  <span className="text-right">
                    {r.horses.length === 0 && r.unclaimed === 0 && <span className="text-gray-300">—</span>}
                    {r.horses.map((h: any) => (
                      <span key={h.id} className={`block ${h.hidden ? 'text-gray-400 italic' : h.scratched ? 'text-red-400 line-through' : 'text-gray-900 font-medium'}`}>
                        {h.hidden ? '🔒 hidden' : `#${h.number} ${h.name}`}
                      </span>
                    ))}
                    {r.unclaimed > 0 && <span className="block text-gray-400 italic">{r.unclaimed} still picking…</span>}
                    {/* Draw for them — once the draw's open; a random horse, emailed to them. */}
                    {r.unclaimed > 0 && pools.find(p => p.id === allocTribeId)?.draw_open && (
                      r.draw_unlocks_at && new Date(r.draw_unlocks_at).getTime() > now ? (
                        <span className="block mt-1 text-xs text-gray-400">
                          Draw in {fmtLeft(new Date(r.draw_unlocks_at).getTime() - now)}
                        </span>
                      ) : confirmDrawMember === r.user_id ? (
                        <span className="inline-flex gap-2 mt-1 text-xs">
                          <button onClick={() => drawForMember(allocTribeId, r.user_id)} className="font-bold text-white bg-amber-600 hover:bg-amber-700 px-2 py-0.5 rounded-lg">Yes, draw</button>
                          <button onClick={() => setConfirmDrawMember(null)} className="font-semibold text-gray-500">Cancel</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmDrawMember(r.user_id)} disabled={drawingMember === r.user_id}
                          className="mt-1 text-xs font-bold text-amber-800 border border-amber-300 hover:bg-amber-50 disabled:opacity-50 px-2 py-0.5 rounded-lg">
                          {drawingMember === r.user_id ? 'Drawing…' : '🎲 Draw for them'}
                        </button>
                      )
                    )}
                  </span>
                </div>
              ))}
              {(allocRoster ?? []).length === 0 && <p className="text-xs text-gray-400 py-2">No members yet.</p>}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'pools' && (
        <div className="space-y-2">
          {pools[0] && !pools[0].draw_open && (
            <p className="text-xs text-sky-900 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
              Selling before the field is final: each pool takes up to {pools[0].field_size} tickets, and spinning opens {DRAW_OPENS_LABEL}.
              If the final field is smaller, the last tickets sold in a full pool will need a refund — they&apos;ll be listed here.
            </p>
          )}
          {pools.map(p => (
            <div key={p.id} className="border border-gray-200 rounded-xl p-3 flex items-center justify-between gap-3">
              <div className="text-sm">
                <p className="font-semibold text-gray-900">{p.name}</p>
                <p className="text-xs text-gray-500">
                  {p.members} member{p.members === 1 ? '' : 's'} · {p.tickets} of {p.field_size || '—'} tickets sold · {p.claimed} drawn
                  {p.field_size > 0 && p.tickets >= p.field_size ? ' · sold out' : ''}{p.locked ? ' · locked' : ''}
                </p>
                {p.prizes && (
                  <p className="text-xs text-amber-800 mt-0.5">
                    Pot {fmtCents(p.prizes.pot_cents)}{p.prizes.fee_cents > 0 ? ` (after ${fmtCents(p.prizes.fee_cents)} fee)` : ''} →{' '}
                    {p.prizes.places.map(x => `${['🥇', '🥈', '🥉'][x.place - 1]} ${fmtCents(x.cents)}`).join(' · ')}
                  </p>
                )}
                {p.refunds.length > 0 && (
                  <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1 mt-1">
                    Short field — refund {p.refunds.map(r => `${r.display_name} (${r.tickets} ticket${r.tickets === 1 ? '' : 's'})`).join(', ')}.
                    These were the last tickets sold and have no horse to spin for.
                  </p>
                )}
                {/* Tickets bought but not spun — one slow member holds the whole pool's reveal
                    back, and can't spin at all once it locks. Draw them at random. */}
                {(() => {
                  const unspun = poolUnspun(p)
                  if (!p.draw_open || unspun <= 0) return null
                  return (
                    <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mt-1">
                      <p className="text-amber-900">
                        {unspun} ticket{unspun === 1 ? '' : 's'} not spun yet. Draw a random horse for them — each holder is emailed theirs.
                        {!isPracticeComp && ` Holders get ${DRAW_GRACE_HOURS} hours to spin for themselves first — tickets still inside that window are left alone. Anything left is drawn automatically 30 minutes before the race.`}
                      </p>
                      {confirmDrawPool === p.id ? (
                        <span className="flex gap-2 mt-1.5">
                          <button onClick={() => drawUnspun(p.id)} className="font-bold text-white bg-amber-600 hover:bg-amber-700 px-2.5 py-1 rounded-lg">Yes, draw now</button>
                          <button onClick={() => setConfirmDrawPool(null)} className="font-semibold text-gray-500">Cancel</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmDrawPool(p.id)} disabled={drawingPool === p.id}
                          className="mt-1.5 font-bold text-amber-800 border border-amber-300 hover:bg-amber-100 disabled:opacity-50 px-2.5 py-1 rounded-lg">
                          {drawingPool === p.id ? 'Drawing…' : `🎲 Draw for ${unspun} unspun ticket${unspun === 1 ? '' : 's'}`}
                        </button>
                      )}
                    </div>
                  )
                })()}
              </div>
              {!p.locked ? (
                <button onClick={() => closePool(p.id)} className="text-xs font-bold text-red-600 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg whitespace-nowrap">Close pool</button>
              ) : (
                <button onClick={() => reopenPool(p.id)} className="text-xs font-bold text-gray-500 border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded-lg whitespace-nowrap">Reopen joins</button>
              )}
            </div>
          ))}
          {pools.length === 0 && <p className="text-xs text-gray-400 text-center py-6">No pools yet.</p>}
        </div>
      )}

      {activeTab === 'settings' && settings && (
        <div className="space-y-5">
          <div className={cardClass(poolsDirty)}>
            <h2 className="font-bold text-gray-900 mb-1 text-sm">Pools</h2>
            <p className="text-xs text-gray-500 mb-3">
              How many pools this sweep can grow to — joiners auto-move into a new one once the current ones fill.
              {' '}Pools can be added but not removed.
              {billing?.enabled && ` ${billing.included_pools} pool${billing.included_pools === 1 ? '' : 's'} free, then $${(billing.per_pool_cents / 100).toFixed(2)} per extra pool, paid by card.`}
            </p>
            {poolsPaid && (
              <p className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3">
                ✓ Payment received — your new pools will appear in a moment.
              </p>
            )}
            <div className="flex items-center gap-2">
              <input type="number" min={Math.max(1, minMaxTribes)} max={5} value={maxTribesInput} onChange={e => setMaxTribesInput(e.target.value)}
                className={`w-20 border rounded-lg px-2 py-1.5 text-sm text-center ${maxTribesInput !== '' && !maxTribesValid ? 'border-red-400' : 'border-gray-300'}`} />
              <button onClick={saveMaxTribes} disabled={savingMaxTribes || !maxTribesValid || maxTribesN === settings.max_tribes}
                className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-3 py-1.5 rounded-lg">
                {savingMaxTribes ? 'Saving…' : addPoolsCost > 0 ? `Add ${poolsToAdd} · pay $${addPoolsCost.toFixed(2)}` : poolsToAdd > 0 ? `Add ${poolsToAdd}` : 'Save'}
              </button>
              {unsavedNote(poolsDirty, discardPools)}
            </div>
            {maxTribesInput !== '' && !maxTribesValid && (
              <p className="text-xs text-red-600 mt-2">
                {maxTribesN < minMaxTribes && minMaxTribes > 1
                  ? `This sweep already has ${minMaxTribes} pools — you can add more (up to 5), but not remove any.`
                  : `Choose between ${Math.max(1, minMaxTribes)} and 5 pools.`}
              </p>
            )}
          </div>

          <div className={cardClass(prizesDirty)}>
            <h2 className="font-bold text-gray-900 mb-1 text-sm">Ticket price &amp; prizes</h2>
            <p className="text-xs text-gray-500 mb-3">Each pool pays its own 1st, 2nd and 3rd from the tickets sold in it. Buyers see the prizes before they buy.</p>

            <label className="flex items-center justify-between gap-3 mb-3">
              <span className="text-xs font-semibold text-gray-700">Ticket price</span>
              <span className="flex items-center gap-1">
                <span className="text-sm text-gray-500">$</span>
                <input value={priceInput} onChange={e => setPriceInput(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" disabled={priceLocked}
                  placeholder="5" className={`w-20 border rounded-lg px-2 py-1.5 text-sm text-center disabled:bg-gray-50 disabled:text-gray-500 ${priceInput && !priceCentsInput ? 'border-red-400' : 'border-gray-300'}`} />
              </span>
            </label>
            {priceLocked && <p className="text-[11px] text-gray-400 -mt-2 mb-3">Locked — tickets are already sold or requested.</p>}

            <p className="text-xs font-semibold text-gray-700 mb-1.5">Prize split</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {PRIZE_PRESETS.map(p => (
                <button key={p.id} type="button" onClick={() => setSplitInput(p.split.map(String) as [string, string, string])}
                  className={`text-xs font-bold px-2.5 py-1.5 rounded-lg ${JSON.stringify(splitNums) === JSON.stringify(p.split) ? 'bg-emerald-600 text-white' : 'border border-gray-300 text-gray-600'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 mb-1">
              {(['🥇', '🥈', '🥉'] as const).map((medal, i) => (
                <label key={medal} className="flex items-center gap-1 text-xs text-gray-500">
                  {medal}
                  <input value={splitInput[i]} inputMode="numeric"
                    onChange={e => setSplitInput(s => { const n = [...s] as [string, string, string]; n[i] = e.target.value.replace(/\D/g, '').slice(0, 3); return n })}
                    className="w-12 border border-gray-300 rounded-lg px-1.5 py-1 text-sm text-center" />%
                </label>
              ))}
            </div>
            {!splitValid && <p className="text-[11px] text-red-600 mb-1">The three percentages must add up to 100.</p>}

            <label className="flex items-start gap-2 mt-3 mb-3">
              <input type="checkbox" checked={settings.sweep_deduct_fee} disabled={savingSetting === 'sweep_deduct_fee'}
                onChange={async e => {
                  const next = e.target.checked
                  setSavingSetting('sweep_deduct_fee')
                  const res = await fetch(`/api/comps/${compId}/sweep-settings`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deduct_fee: next }),
                  }).then(r => r.json())
                  setSavingSetting(null)
                  if (res.error) { setError(res.error); return }
                  setSettings(s => s ? { ...s, sweep_deduct_fee: next } : s)
                  loadPools(compId)
                }} className="mt-0.5" />
              <span className="text-xs text-gray-600">
                Take any TribePicks pool fee out of the prize pot <span className="text-gray-400">(shared across your pools; buyers see it as its own line. Free pools have no fee.)</span>
              </span>
            </label>

            <div className="flex items-center gap-3">
              <button onClick={savePrizes} disabled={savingPrizes || !priceCentsInput || !splitValid || !prizesDirty}
                className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-3 py-1.5 rounded-lg">
                {savingPrizes ? 'Saving…' : 'Save'}
              </button>
              {prizesSavedAt && !prizesDirty && <span className="text-xs text-emerald-600 font-semibold">✓ Saved</span>}
              {unsavedNote(prizesDirty, discardPrizes)}
              {!settings.sweep_ticket_price_cents && <span className="text-[11px] text-amber-700">Set a price so buyers can see the prizes.</span>}
            </div>
          </div>

          <div className={cardClass(detailsDirty)}>
            <h2 className="font-bold text-gray-900 mb-1 text-sm">Bank transfer</h2>
            <p className="text-xs text-gray-500 mb-3">Where buyers pay you.</p>

            {/* Show the details here, or hand them out yourself (migration 202). */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              {([[false, 'Show them in my sweep'], [true, "I'll share them directly"]] as const).map(([direct, label]) => (
                <button key={label} type="button" onClick={() => setDetails(d => ({ ...d, bank_shared_directly: direct }))}
                  className={`text-xs font-bold px-3 py-2 rounded-lg ${details.bank_shared_directly === direct ? 'bg-emerald-600 text-white' : 'border border-gray-300 text-gray-600'}`}>
                  {label}
                </button>
              ))}
            </div>

            {details.bank_shared_directly ? (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-3">
                  Send your bank details or PayID to your group yourself — WhatsApp, email or in person. Buyers who pick
                  bank transfer are told to get them from you, then attach their receipt here as usual.
                  {detailsHaveContact(details) ? ' Your contact details below show to them, in case they missed yours.' : ' Add a contact mobile or email below so buyers who missed them can ask.'}
                </p>
                <label className="flex items-start gap-2 text-xs text-gray-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 cursor-pointer">
                  <input type="checkbox" checked={details.bank_shared_confirmed} className="mt-0.5"
                    onChange={e => setDetails(d => ({ ...d, bank_shared_confirmed: e.target.checked }))} />
                  <span>I've shared, or will share, my bank details with everyone buying a ticket in this sweep.</span>
                </label>
                {detailsHavePayment(savedDetails) && (
                  <p className="text-[11px] text-amber-700 mt-2">Saving this removes the bank details stored on TribePicks.</p>
                )}
              </div>
            ) : (
            <>
            <p className="text-xs text-gray-500 mb-3">These details show to everyone in your sweep.</p>
            <div className="space-y-2 mb-1">
              <input value={details.bank_account_name} onChange={e => setDetails(d => ({ ...d, bank_account_name: e.target.value }))}
                placeholder="Account name" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <div className="flex gap-2">
                <input value={details.bank_bsb} onChange={e => setDetails(d => ({ ...d, bank_bsb: e.target.value }))}
                  placeholder="BSB" inputMode="numeric" className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                <input value={details.bank_account_number} onChange={e => setDetails(d => ({ ...d, bank_account_number: e.target.value }))}
                  placeholder="Account number" inputMode="numeric" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              {/* PayID — most people's is their mobile, so that's the default, with a one-tap
                  fill from the contact mobile below. */}
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs text-gray-500">…or PayID:</span>
                  {PAYID_KINDS.map(k => (
                    <button key={k.kind} type="button" onClick={() => setDetails(d => ({ ...d, payid_kind: k.kind }))}
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-lg ${details.payid_kind === k.kind ? 'bg-emerald-600 text-white' : 'border border-gray-300 text-gray-600'}`}>
                      {k.label}
                    </button>
                  ))}
                </div>
                {(() => {
                  const k = PAYID_KINDS.find(x => x.kind === details.payid_kind)!
                  return (
                    <div className="flex gap-2">
                      <input value={details.payid} onChange={e => setDetails(d => ({ ...d, payid: e.target.value }))}
                        placeholder={k.placeholder} inputMode={k.inputMode} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                      {details.payid_kind === 'mobile' && details.contact_phone && details.payid !== details.contact_phone && (
                        <button type="button" onClick={() => setDetails(d => ({ ...d, payid: d.contact_phone }))}
                          className="text-[11px] font-bold text-emerald-700 border border-emerald-200 hover:bg-emerald-50 px-2.5 rounded-lg whitespace-nowrap">
                          Use my mobile
                        </button>
                      )}
                    </div>
                  )
                })()}
                {details.payid_kind === 'mobile' && details.payid.trim() && (
                  <p className="text-[11px] text-amber-700 mt-1">
                    Everyone in your sweep will see this number — it's how they pay you. (Your contact mobile below still only shows when an approval runs late.)
                  </p>
                )}
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mb-4">
              {detailsHavePayment(details)
                ? 'Bank transfer is available to buyers.'
                : 'Needs an account name plus BSB & account number, or a PayID. Until then buyers can only pay cash.'}
            </p>
            </>
            )}
            {saveDetailsRow}

            <div className={`border-t border-gray-100 mt-4 pt-4 ${detailsAllowTransfer(savedDetails) ? '' : 'opacity-50'}`}>
              <p className="text-xs font-semibold text-gray-700 mb-1">Approving transfers</p>
              <p className="text-xs text-gray-500 mb-3">
                {detailsAllowTransfer(savedDetails)
                  ? 'Manual: you review each receipt. Auto: approved the instant a receipt is attached.'
                  : 'Save your bank details above to turn on bank transfers.'}
              </p>
              <div className="flex gap-2">
                {(['manual', 'auto'] as const).map(m => (
                  <button key={m} onClick={() => updateSetting('sweep_approval_mode', m)}
                    disabled={savingSetting === 'sweep_approval_mode' || !detailsAllowTransfer(savedDetails)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-lg capitalize ${settings.sweep_approval_mode === m ? 'bg-emerald-600 text-white' : 'border border-gray-300 text-gray-600'}`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={cardClass(detailsDirty)}>
            <h2 className="font-bold text-gray-900 mb-1 text-sm">Approvals &amp; contact</h2>
            <p className="text-xs text-gray-500 mb-4">
              Applies to every request, cash or transfer. Your phone/email only shows to a buyer whose
              request is past your approval window.
            </p>

            <label className="block text-xs font-semibold text-gray-700 mb-1">I'll approve requests within</label>
            <div className="flex gap-2 mb-1">
              {APPROVAL_WINDOWS.map(h => (
                <button key={h} type="button" onClick={() => setDetails(d => ({ ...d, approval_window_hours: h }))}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg ${details.approval_window_hours === h ? 'bg-emerald-600 text-white' : 'border border-gray-300 text-gray-600'}`}>
                  {h}h
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mb-4">Never later than 30 minutes before the race, when pools lock.</p>

            <p className="text-xs font-semibold text-gray-700 mb-1">Your contact for late approvals</p>
            <div className="space-y-2 mb-1">
              <input value={details.contact_name} onChange={e => setDetails(d => ({ ...d, contact_name: e.target.value }))}
                placeholder="Your name" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <div className="flex gap-2">
                <input value={details.contact_phone} onChange={e => setDetails(d => ({ ...d, contact_phone: e.target.value }))}
                  placeholder="Mobile / WhatsApp (optional)" inputMode="tel" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                <input value={details.contact_email} onChange={e => setDetails(d => ({ ...d, contact_email: e.target.value }))}
                  placeholder="Email (optional)" inputMode="email" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mb-4">Your login email is never shown. Leave both blank and buyers can still send you an in-app reminder.</p>
            {saveDetailsRow}
          </div>

          <div className="border border-gray-200 rounded-2xl p-5">
            <h2 className="font-bold text-gray-900 mb-1 text-sm">Allow IOU</h2>
            <p className="text-xs text-gray-500 mb-3">Let buyers get tickets now and pay you back later.</p>
            <button onClick={() => updateSetting('allow_iou', !settings.allow_iou)} disabled={savingSetting === 'allow_iou'}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg ${settings.allow_iou ? 'bg-emerald-600 text-white' : 'border border-gray-300 text-gray-600'}`}>
              {settings.allow_iou ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          <div className="border border-red-200 rounded-2xl p-5">
            <h2 className="font-bold text-red-700 mb-1 text-sm">Delete this sweep</h2>
            <p className="text-xs text-gray-500 mb-3">
              Only possible before it's started selling — once a pool has a ticket or a payment request, this is blocked. Permanent, can't be undone.
            </p>
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)}
                className="text-xs font-bold text-red-600 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg">Delete sweep</button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600 font-semibold">Are you sure? This can't be undone.</span>
                <button onClick={() => setConfirmDelete(false)} className="text-xs font-bold text-gray-500 hover:text-gray-700">Cancel</button>
                <button onClick={deleteSweep} disabled={deleting}
                  className="text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 px-3 py-1.5 rounded-lg">
                  {deleting ? 'Deleting…' : 'Confirm delete'}
                </button>
              </div>
            )}
            {deleteError && <p className="mt-3 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{deleteError}</p>}
          </div>
        </div>
      )}

      <p className="mt-6 text-center text-xs">
        <Link href="/rules/melbourne-cup-2026" className="text-gray-400 hover:text-gray-600 underline">The rules your players see</Link>
      </p>
    </main>
  )
}
