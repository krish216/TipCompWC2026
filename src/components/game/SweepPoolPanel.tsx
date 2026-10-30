'use client'

import { useEffect, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import Link from 'next/link'
import { Spinner } from '@/components/ui'
import { SweepWheel } from '@/components/game/SweepWheel'
import { fmtLeft } from '@/lib/sweep/grace'
import { FeedLuckNudge } from '@/components/game/FeedLuckNudge'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { payIdKind } from '@/lib/sweep/organiser'
import { fmtCents, type PoolPrizes } from '@/lib/sweep/prizes'
import { finishedLabel, horseDetails, ordinal, prizeLabel } from '@/lib/sweep/podium'

type Horse = {
  id: string; number: number; name: string; scratched: boolean; finish_position: number | null
  barrier?: number | null; jockey?: string | null; trainer?: string | null; weight_kg?: number | null   // migration 207
}
type HiddenHorse = { id: string; hidden: true }
type HorseOrHidden = Horse | HiddenHorse
const isHidden = (h: HorseOrHidden): h is HiddenHorse => (h as any)?.hidden === true

type RosterRow = {
  user_id: string; display_name: string; avatar_url: string | null
  horses: HorseOrHidden[]; unclaimed: number; total_tickets: number
  draw_unlocks_at?: string | null   // organiser only: when "Draw for them" opens (2-hour window)
  paid?: number; owed?: number      // organiser only: dollars received, and IOUs still owed
}
type SweepState = {
  comp_id: string
  locked: boolean
  is_comp_admin: boolean
  is_member: boolean
  allow_iou: boolean
  approval_mode: 'manual' | 'auto'
  draw_full: boolean
  draw_hidden: boolean   // other members' horses are redacted until the pool closes
  horses: Horse[]
  available_count: number   // horses still undrawn — a count only, never which
  roster: RosterRow[]
  my_horses: HorseOrHidden[]
  my_unclaimed: number
  // Roll-down prize winners (lib/sweep/podium.ts) — empty until the full result is in.
  podium: { places: number[]; horse: Horse | null; finished: number; winner: RosterRow | null; cents: number | null }[]
  race_run: boolean
  finish_by_horse: Record<string, number | null> | null   // where each horse finished, once the race is run
  organiser_name: string | null
  approval_window_hours: number
  race_start_at: string | null
  payment_details: { account_name: string | null; bsb: string | null; account_number: string | null; payid: string | null } | null
  bank_shared_directly: boolean   // bank transfer, details given out by the organiser (migration 202)
  organiser_contact: { phone: string | null; email: string | null } | null   // once a request of yours is overdue, or up front when bank details are shared directly
  ticket_price_cents: number | null
  prizes: PoolPrizes | null   // null until the organiser sets a ticket price
  is_practice: boolean        // practice sweep (migration 200): no real money, pretend race
  field_size: number
  tickets_left: number        // capacity less granted tickets and pending requests
  draw_open: boolean         // false → selling before the field is known: no spinning yet (migration 201)
  draw_opens_label: string
  my_over_field: number       // my tickets with no horse after a short final field — refunded
  my_spin_by: string | null   // spin by then, or the organiser may draw for you (lib/sweep/grace.ts)
  auto_draw_at: string | null // TribePicks draws whatever's still unspun (30 min before the race)
}
type MyRequest = {
  id: string; tickets_requested: number; payment_method: 'cash' | 'bank_transfer' | 'iou'
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'; amount: number | null; receipt_url: string | null
  created_at: string; notes: string | null; last_reminded_at: string | null; receipt_attached_at: string | null
  auto_draw?: boolean
}

// Mirrors approvalDeadline() in lib/sweep/organiser.ts: the window from when the request
// became reviewable (receipt attached, for a bank transfer), never later than the pool's
// auto-lock 30 min before the race.
const AUTO_LOCK_BEFORE_MS = 30 * 60 * 1000
function requestDeadline(r: MyRequest, windowHours: number, raceStartAt: string | null): Date {
  const byWindow = new Date(r.receipt_attached_at ?? r.created_at).getTime() + windowHours * 3600_000
  const byLock = raceStartAt ? new Date(raceStartAt).getTime() - AUTO_LOCK_BEFORE_MS : Infinity
  return new Date(Math.min(byWindow, byLock))
}
const fmtDollars = (d: number) => fmtCents(Math.round(d * 100))
const METHOD_LABEL = { cash: 'Cash', bank_transfer: 'Bank transfer', iou: 'IOU (owed)' } as const
const fmtWhen = (d: Date) => d.toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

// The per-tribe sweep draw — shared by the standalone /sweep page and the tribe page's
// "Draw" tab (a sweep tribe IS a pool, so this is that pool's core content either way).
// A member can hold several tickets; the wheel is available any time they hold an
// unclaimed one, regardless of whether the pool is locked for NEW joins/requests — locking
// stops new commitments, it doesn't un-grant tickets already handed out.
// `openPool` — another of your pools in this sweep that's still selling, offered when this
// one is sold out.
export function SweepPoolPanel({ tribeId, openPool }: {
  tribeId: string
  openPool?: { name: string; onSelect: () => void } | null
}) {
  const { session } = useSupabase()
  const [sweep, setSweep]     = useState<SweepState | null>(null)
  const [loading, setLoading] = useState(true)
  const [locking, setLocking] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  // Organiser "buy on their behalf": ticked members, then a basket of tickets + method each.
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [basket, setBasket] = useState<Record<string, { tickets: string; method: 'cash' | 'bank_transfer' | 'iou' }> | null>(null)
  const [buyingFor, setBuyingFor] = useState(false)
  // Errors shown beside the button that caused them — the page-level `error` sits at the very
  // bottom, a screen or more away from the Buy card and hidden behind the buy-on-behalf sheet.
  const [buyError, setBuyError] = useState<string | null>(null)
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null)
  // The request just sent — its "what happens next" card says "Request sent" and is scrolled
  // into view, so the buyer sees it went through (the Buy card is far down the page).
  const [justRequestedId, setJustRequestedId] = useState<string | null>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [basketError, setBasketError] = useState<string | null>(null)

  const [myRequests, setMyRequests] = useState<MyRequest[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [buyCount,  setBuyCount]  = useState('1')
  const [buyMethod, setBuyMethod] = useState<'cash' | 'bank_transfer' | 'iou'>('cash')
  const [autoDraw, setAutoDraw] = useState(false)   // "draw my horse for me" (migration 203)
  const [confirmDrawFor, setConfirmDrawFor] = useState<string | null>(null)   // organiser "draw for them"
  const [drawingFor, setDrawingFor] = useState<string | null>(null)
  const [justDrawnId, setJustDrawnId] = useState<string | null>(null)   // highlight in Your horses
  const [buying,    setBuying]    = useState(false)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [remindingId, setRemindingId] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())   // ticks the spin-window countdowns
  const [rosterView, setRosterView] = useState<'person' | 'horse'>('person')   // "Who's in this pool": the people, or the sweep sheet

  async function load() {
    const s = await fetch(`/api/tribes/${tribeId}/sweep`).then(r => r.json())
    // The API returns {error} (no my_horses/etc.) on a 400/403/404 — e.g. tribeId pointing
    // at a tribe the caller isn't a member of, or isn't a sweep. Guard here rather than let
    // the render crash on sweep.my_horses.length, since a wrong/stale tribeId can reach
    // this component from more than one caller.
    if (s.error) {
      setError(s.error)
      setSweep(null)
      setLoading(false)
      return
    }
    setSweep(s)
    if (session?.user?.id) {
      const r = await fetch(`/api/tribes/${tribeId}/sweep/requests`).then(r => r.json())
      const all = (r.data ?? []) as any[]
      setMyRequests(all.filter(req => req.user_id === session.user.id))
      // For an organiser the API returns every request in the pool, not just their own.
      setPendingCount(r.is_comp_admin ? all.filter(req => req.status === 'pending').length : 0)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [tribeId, session?.user?.id])

  // Tick the countdowns while any are running (the holder's own, or the organiser's
  // "Draw for them" unlocks).
  const countingDown = !!sweep && (!!sweep.my_spin_by || sweep.roster.some(r => r.draw_unlocks_at))
  useEffect(() => {
    if (!countingDown) return
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [countingDown])

  // Is the Buy tickets card on screen? Drives the slim sticky "Get a ticket" bar on phones.
  const buyCardRef = useRef<HTMLDivElement>(null)
  const [buyCardVisible, setBuyCardVisible] = useState(true)
  const buyCardMounted = !!sweep && !sweep.locked && sweep.tickets_left > 0
  useEffect(() => {
    const el = buyCardRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setBuyCardVisible(e.isIntersecting), { threshold: 0.2 })
    io.observe(el)
    return () => io.disconnect()
  }, [buyCardMounted])

  async function handleLock() {
    setLocking(true); setError(null)
    const res = await fetch(`/api/tribes/${tribeId}/sweep/lock`, { method: 'POST' }).then(r => r.json())
    setLocking(false)
    if (res.error) { setError(res.error); return }
    await load()
  }

  async function handleUnlock() {
    setLocking(true); setError(null)
    const res = await fetch(`/api/tribes/${tribeId}/sweep/lock`, { method: 'DELETE' }).then(r => r.json())
    setLocking(false)
    if (res.error) { setError(res.error); return }
    await load()
  }

  function openBasket() {
    setBasket(Object.fromEntries([...picked].map(id => [id, { tickets: '1', method: 'cash' as const }])))
  }

  // Recorded as approved purchases — they show in the paid column and the buyer is emailed.
  async function handleBuyOnBehalf() {
    if (!basket) return
    setBuyingFor(true); setBasketError(null)
    const res = await fetch(`/api/tribes/${tribeId}/sweep/buy-on-behalf`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purchases: Object.entries(basket).map(([user_id, b]) => ({
        user_id, tickets: parseInt(b.tickets, 10) || 1, payment_method: b.method,
      })) }),
    }).then(r => r.json())
    setBuyingFor(false)
    if (res.error) { setBasketError(res.error); return }
    if (res.failed?.length) setError(`Bought for ${res.bought}, but not everyone: ${res.failed[0].error}`)
    setBasket(null); setPicked(new Set())
    await load()
  }

  // The server draws the horse (uniform random from what's left) — we never send one.
  async function handleDraw() {
    const res = await fetch(`/api/tribes/${tribeId}/sweep/pick`, { method: 'POST' }).then(r => r.json())
    if (res.error) return { ok: false, error: res.error }
    // Let the wheel settle onto the horse (~600ms) before celebrating, and refresh only after
    // — refreshing at once re-keyed the wheel mid-settle, so the result never showed.
    setTimeout(() => {
      try { confetti({ particleCount: 140, spread: 85, origin: { y: 0.35 }, colors: ['#22d3ee', '#e879f9', '#a78bfa', '#fbbf24', '#ffffff'] }) } catch {}
    }, 650)
    setTimeout(async () => { await load(); setJustDrawnId((res.horse as Horse).id) }, 2600)
    return { ok: true, horse: res.horse as Horse }
  }

  // Organiser draws for a member who isn't spinning — same random server draw as the wheel.
  async function drawFor(userId: string) {
    setDrawingFor(userId); setConfirmDrawFor(null); setError(null)
    const res = await fetch(`/api/tribes/${tribeId}/sweep/draw-unspun`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId }),
    }).then(r => r.json())
    setDrawingFor(null)
    if (res.error) { setError(res.error); return }
    await load()
  }

  async function handleBuy() {
    const count = parseInt(buyCount, 10) || 1
    setBuying(true); setBuyError(null)
    const res = await fetch(`/api/tribes/${tribeId}/sweep/requests`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickets_requested: count, payment_method: buyMethod, ...(autoDraw ? { auto_draw: true } : {}) }),
    }).then(r => r.json())
    setBuying(false)
    if (res.error) { setBuyError(res.error); return }
    setBuyCount('1')
    await load()
    // Pending → the "what happens next" card at the top; an IOU is approved on the spot, so
    // the wheel (or "tickets secured") is what's at the top instead.
    setJustRequestedId(res.request?.id ?? null)
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function handleReceipt(requestId: string, file: File) {
    setUploadingId(requestId); setError(null)
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`/api/tribes/${tribeId}/sweep/requests/${requestId}/receipt`, { method: 'POST', body: form }).then(r => r.json())
    setUploadingId(null)
    if (res.error) { setError(res.error); return }
    await load()
  }

  // The buyer withdrawing their own pending request — frees the tickets it was holding.
  async function handleCancelRequest(requestId: string) {
    setCancellingId(requestId); setConfirmCancelId(null); setBuyError(null)
    const res = await fetch(`/api/tribes/${tribeId}/sweep/requests/${requestId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel' }),
    }).then(r => r.json())
    setCancellingId(null)
    if (res.error) { setBuyError(res.error); return }
    await load()
  }

  async function handleRemind(requestId: string) {
    setRemindingId(requestId); setError(null)
    const res = await fetch(`/api/tribes/${tribeId}/sweep/requests/${requestId}/remind`, { method: 'POST' }).then(r => r.json())
    setRemindingId(null)
    if (res.error) { setError(res.error); return }
    setMyRequests(prev => prev.map(r => r.id === requestId ? { ...r, last_reminded_at: res.reminded_at } : r))
  }

  if (loading) return <div className="flex justify-center py-10"><Spinner className="w-6 h-6 text-emerald-600" /></div>
  if (!sweep) return error ? <p className="text-sm text-red-600 text-center py-10">{error}</p> : null

  const renderHorse = (h: HorseOrHidden) => isHidden(h)
    ? <span className="block text-gray-400 italic">🔒 hidden until the pool fills</span>
    : <span className={`block ${h.scratched ? 'text-red-400 line-through' : 'text-gray-900 font-medium'}`}>#{h.number} {h.name}</span>

  const raceRun = sweep.race_run
  const hasTickets = sweep.my_horses.length > 0 || sweep.my_unclaimed > 0
    || myRequests.some(r => r.status === 'pending' || r.status === 'approved')
  const showBuyBar = !buyCardVisible && !sweep.locked && sweep.tickets_left > 0
    && !hasTickets && !sweep.is_comp_admin

  return (
    <>
      <div ref={topRef} className="scroll-mt-20" />
      {/* Approved tickets waiting to spin come FIRST — it's what the holder came back for.
          Below the buy card, on a phone, it sat several screens down and looked missing. */}
      {!sweep.draw_open && sweep.my_unclaimed > 0 ? (
        <div className="border border-emerald-200 bg-emerald-50 rounded-2xl p-5 mb-5 text-center">
          <p className="text-sm font-bold text-emerald-900">
            🎟️ {sweep.my_unclaimed} ticket{sweep.my_unclaimed === 1 ? '' : 's'} secured
          </p>
          <p className="text-xs text-emerald-800 mt-1">
            The draw opens {sweep.draw_opens_label}, once the final field is declared. We'll email you the moment you can spin for your horse.
          </p>
        </div>
      ) : sweep.my_unclaimed > 0 && (
        <div className="mb-5">
          <p className="text-center text-sm font-bold text-gray-900 mb-2">
            🎡 {sweep.my_unclaimed} pick{sweep.my_unclaimed === 1 ? '' : 's'} left to spin for
          </p>
          <SweepWheel key={sweep.my_unclaimed} slots={sweep.available_count} onDraw={handleDraw} />
          {/* The 2-hour window: a soft deadline, so a calm line — amber only in the last 15 min. */}
          {sweep.my_spin_by && (() => {
            const left = new Date(sweep.my_spin_by).getTime() - now
            return (
              <p className={`text-center text-xs mt-3 ${left <= 0 ? 'text-gray-500' : left <= 15 * 60_000 ? 'text-amber-700 font-semibold' : 'text-gray-500'}`}>
                {left > 0
                  ? `⏱ Spin within ${fmtLeft(left)}, or your organiser can draw for you.`
                  : 'Your organiser can now draw for you. Spin now to do it yourself.'}
              </p>
            )
          })()}
          {sweep.auto_draw_at && (
            <p className="text-center text-[11px] text-gray-400 mt-1">
              Any ticket still unspun is drawn automatically at {fmtWhen(new Date(sweep.auto_draw_at))}.
            </p>
          )}
        </div>
      )}

      {/* What happens next, for each request still waiting — the confirmation that it went
          through, and the steps that are now the buyer's (pay, attach a receipt) or the
          organiser's (approve). Up top: on a phone the Buy card's request list is screens away. */}
      {myRequests.filter(r => r.status === 'pending').map(r => {
        const who = sweep.organiser_name ?? 'your organiser'
        const amount = r.amount != null ? fmtDollars(r.amount) : null
        const isBank = r.payment_method === 'bank_transfer'
        const receipt = !!r.receipt_attached_at
        const pd = sweep.payment_details
        const steps: { done?: boolean; body: React.ReactNode }[] = []
        if (isBank) {
          steps.push({
            done: receipt,
            body: receipt ? 'Transfer sent — receipt attached' : (
              <>
                Transfer {amount ?? 'the ticket money'} to {who}
                {pd ? (
                  <span className="block font-mono text-[11px] text-gray-700 mt-0.5">
                    {pd.account_name && <>{pd.account_name} · </>}
                    {pd.bsb && pd.account_number && <>BSB {pd.bsb} · Acc {pd.account_number}</>}
                    {pd.payid && <>{pd.bsb ? ' · ' : ''}PayID {pd.payid}</>}
                  </span>
                ) : <> using the bank details they gave you</>}
              </>
            ),
          })
          if (!receipt) steps.push({
            body: (
              <>
                Attach your receipt{' '}
                <label className="text-emerald-700 font-bold underline cursor-pointer">
                  {uploadingId === r.id ? 'Uploading…' : 'Attach receipt'}
                  <input type="file" accept="image/*,.pdf" className="hidden" disabled={uploadingId === r.id}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleReceipt(r.id, f) }} />
                </label>
              </>
            ),
          })
        } else {
          steps.push({ body: `Pay ${who}${amount ? ` ${amount}` : ''} in person` })
        }
        steps.push({
          body: isBank && sweep.approval_mode === 'auto'
            ? 'It’s approved the moment you attach the receipt — we’ll email you'
            : `${who} approves it — expected by ${fmtWhen(requestDeadline(r, sweep.approval_window_hours, sweep.race_start_at))}. We’ll email you.`,
        })
        steps.push({
          body: r.auto_draw
            ? (sweep.draw_open ? 'We draw your horse for you straight away' : `We draw your horse for you when the draw opens ${sweep.draw_opens_label}`)
            : (sweep.draw_open ? 'Come back and spin for your horse' : `Spin for your horse once the draw opens ${sweep.draw_opens_label}`),
        })
        return (
          <div key={r.id} className="border border-sky-200 bg-sky-50 rounded-2xl p-5 mb-5">
            <p className="text-sm font-bold text-sky-900">{r.id === justRequestedId ? '✅ Request sent' : '⏳ Waiting for approval'}</p>
            <p className="text-xs text-sky-800 mb-3">
              {r.tickets_requested} ticket{r.tickets_requested === 1 ? '' : 's'}{amount ? ` · ${amount}` : ''} · {METHOD_LABEL[r.payment_method].replace(' (owed)', '')}
            </p>
            <p className="text-[11px] font-bold text-sky-900 uppercase tracking-wide mb-1.5">What happens next</p>
            <ol className="space-y-1.5">
              {steps.map((st, i) => (
                <li key={i} className="flex gap-2 text-xs text-gray-700">
                  <span className={`w-5 h-5 flex-shrink-0 rounded-full text-[11px] font-bold flex items-center justify-center ${st.done ? 'bg-emerald-600 text-white' : 'bg-white border border-sky-300 text-sky-800'}`}>
                    {st.done ? '✓' : i + 1}
                  </span>
                  <span className="pt-0.5">{st.body}</span>
                </li>
              ))}
            </ol>
          </div>
        )
      })}

      {/* Your horses — straight under the wheel, in its brand greens, so the moment the
          wheel lands the result is right there (with confetti for the one just drawn). */}
      {sweep.my_horses.length > 0 && (
        <div className="rounded-2xl p-5 mb-5 text-center border border-amber-400/40"
          style={{ background: 'linear-gradient(160deg, #0a2e1c 0%, #153d26 50%, #0d3320 100%)', boxShadow: '0 8px 32px rgba(10,46,28,0.3)' }}>
          <p className="text-xs text-amber-300 font-bold uppercase tracking-widest mb-2">
            🏇 Your horse{sweep.my_horses.length === 1 ? '' : 's'}
          </p>
          <div className="space-y-1">
            {sweep.my_horses.map(h => isHidden(h) ? null : (
              <p key={h.id} className={`text-lg font-black ${h.id === justDrawnId ? 'text-amber-300' : 'text-white'}`}
                style={{ textShadow: h.id === justDrawnId ? '0 0 14px rgba(251,191,36,0.7)' : 'none' }}>
                {h.id === justDrawnId && '✨ '}#{h.number} {h.name}
                {h.scratched && <span className="text-xs text-red-300 font-normal ml-2">Scratched — not racing 😬</span>}
              </p>
            ))}
          </div>
          {sweep.draw_hidden && (
            <p className="text-xs text-emerald-200/70 mt-2">🔒 You'll see who drew every horse once the pool fills.</p>
          )}
        </div>
      )}

      {sweep.is_practice && (
        <div className="border border-violet-200 bg-violet-50 rounded-2xl p-4 mb-5">
          <p className="text-sm font-bold text-violet-900">🧪 Practice sweep — no real money</p>
          <p className="text-xs text-violet-800 mt-1">
            Everything works like a real sweep: request a ticket, {sweep.is_comp_admin ? 'approve it in Manage, ' : 'your organiser approves it, '}
            spin for your horse{sweep.is_comp_admin ? ', then run a pretend race (the button on the sweep card above) to see the results and prizes.' : ', then wait for the pretend race.'}
          </p>
        </div>
      )}

      {/* Organiser: the one urgent thing stays up top. Everything else they do lives in
          "Who's in this pool" (lock, settings, buy on someone's behalf, draw for them). */}
      {sweep.is_comp_admin && pendingCount > 0 && (
        <Link href={`/sweep-admin?comp_id=${sweep.comp_id}&tab=requests`}
          className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-2xl px-4 py-3 mb-5">
          <span className="text-sm font-bold text-amber-800">
            {pendingCount} ticket request{pendingCount === 1 ? '' : 's'} awaiting approval
          </span>
          <span className="text-xs font-bold text-amber-700 whitespace-nowrap">Review →</span>
        </Link>
      )}

      {/* Prizes as they stand right now — grows with every ticket sold, so buyers can see
          what they're playing for (and that it's this POOL's pot, not the whole sweep's). */}
      {sweep.prizes && (
        <div className="border border-amber-200 bg-amber-50 rounded-2xl p-5 mb-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-bold text-gray-900">🏆 Prizes in this pool</h2>
            <span className="text-xs text-amber-800">{fmtCents(sweep.prizes.ticket_price_cents)} a ticket</span>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            {sweep.prizes.places.map(p => (
              <div key={p.place} className="bg-white border border-amber-200 rounded-xl py-2 text-center">
                <div className="text-lg">{['🥇', '🥈', '🥉'][p.place - 1]}</div>
                <div className="text-base font-black text-gray-900">{fmtCents(p.cents)}</div>
                <div className="text-[10px] text-gray-400">{p.pct}%</div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-amber-900 mt-3">
            {sweep.prizes.tickets_sold} of {sweep.field_size || '—'} tickets sold · pot {fmtCents(sweep.prizes.pot_cents)}
            {sweep.prizes.fee_cents > 0 && ` (after ${fmtCents(sweep.prizes.fee_cents)} TribePicks fee)`}
            {!sweep.locked && sweep.field_size > sweep.prizes.tickets_sold && ' · grows with every ticket sold'}
          </p>
        </div>
      )}

      {/* Sold out — no Request button that can only fail. */}
      {!sweep.locked && sweep.tickets_left === 0 && (
        <div className="border border-gray-200 bg-gray-50 rounded-2xl p-5 mb-5 text-center">
          <h2 className="font-bold text-gray-900 mb-1">🎟️ This pool is sold out</h2>
          <p className="text-xs text-gray-500">
            Every ticket is taken or waiting on approval.
            {!openPool && !sweep.is_comp_admin && ' Ask your organiser if another pool is opening.'}
          </p>
          {openPool && (
            <button onClick={openPool.onSelect}
              className="w-full mt-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black py-3 rounded-xl">
              Buy in {openPool.name} — still selling →
            </button>
          )}
        </div>
      )}

      {!sweep.locked && sweep.tickets_left > 0 && (
        <div ref={buyCardRef} className="border border-gray-200 rounded-2xl p-5 mb-5">
          {/* Already holding (or waiting on) tickets → this card is for buying MORE. */}
          <h2 className="font-bold text-gray-900 mb-1">{hasTickets ? 'More tickets?' : 'Buy tickets'}</h2>
          <p className="text-xs text-gray-500 mb-3">
            {sweep.ticket_price_cents
              ? <>Tickets are <span className="font-bold text-gray-700">{fmtCents(sweep.ticket_price_cents)}</span> each{(() => {
                  const n = parseInt(buyCount, 10)
                  return Number.isInteger(n) && n > 1 ? <> — {n} tickets is <span className="font-bold text-gray-700">{fmtCents(n * sweep.ticket_price_cents!)}</span></> : null
                })()}. Your organiser confirms payment before you can spin.</>
              : "Your organiser confirms payment before you can spin — pick how you're paying."}
            {!sweep.draw_open && <> Buy now to secure your spot — the draw opens {sweep.draw_opens_label}, once the final field is declared.</>}
          </p>
          {/* How they're paying gets its own row; the ticket count sits beside the Request button,
              since the count is what the button's label and price follow. */}
          <div className="mb-2">
            <select value={buyMethod} onChange={e => setBuyMethod(e.target.value as any)} aria-label="How you're paying"
              className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm">
              <option value="cash">Cash — pay your organiser in person</option>
              {/* Only methods the organiser has switched on. No bank details on file → nowhere to
                  tell the buyer to send money, so no transfer option at all. */}
              {sweep.payment_details && <option value="bank_transfer">Bank transfer — attach a receipt</option>}
              {sweep.bank_shared_directly && <option value="bank_transfer">Bank transfer — details from {sweep.organiser_name ?? 'your organiser'}</option>}
              {sweep.allow_iou && <option value="iou">IOU — pay your organiser later</option>}
            </select>
          </div>
          <label className="flex items-start gap-2 text-xs text-gray-600 mb-3 cursor-pointer">
            <input type="checkbox" checked={autoDraw} onChange={e => setAutoDraw(e.target.checked)} className="mt-0.5" />
            <span>
              Draw my horse for me once I&apos;m approved — skip the wheel.
              {!sweep.draw_open && <span className="text-gray-400"> We&apos;ll draw it when the draw opens {sweep.draw_opens_label}.</span>}
            </span>
          </label>
          {/* − 1 + stepper and the main action on one line. min-w-0 on the button: a long label
              must shrink it, never push the row wider than the card (it once ran off-screen). */}
          {(() => {
            const n = parseInt(buyCount, 10)
            const count = Number.isInteger(n) && n > 0 ? n : 1
            const max = Math.max(1, sweep.tickets_left)
            const step = (d: number) => setBuyCount(String(Math.min(max, Math.max(1, count + d))))
            return (
              <div className="flex gap-2 items-stretch mb-3">
                <div className="flex items-center border border-gray-300 rounded-xl flex-shrink-0">
                  <button type="button" onClick={() => step(-1)} disabled={count <= 1} aria-label="One fewer ticket"
                    className="w-9 h-full text-lg font-bold text-gray-600 disabled:text-gray-300">−</button>
                  <span className="w-7 text-center text-sm font-bold text-gray-900" aria-live="polite">{count}</span>
                  <button type="button" onClick={() => step(1)} disabled={count >= max} aria-label="One more ticket"
                    className="w-9 h-full text-lg font-bold text-gray-600 disabled:text-gray-300">+</button>
                </div>
                <button onClick={handleBuy} disabled={buying}
                  className="flex-1 min-w-0 truncate bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm sm:text-base font-black py-3 px-3 rounded-xl shadow-md">
                  {buying ? 'Requesting…' : `🎟️ Request ${count} ticket${count === 1 ? '' : 's'}${sweep.ticket_price_cents ? ` · ${fmtCents(count * sweep.ticket_price_cents)}` : ''} →`}
                </button>
              </div>
            )
          })()}
          {sweep.is_comp_admin && !sweep.is_member && (
            <p className="-mt-1 mb-3 text-xs text-gray-500">You&apos;re not in this pool yet — requesting a ticket adds you to it.</p>
          )}
          {buyError && (
            <p role="alert" className="-mt-1 mb-3 text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{buyError}</p>
          )}

          {/* What happens next, for the method picked — set expectations BEFORE they request. */}
          {(() => {
            const who = sweep.organiser_name ?? 'your organiser'
            const windowText = `within about ${sweep.approval_window_hours} hours`
            if (buyMethod === 'iou') {
              return <p className="text-xs text-gray-500 mb-3">Tickets are added straight away — pay {who} later.</p>
            }
            if (buyMethod === 'bank_transfer' && sweep.payment_details) {
              const pd = sweep.payment_details
              return (
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 mb-3 text-xs">
                  <p className="font-semibold text-gray-700 mb-1">Transfer to</p>
                  {pd.account_name && <p className="text-gray-900">{pd.account_name}</p>}
                  {pd.bsb && pd.account_number && <p className="text-gray-900 font-mono">BSB {pd.bsb} · Acc {pd.account_number}</p>}
                  {pd.payid && (
                    <p className="text-gray-900">
                      PayID ({({ mobile: 'mobile', email: 'email', abn: 'ABN' } as const)[payIdKind(pd.payid) ?? 'mobile']}):{' '}
                      <span className="font-mono">{pd.payid}</span>
                    </p>
                  )}
                  <p className="text-gray-500 mt-1.5">
                    Then attach your receipt to the request below.{' '}
                    {sweep.approval_mode === 'auto'
                      ? "It's approved the moment you attach it."
                      : `${who} will check it ${windowText} — we'll email you as soon as they approve, then come back and spin.`}
                  </p>
                </div>
              )
            }
            if (buyMethod === 'bank_transfer' && sweep.bank_shared_directly) {
              const c = sweep.organiser_contact
              return (
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 mb-3 text-xs">
                  <p className="font-semibold text-gray-700 mb-1">Get the bank details from {who}</p>
                  <p className="text-gray-600">
                    {who} shares their bank details / PayID directly — check your group chat or messages
                    {c ? <>, or ask them:{' '}
                      {c.phone && <a href={`tel:${c.phone}`} className="underline font-semibold">{c.phone}</a>}
                      {c.phone && c.email && ' · '}
                      {c.email && <a href={`mailto:${c.email}`} className="underline font-semibold">{c.email}</a>}
                    </> : '.'}
                  </p>
                  <p className="text-gray-500 mt-1.5">
                    Then attach your receipt to the request below.{' '}
                    {sweep.approval_mode === 'auto'
                      ? "It's approved the moment you attach it."
                      : `${who} will check it ${windowText} — we'll email you as soon as they approve, then come back and spin.`}
                  </p>
                  {/* Details passed around a chat are easier to fake than ones shown here. */}
                  <p className="mt-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-2.5 py-1.5">
                    ⚠️ Only pay into details that came from {who} themselves. If anyone else sends you
                    bank details, or they change, check with {who} before you pay. TribePicks never asks you to pay us.
                  </p>
                </div>
              )
            }
            return (
              <p className="text-xs text-gray-500 mb-3">
                Pay {who} in person. We'll email you the moment they approve ({windowText}) — then come back and spin.
              </p>
            )
          })()}

          {myRequests.length > 0 && (
            <div className="space-y-2.5 border-t border-gray-100 pt-3">
              {myRequests.map(r => {
                const deadline = requestDeadline(r, sweep.approval_window_hours, sweep.race_start_at)
                const overdue = r.status === 'pending' && deadline.getTime() < Date.now()
                const remindedRecently = !!r.last_reminded_at &&
                  new Date(r.last_reminded_at).getTime() + sweep.approval_window_hours * 3600_000 > Date.now()
                // A bank transfer with no receipt yet is waiting on the BUYER, not the organiser.
                const awaitingReceipt = r.payment_method === 'bank_transfer' && !r.receipt_url
                return (
                <div key={r.id} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-600">
                      {r.tickets_requested} ticket{r.tickets_requested === 1 ? '' : 's'} · {r.payment_method.replace('_', ' ')} ·{' '}
                      <span className={r.status === 'approved' ? 'text-emerald-600 font-semibold' : r.status === 'rejected' ? 'text-red-500' : r.status === 'cancelled' ? 'text-gray-400' : 'text-amber-600'}>
                        {r.status}
                      </span>
                    </span>
                    {r.payment_method === 'bank_transfer' && r.status === 'pending' && !r.receipt_url && (
                      <label className="text-emerald-600 font-bold cursor-pointer whitespace-nowrap">
                        {uploadingId === r.id ? 'Uploading…' : 'Attach receipt'}
                        <input type="file" accept="image/*,.pdf" className="hidden" disabled={uploadingId === r.id}
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleReceipt(r.id, f) }} />
                      </label>
                    )}
                    {r.payment_method === 'bank_transfer' && r.receipt_url && (
                      <a href={r.receipt_url} target="_blank" rel="noreferrer" className="text-gray-400 underline whitespace-nowrap">Receipt</a>
                    )}
                  </div>

                  {/* Cancel while pending and nothing's been transferred. With a receipt attached the
                      money has moved, so that's the organiser's to sort out. */}
                  {r.status === 'pending' && !r.receipt_attached_at && (
                    confirmCancelId === r.id ? (
                      <div className="mt-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2">
                        <p className="text-gray-700">
                          Cancel this request for {r.tickets_requested} ticket{r.tickets_requested === 1 ? '' : 's'}?
                          {r.payment_method === 'cash' && ` Only cancel if you haven't paid ${sweep.organiser_name ?? 'your organiser'} yet.`}
                        </p>
                        <span className="flex gap-3 mt-1.5">
                          <button onClick={() => handleCancelRequest(r.id)} className="font-bold text-red-600">Yes, cancel it</button>
                          <button onClick={() => setConfirmCancelId(null)} className="font-semibold text-gray-500">Keep it</button>
                        </span>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmCancelId(r.id)} disabled={cancellingId === r.id}
                        className="mt-0.5 text-gray-400 hover:text-red-600 underline disabled:opacity-50">
                        {cancellingId === r.id ? 'Cancelling…' : 'Cancel request'}
                      </button>
                    )
                  )}
                  {r.status === 'pending' && r.receipt_attached_at && (
                    <p className="text-gray-400 mt-0.5">Already paid? To cancel, ask {sweep.organiser_name ?? 'your organiser'} to sort it out.</p>
                  )}

                  {r.status === 'rejected' && r.notes && (
                    <p className="text-red-500 mt-0.5">Note from your organiser: {r.notes}</p>
                  )}

                  {r.status === 'pending' && awaitingReceipt && (
                    <p className="text-amber-600 mt-0.5">Attach your transfer receipt so {sweep.organiser_name ?? 'your organiser'} can approve it.</p>
                  )}

                  {r.status === 'pending' && !awaitingReceipt && !overdue && (
                    <p className="text-gray-400 mt-0.5">Expected by {fmtWhen(deadline)} — we'll email you when it's approved.</p>
                  )}

                  {r.status === 'pending' && !awaitingReceipt && overdue && (
                    <div className="mt-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                      <p className="text-amber-800 font-semibold">Still waiting? It was expected by {fmtWhen(deadline)}.</p>
                      {sweep.organiser_contact && (
                        <p className="text-amber-800 mt-0.5">
                          Contact {sweep.organiser_name ?? 'your organiser'}:{' '}
                          {sweep.organiser_contact.phone && <a href={`tel:${sweep.organiser_contact.phone}`} className="underline font-semibold">{sweep.organiser_contact.phone}</a>}
                          {sweep.organiser_contact.phone && sweep.organiser_contact.email && ' · '}
                          {sweep.organiser_contact.email && <a href={`mailto:${sweep.organiser_contact.email}`} className="underline font-semibold">{sweep.organiser_contact.email}</a>}
                        </p>
                      )}
                      <button onClick={() => handleRemind(r.id)} disabled={remindingId === r.id || remindedRecently}
                        className="mt-1.5 text-[11px] font-bold text-amber-800 border border-amber-300 hover:bg-amber-100 disabled:opacity-60 px-2.5 py-1 rounded-lg">
                        {remindedRecently ? '✓ Reminder sent' : remindingId === r.id ? 'Sending…' : 'Remind organiser'}
                      </button>
                    </div>
                  )}
                </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {sweep.my_over_field > 0 && (
        <div className="border border-red-200 bg-red-50 rounded-2xl p-4 mb-5 text-center">
          <p className="text-sm font-bold text-red-800">
            {sweep.my_over_field} of your tickets {sweep.my_over_field === 1 ? 'has' : 'have'} no horse
          </p>
          <p className="text-xs text-red-700 mt-1">
            The final field is smaller than the tickets sold in this pool, and {sweep.my_over_field === 1 ? 'yours was' : 'yours were'} among the last sold — {sweep.organiser_name ?? 'your organiser'} will refund {sweep.my_over_field === 1 ? 'it' : 'them'}.
          </p>
        </div>
      )}

      {/* Tickets waiting to spin are shown at the very top (below); this is only the "no
          tickets yet" nudge, which points up at the Buy tickets card. */}
      {sweep.my_unclaimed === 0 && sweep.my_horses.length === 0 && (
        <div className="border border-gray-200 rounded-2xl p-5 mb-5 text-center">
          <p className="text-sm text-gray-700">You're in the pool, but no picks yet.</p>
          <p className="text-xs text-gray-400 mt-1">Buy tickets above, or pay your organiser in person and they can add them for you.</p>
        </div>
      )}

      {sweep.my_horses.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 mb-5 text-center">
          <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wide mb-2">
            Your horse{sweep.my_horses.length === 1 ? '' : 's'}
          </p>
          <div className="space-y-1">
            {sweep.my_horses.map(h => isHidden(h) ? null : (
              <p key={h.id} className="text-lg font-black text-gray-900">
                #{h.number} {h.name}{h.scratched && <span className="text-xs text-red-500 font-normal ml-2">Scratched — not racing 😬</span>}
              </p>
            ))}
          </div>
          {sweep.draw_hidden && (
            <p className="text-xs text-emerald-700 mt-2">🔒 You'll see who drew every horse once the pool fills.</p>
          )}
        </div>
      )}

      {/* Sweeps are free this Cup — a gentle donation nudge once you're holding a ticket.
          Never touches the draw. */}
      {!sweep.is_practice && (sweep.my_horses.length > 0 || sweep.my_unclaimed > 0) && !raceRun && (
        <FeedLuckNudge className="mb-5" source="sweep_ticket"
          message="Feed our hungry doggies for luck on your horse 🐾"
          luckyMessage={name => `🍀 ${name}’s cheering your horse home!`} />
      )}

      {raceRun && (
        <div className="border border-gray-200 rounded-2xl p-5 mb-5">
          <h2 className="font-bold text-gray-900 mb-3">🏆 Winners in this pool</h2>
          {sweep.podium.length === 0 && <p className="text-sm text-gray-500">No horse in this pool finished the race.</p>}
          {sweep.podium.map(p => (
            <div key={p.horse?.id ?? p.places.join()} className="flex items-start justify-between gap-3 py-1.5 text-sm">
              <span className="min-w-0">
                <span className="block font-semibold text-gray-900">
                  {prizeLabel(p.places)} — {p.winner?.display_name ?? 'A member'}
                </span>
                <span className="block text-xs text-gray-500">
                  #{p.horse?.number} {p.horse?.name} · {finishedLabel(p.finished)}
                </span>
              </span>
              {p.cents != null && <span className="text-amber-700 font-bold whitespace-nowrap">{fmtCents(p.cents)}</span>}
            </div>
          ))}
          <p className="text-[11px] text-gray-400 mt-2">
            Prizes go to the best-finishing horses held in this pool — if nobody holds a placegetter, its prize rolls down to the next horse home that somebody does.
          </p>
        </div>
      )}

      <div className="border border-gray-200 rounded-2xl p-5">
        {/* "Full pool" read as "this pool is full" — the heading is just who's in it; the
            pool's status lives in its own pills. */}
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h2 className="font-bold text-gray-900">Who&apos;s in this pool</h2>
          <div className="flex gap-1.5 flex-wrap">
            {sweep.locked ? (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">🔒 Locked</span>
            ) : sweep.tickets_left === 0 ? (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Sold out</span>
            ) : (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                {sweep.tickets_left} ticket{sweep.tickets_left === 1 ? '' : 's'} left
              </span>
            )}
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${sweep.draw_hidden ? 'bg-gray-100 text-gray-500' : 'bg-violet-100 text-violet-700'}`}>
              {!sweep.draw_open ? 'Draw opens soon' : sweep.draw_hidden ? 'Draw hidden' : 'Draw revealed'}
            </span>
          </div>
        </div>
        {sweep.is_comp_admin && (
          <div className="flex items-center justify-between gap-3 flex-wrap bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 mb-3">
            <p className="text-xs text-gray-500">Paid you in person? Tick them to buy their tickets.</p>
            <div className="flex items-center gap-3">
              {!sweep.locked ? (
                <button onClick={handleLock} disabled={locking}
                  className="text-xs font-bold text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50 px-2.5 py-1 rounded-lg">
                  {locking ? 'Locking…' : 'Stop new joins'}
                </button>
              ) : (
                <button onClick={handleUnlock} disabled={locking} title="No new members can join this pool — click to reopen"
                  className="text-xs font-bold text-gray-500 border border-gray-200 hover:bg-gray-100 disabled:opacity-50 px-2.5 py-1 rounded-lg">
                  {locking ? 'Reopening…' : 'Reopen joins'}
                </button>
              )}
              <Link href={`/sweep-admin?comp_id=${sweep.comp_id}`} className="text-xs font-bold text-emerald-600 hover:underline whitespace-nowrap">Settings →</Link>
            </div>
          </div>
        )}
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 mb-3 text-xs font-bold">
          {(['person', 'horse'] as const).map(v => (
            <button key={v} onClick={() => setRosterView(v)}
              className={`px-3 py-1 rounded-md ${rosterView === v ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'}`}>
              {v === 'person' ? 'By person' : 'By horse'}
            </button>
          ))}
        </div>
        {sweep.draw_hidden && (
          <p className="text-xs text-gray-400 mb-3">
            You can see your own horses — who drew the rest stays hidden until every horse is drawn (or the pool locks before the race), then the full draw opens up here.
          </p>
        )}
        {rosterView === 'horse' ? (() => {
          // The sweep sheet. Before the reveal it marks only YOUR horses — flagging the others
          // as taken or free would give the draw away (it's why the wheel shows no numbers).
          if (!sweep.horses.length) {
            return <p className="text-sm text-gray-400 text-center py-4">The field is listed here once the draw opens ({sweep.draw_opens_label}).</p>
          }
          const mine = new Set(sweep.my_horses.filter(h => !isHidden(h)).map(h => (h as Horse).id))
          const holder = new Map<string, string>()
          for (const r of sweep.roster) for (const h of r.horses) if (!isHidden(h)) holder.set(h.id, r.display_name)
          const finish = sweep.finish_by_horse
          const prize = new Map(sweep.podium.filter(p => p.horse).map(p => [p.horse!.id, p]))
          // After the race: finishing order (non-finishers, then scratchings, last). Before: by number.
          const rank = (h: Horse) => h.scratched ? 1e6 : finish ? (finish[h.id] ?? 1e5) : h.number
          const list = [...sweep.horses].sort((a, b) => rank(a) - rank(b) || a.number - b.number)
          return (
            <div>
              {list.map((h, i) => {
                const pos = finish && !h.scratched ? finish[h.id] : undefined
                const won = prize.get(h.id)
                const details = horseDetails(h)
                return (
                  // Banded rows for scanning a 24-runner sheet; your own horses stay green on top.
                  // gray-50 vanished: the card has no fill, so it sits on the gray-50 page.
                  <div key={h.id} className={`flex items-start justify-between gap-3 py-2 px-2 -mx-2 rounded-lg text-sm ${
                    mine.has(h.id) ? 'bg-emerald-50 ring-1 ring-emerald-200' : i % 2 ? '' : 'bg-gray-200/60'}`}>
                    <span className="flex items-start gap-2 min-w-0">
                      {finish && (
                        <span className="w-9 flex-shrink-0 text-xs font-bold text-gray-500 pt-0.5">
                          {h.scratched ? '' : pos == null ? 'DNF' : ordinal(pos)}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className={`block ${h.scratched ? 'line-through text-red-400' : 'font-semibold text-gray-900'}`}>#{h.number} {h.name}</span>
                        {h.scratched
                          ? <span className="block text-[11px] text-red-400">Scratched</span>
                          : details && <span className="block text-[11px] text-gray-400">{details}</span>}
                      </span>
                    </span>
                    <span className="text-right flex-shrink-0">
                      {mine.has(h.id)
                        ? <span className="block font-bold text-emerald-700">You</span>
                        : !sweep.draw_hidden && !h.scratched && (
                            holder.has(h.id)
                              ? <span className="block text-gray-700">{holder.get(h.id)}</span>
                              : <span className="block text-gray-300 italic">unsold</span>
                          )}
                      {won && (
                        <span className="block text-xs font-bold text-amber-700">
                          {prizeLabel(won.places)}{won.cents != null ? ` · ${fmtCents(won.cents)}` : ''}
                        </span>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          )
        })() : sweep.roster.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No horses drawn in this pool yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {sweep.roster.map(r => (
              <div key={r.user_id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="flex items-start gap-2 min-w-0">
                  {/* Organiser: tick members to buy tickets for them. Not yourself — you've
                      got the Buy card above. */}
                  {sweep.is_comp_admin && (r.user_id !== session?.user?.id ? (
                    <input type="checkbox" checked={picked.has(r.user_id)} aria-label={`Buy for ${r.display_name}`}
                      onChange={e => setPicked(prev => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(r.user_id); else next.delete(r.user_id)
                        return next
                      })}
                      className="mt-1 w-4 h-4 accent-emerald-600 flex-shrink-0" />
                  ) : <span className="w-4 flex-shrink-0" />)}
                  <span className="min-w-0">
                    <span className="block text-gray-700">{r.display_name}</span>
                    {/* Organiser only: money in, and IOUs still owed. */}
                    {sweep.is_comp_admin && ((r.paid ?? 0) > 0 || (r.owed ?? 0) > 0) && (
                      <span className="block text-[11px] text-gray-400">
                        {(r.paid ?? 0) > 0 && `${fmtDollars(r.paid!)} paid`}
                        {(r.paid ?? 0) > 0 && (r.owed ?? 0) > 0 && ' · '}
                        {(r.owed ?? 0) > 0 && <span className="text-amber-700 font-semibold">{fmtDollars(r.owed!)} IOU owed</span>}
                      </span>
                    )}
                  </span>
                </span>
                <span className="text-right">
                  {r.horses.length === 0 && r.unclaimed === 0 && <span className="text-gray-300">—</span>}
                  {r.horses.map(h => <span key={h.id}>{renderHorse(h)}</span>)}
                  {r.unclaimed > 0 && (
                    <span className="block text-gray-500">
                      🎟️ {r.unclaimed} {sweep.draw_open ? 'to spin' : `ticket${r.unclaimed === 1 ? '' : 's'} · waiting for the draw`}
                    </span>
                  )}
                  {/* Organiser: draw for someone not spinning — random horse, emailed to them.
                      Not for your own tickets: you've got the wheel above. */}
                  {sweep.is_comp_admin && sweep.draw_open && r.unclaimed > 0 && r.user_id !== session?.user?.id && (
                    r.draw_unlocks_at && new Date(r.draw_unlocks_at).getTime() > now ? (
                      <span className="block mt-1 text-xs text-gray-400" title="Everyone gets 2 hours to spin for themselves first">
                        Draw in {fmtLeft(new Date(r.draw_unlocks_at).getTime() - now)}
                      </span>
                    ) : confirmDrawFor === r.user_id ? (
                      <span className="inline-flex gap-2 mt-1 text-xs">
                        <button onClick={() => drawFor(r.user_id)} className="font-bold text-white bg-amber-600 hover:bg-amber-700 px-2 py-0.5 rounded-lg">Yes, draw</button>
                        <button onClick={() => setConfirmDrawFor(null)} className="font-semibold text-gray-500">Cancel</button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmDrawFor(r.user_id)} disabled={drawingFor === r.user_id}
                        className="mt-1 text-xs font-bold text-amber-800 border border-amber-300 hover:bg-amber-50 disabled:opacity-50 px-2 py-0.5 rounded-lg">
                        {drawingFor === r.user_id ? 'Drawing…' : '🎲 Draw for them'}
                      </button>
                    )
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {sweep.is_comp_admin && picked.size > 0 && (
          <button onClick={openBasket}
            className="w-full mt-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold py-2.5 rounded-xl">
            🎟️ Buy on behalf of {picked.size} →
          </button>
        )}

      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {/* Buy on their behalf: tickets and how each person paid you. Recorded as approved
          purchases (sweep/buy-on-behalf) — the ticket limit is re-checked on the server. */}
      {basket && (() => {
        const rows = Object.entries(basket)
        const total = rows.reduce((n, [, b]) => n + (parseInt(b.tickets, 10) || 0), 0)
        const price = sweep.ticket_price_cents
        const over = total > sweep.tickets_left
        const nameOf = (id: string) => sweep.roster.find(r => r.user_id === id)?.display_name ?? 'Member'
        return (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={() => { if (!buyingFor) { setBasket(null); setBasketError(null) } }}>
            <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
              <h3 className="font-bold text-gray-900 mb-1">Buy on their behalf</h3>
              <p className="text-xs text-gray-500 mb-4">For people who paid you in person. They&apos;re emailed their tickets and spin for their own horse.</p>
              <div className="space-y-3 mb-4">
                {rows.map(([id, b]) => (
                  <div key={id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 min-w-0 truncate text-gray-800">{nameOf(id)}</span>
                    <input type="number" min="1" value={b.tickets} aria-label={`Tickets for ${nameOf(id)}`}
                      onChange={e => setBasket(prev => prev && { ...prev, [id]: { ...prev[id], tickets: e.target.value } })}
                      className="w-14 border border-gray-300 rounded-lg px-2 py-1.5 text-center" />
                    <select value={b.method} aria-label={`How ${nameOf(id)} paid`}
                      onChange={e => setBasket(prev => prev && { ...prev, [id]: { ...prev[id], method: e.target.value as any } })}
                      className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs">
                      {(Object.keys(METHOD_LABEL) as (keyof typeof METHOD_LABEL)[]).map(m => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
                    </select>
                    {price != null && (
                      <span className="w-12 text-right text-xs text-gray-500">{fmtCents(price * (parseInt(b.tickets, 10) || 0))}</span>
                    )}
                  </div>
                ))}
              </div>
              {basketError && (
                <p role="alert" className="mb-3 text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{basketError}</p>
              )}
              <p className={`text-xs mb-4 ${over ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                {total} ticket{total === 1 ? '' : 's'}{price != null ? ` · ${fmtCents(price * total)}` : ''} · {sweep.tickets_left} left in this pool
                {over && ' — that’s too many'}
              </p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setBasket(null); setBasketError(null) }} disabled={buyingFor} className="text-sm font-semibold text-gray-500 px-3 py-2">Cancel</button>
                <button onClick={handleBuyOnBehalf} disabled={buyingFor || over || total < 1}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-xl">
                  {buyingFor ? 'Buying…' : `Confirm${price != null ? ` ${fmtCents(price * total)}` : ''}`}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      <p className="mt-4 text-center text-xs">
        <Link href="/rules/melbourne-cup-2026" className="text-gray-400 hover:text-gray-600 underline">How the sweep works · rules</Link>
      </p>

      {/* Phones: a slim "get a ticket" bar above the bottom menu while the Buy card is off
          screen — only for members with no tickets and nothing pending, so it never nags. */}
      {showBuyBar && (
        <div className="sm:hidden fixed inset-x-0 z-40 px-4 bottom-[calc(3.6rem_+_env(safe-area-inset-bottom))]">
          <button onClick={() => buyCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black py-3 rounded-xl shadow-lg">
            🎟️ Get a ticket{sweep.ticket_price_cents ? ` · ${fmtCents(sweep.ticket_price_cents)}` : ''} →
          </button>
        </div>
      )}
    </>
  )
}
