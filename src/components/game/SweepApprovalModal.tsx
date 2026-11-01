'use client'

import { useEffect, useRef, useState } from 'react'

// Sweep-admin's "requests waiting for you" pop-up: one pending ticket request at a time, with
// Approve / Reject / Later. Approving grants the tickets AND records them as paid (the API sets
// paid_at), so the copy says so — approve only once the money's in.
// Both switches are per-device conveniences (localStorage): the pop-up defaults on; Vicky's
// "new request" call defaults off, and only ever plays for a request that arrives while the
// page is open — never for the backlog on load.

export type PendingRequest = {
  id: string; tribe_id: string; tickets_requested: number; payment_method: string
  amount: number | null; receipt_url: string | null
  buyer: { display_name: string } | null
}

const POPUP_KEY = 'sweep-admin:approval-popup'
const SOUND_KEY = 'sweep-admin:approval-sound'
export const REQUEST_CALL_CLIP = '/race-calls/organiser/new-request.mp3'

function readFlag(key: string, fallback: boolean): boolean {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v === '1' } catch { return fallback }
}
function writeFlag(key: string, on: boolean) {
  try { localStorage.setItem(key, on ? '1' : '0') } catch {}
}

export function useApprovalPrefs() {
  const [popup, setPopup] = useState(true)
  const [sound, setSound] = useState(false)
  useEffect(() => { setPopup(readFlag(POPUP_KEY, true)); setSound(readFlag(SOUND_KEY, false)) }, [])
  return {
    popup, sound,
    setPopup: (on: boolean) => { setPopup(on); writeFlag(POPUP_KEY, on) },
    setSound: (on: boolean) => { setSound(on); writeFlag(SOUND_KEY, on) },
  }
}

// Plays Vicky's "new request" call. Browsers only allow it once the organiser has tapped
// something on the page — before that it fails quietly, and the pop-up still shows.
export function playRequestCall() {
  new Audio(REQUEST_CALL_CLIP).play().catch(() => {})
}

export function SweepApprovalModal({ requests, onAct, onClose, onPopupOff }: {
  requests: PendingRequest[]
  onAct: (r: PendingRequest, action: 'approve' | 'reject') => Promise<void>
  onClose: () => void
  onPopupOff: () => void
}) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { closeRef.current?.focus() }, [])
  const r = requests[0]
  if (!r) return null

  const act = async (action: 'approve' | 'reject') => {
    setBusy(action)
    await onAct(r, action)
    setBusy(null)
  }
  const tickets = `${r.tickets_requested} ticket${r.tickets_requested === 1 ? '' : 's'}`

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:px-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="approval-title" onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <p id="approval-title" className="text-xs font-bold text-emerald-700 uppercase tracking-wide">
            🎟️ Request{requests.length > 1 ? ` 1 of ${requests.length}` : ''} for approval
          </p>
          <button ref={closeRef} onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-700 -mt-1">✕</button>
        </div>

        <p className="text-lg font-black text-gray-900 mt-2">{r.buyer?.display_name ?? 'Someone'} wants {tickets}</p>
        <p className="text-sm text-gray-600 mt-0.5">
          {r.amount != null && <><strong>${r.amount.toFixed(2)}</strong> · </>}
          {r.payment_method.replace('_', ' ')}
          {r.receipt_url && <> · <a href={r.receipt_url} target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 underline">see receipt</a></>}
        </p>

        <p className="text-xs text-gray-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
          Approving gives them their {tickets} <strong>and marks them as paid</strong> — only approve once the money&apos;s with you.
        </p>

        <div className="flex gap-2 mt-4">
          <button onClick={() => act('approve')} disabled={!!busy}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-xl">
            {busy === 'approve' ? 'Approving…' : '✓ Approve · paid'}
          </button>
          <button onClick={() => act('reject')} disabled={!!busy}
            className="px-4 text-sm font-bold text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50 rounded-xl">
            {busy === 'reject' ? '…' : 'Reject'}
          </button>
        </div>
        <div className="flex items-center justify-between mt-3 text-xs">
          <button onClick={onClose} className="font-semibold text-gray-500 hover:text-gray-800">Later</button>
          <button onClick={onPopupOff} className="text-gray-400 hover:text-gray-700 underline">Don&apos;t pop these up</button>
        </div>
      </div>
    </div>
  )
}
