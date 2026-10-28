'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Spinner } from '@/components/ui'
import { SweepWheel } from '@/components/game/SweepWheel'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { payIdKind } from '@/lib/sweep/organiser'

type Horse = { id: string; number: number; name: string; scratched: boolean; finish_position: number | null }
type HiddenHorse = { id: string; hidden: true }
type HorseOrHidden = Horse | HiddenHorse
const isHidden = (h: HorseOrHidden): h is HiddenHorse => (h as any)?.hidden === true

type RosterRow = {
  user_id: string; display_name: string; avatar_url: string | null
  horses: HorseOrHidden[]; unclaimed: number; total_tickets: number
}
type SweepState = {
  comp_id: string
  locked: boolean
  is_comp_admin: boolean
  allow_iou: boolean
  approval_mode: 'manual' | 'auto'
  draw_full: boolean
  draw_hidden: boolean   // other members' horses are redacted until the pool closes
  horses: Horse[]
  available: Horse[]
  roster: RosterRow[]
  my_horses: HorseOrHidden[]
  my_unclaimed: number
  podium: { place: number; horse: Horse | null; winner: RosterRow | null }[]
  organiser_name: string | null
  approval_window_hours: number
  race_start_at: string | null
  payment_details: { account_name: string | null; bsb: string | null; account_number: string | null; payid: string | null } | null
  organiser_contact: { phone: string | null; email: string | null } | null   // only once a request of yours is overdue
}
type MyRequest = {
  id: string; tickets_requested: number; payment_method: 'cash' | 'bank_transfer' | 'iou'
  status: 'pending' | 'approved' | 'rejected'; amount: number | null; receipt_url: string | null
  created_at: string; notes: string | null; last_reminded_at: string | null; receipt_attached_at: string | null
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
const fmtWhen = (d: Date) => d.toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

// The per-tribe sweep draw — shared by the standalone /sweep page and the tribe page's
// "Draw" tab (a sweep tribe IS a pool, so this is that pool's core content either way).
// A member can hold several tickets; the wheel is available any time they hold an
// unclaimed one, regardless of whether the pool is locked for NEW joins/requests — locking
// stops new commitments, it doesn't un-grant tickets already handed out.
export function SweepPoolPanel({ tribeId }: { tribeId: string }) {
  const { session } = useSupabase()
  const [sweep, setSweep]     = useState<SweepState | null>(null)
  const [loading, setLoading] = useState(true)
  const [locking, setLocking] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [grantTarget, setGrantTarget] = useState('')
  const [grantCount,  setGrantCount]  = useState('1')
  const [granting,    setGranting]    = useState(false)

  const [myRequests, setMyRequests] = useState<MyRequest[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [buyCount,  setBuyCount]  = useState('1')
  const [buyMethod, setBuyMethod] = useState<'cash' | 'bank_transfer' | 'iou'>('cash')
  const [buying,    setBuying]    = useState(false)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [remindingId, setRemindingId] = useState<string | null>(null)

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

  async function handleGrant() {
    if (!grantTarget || !grantCount) return
    setGranting(true); setError(null)
    const res = await fetch(`/api/tribes/${tribeId}/sweep/grant-tickets`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: grantTarget, count: parseInt(grantCount, 10) || 1 }),
    }).then(r => r.json())
    setGranting(false)
    if (res.error) { setError(res.error); return }
    setGrantCount('1')
    await load()
  }

  // The server draws the horse (uniform random from what's left) — we never send one.
  async function handleDraw() {
    const res = await fetch(`/api/tribes/${tribeId}/sweep/pick`, { method: 'POST' }).then(r => r.json())
    if (res.error) return { ok: false, error: res.error }
    await load()   // refresh so ticket counts / draw list / available horses stay in sync
    return { ok: true, horse: res.horse as Horse }
  }

  async function handleBuy() {
    const count = parseInt(buyCount, 10) || 1
    setBuying(true); setError(null)
    const res = await fetch(`/api/tribes/${tribeId}/sweep/requests`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickets_requested: count, payment_method: buyMethod }),
    }).then(r => r.json())
    setBuying(false)
    if (res.error) { setError(res.error); return }
    setBuyCount('1')
    await load()
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

  return (
    <>
      {sweep.is_comp_admin && (
        <div className="border border-gray-200 rounded-2xl p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-900">Organiser</h2>
            <div className="flex items-center gap-3">
              {!sweep.locked ? (
                <button onClick={handleLock} disabled={locking}
                  className="text-xs font-bold text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50 px-3 py-1.5 rounded-lg">
                  {locking ? 'Locking…' : 'Stop new joins'}
                </button>
              ) : (
                <button onClick={handleUnlock} disabled={locking} title="No new members can join this pool — click to reopen"
                  className="text-xs font-bold text-gray-500 border border-gray-200 hover:bg-gray-50 disabled:opacity-50 px-3 py-1.5 rounded-lg">
                  {locking ? 'Reopening…' : '🔒 Locked — reopen joins'}
                </button>
              )}
              <Link href={`/sweep-admin?comp_id=${sweep.comp_id}`} className="text-xs font-bold text-emerald-600 hover:underline whitespace-nowrap">Organiser settings →</Link>
            </div>
          </div>
          {pendingCount > 0 && (
            <Link href={`/sweep-admin?comp_id=${sweep.comp_id}&tab=requests`}
              className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-xl px-4 py-3 mb-3">
              <span className="text-sm font-bold text-amber-800">
                {pendingCount} ticket request{pendingCount === 1 ? '' : 's'} awaiting approval
              </span>
              <span className="text-xs font-bold text-amber-700 whitespace-nowrap">Review →</span>
            </Link>
          )}
          <p className="text-xs text-gray-500 mb-3">Grant picks once someone's paid — each pick is one spin of the wheel.</p>
          <div className="flex gap-2 items-center">
            <select value={grantTarget} onChange={e => setGrantTarget(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-sm">
              <option value="">Choose a member…</option>
              {sweep.roster.map(r => (
                <option key={r.user_id} value={r.user_id}>{r.display_name} ({r.total_tickets} tickets)</option>
              ))}
            </select>
            <input type="number" min="1" value={grantCount} onChange={e => setGrantCount(e.target.value)}
              className="w-16 border border-gray-300 rounded-lg px-2 py-2 text-sm text-center" />
            <button onClick={handleGrant} disabled={granting || !grantTarget}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-lg whitespace-nowrap">
              {granting ? 'Granting…' : 'Grant picks'}
            </button>
          </div>
        </div>
      )}

      {!sweep.locked && (
        <div className="border border-gray-200 rounded-2xl p-5 mb-5">
          <h2 className="font-bold text-gray-900 mb-1">Buy tickets</h2>
          <p className="text-xs text-gray-500 mb-3">Your organiser confirms payment before you can spin — pick how you're paying.</p>
          <div className="flex gap-2 items-center mb-3">
            <input type="number" min="1" value={buyCount} onChange={e => setBuyCount(e.target.value)}
              className="w-16 border border-gray-300 rounded-lg px-2 py-2 text-sm text-center" />
            <select value={buyMethod} onChange={e => setBuyMethod(e.target.value as any)}
              className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-sm">
              <option value="cash">Cash — pay your organiser in person</option>
              {/* Only methods the organiser has switched on. No bank details on file → nowhere to
                  tell the buyer to send money, so no transfer option at all. */}
              {sweep.payment_details && <option value="bank_transfer">Bank transfer — attach a receipt</option>}
              {sweep.allow_iou && <option value="iou">IOU — pay your organiser later</option>}
            </select>
            <button onClick={handleBuy} disabled={buying}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-lg whitespace-nowrap">
              {buying ? 'Requesting…' : 'Request →'}
            </button>
          </div>

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
                      <span className={r.status === 'approved' ? 'text-emerald-600 font-semibold' : r.status === 'rejected' ? 'text-red-500' : 'text-amber-600'}>
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

      {sweep.my_unclaimed > 0 ? (
        <div className="mb-5">
          <p className="text-center text-xs text-gray-500 mb-2">
            {sweep.my_unclaimed} pick{sweep.my_unclaimed === 1 ? '' : 's'} left to spin for
          </p>
          {/* Scratched horses can't be drawn (the server skips them), so keep them off the wheel. */}
          <SweepWheel key={sweep.my_unclaimed} horses={sweep.available.filter(h => !h.scratched)} onDraw={handleDraw} />
        </div>
      ) : sweep.my_horses.length === 0 ? (
        <div className="border border-gray-200 rounded-2xl p-5 mb-5 text-center">
          <p className="text-sm text-gray-700">You're in the pool, but no picks yet.</p>
          <p className="text-xs text-gray-400 mt-1">Buy tickets above, or ask your organiser to grant some once you've paid.</p>
        </div>
      ) : null}

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

      {sweep.podium.some(p => p.horse) && (
        <div className="border border-gray-200 rounded-2xl p-5 mb-5">
          <h2 className="font-bold text-gray-900 mb-3">🏆 Podium</h2>
          {sweep.podium.map(p => (
            <p key={p.place} className="text-sm text-gray-700 mb-1">
              {p.place === 1 ? '🥇' : p.place === 2 ? '🥈' : '🥉'}{' '}
              {p.horse ? `#${p.horse.number} ${p.horse.name}` : 'Result not in yet'}
              {p.winner ? <> — <strong>{p.winner.display_name}</strong></> : p.horse ? ' (nobody in this pool)' : ''}
            </p>
          ))}
        </div>
      )}

      <div className="border border-gray-200 rounded-2xl p-5">
        <h2 className="font-bold text-gray-900 mb-3">Full pool</h2>
        {sweep.draw_hidden && (
          <p className="text-xs text-gray-400 mb-3">
            You can see your own horses — who drew the rest stays hidden until every horse is drawn (or the pool locks before the race), then the full draw opens up here.
          </p>
        )}
        {sweep.roster.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No horses drawn in this pool yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {sweep.roster.map(r => (
              <div key={r.user_id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="text-gray-700 flex-shrink-0">{r.display_name}</span>
                <span className="text-right">
                  {r.horses.length === 0 && r.unclaimed === 0 && <span className="text-gray-300">—</span>}
                  {r.horses.map(h => <span key={h.id}>{renderHorse(h)}</span>)}
                  {r.unclaimed > 0 && <span className="block text-gray-400 italic">{r.unclaimed} still picking…</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </>
  )
}
