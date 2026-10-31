'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { track } from '@vercel/analytics'
import toast from 'react-hot-toast'

// My Pool's "Bring a colleague in" — the sweep's own join link (the organiser's QR on
// sweep-admin's Sell tab), so anyone in the sweep can sign up the person at the next desk.
// Collapsed by default: people open My Pool to spin and check their horse, not to recruit.
// src=pool_qr tells these joins apart from the organiser's. The organiser can switch it off
// (comps.sweep_member_qr, migration 209); the parent hides it once nobody can join.
export function PoolInviteCard({ inviteCode, sweepName, className = '' }: { inviteCode: string; sweepName: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const [qr, setQr] = useState('')
  const url = `https://tribepicks.com/sweep?code=${inviteCode}&src=pool_qr`
  const text = encodeURIComponent(`Join our sweep "${sweepName}" on TribePicks: ${url}`)

  useEffect(() => {
    if (!open || qr) return
    QRCode.toDataURL(url, { margin: 1, width: 200 }).then(setQr).catch(() => setQr(''))
  }, [open, qr, url])

  const copy = async () => {
    await navigator.clipboard.writeText(url).catch(() => {})
    toast.success('Link copied!')
    track('pool_invite_share', { via: 'copy' })
  }

  return (
    <div className={`rounded-2xl border border-gray-200 bg-white ${className}`}>
      <button onClick={() => { setOpen(o => !o); if (!open) track('pool_invite_open') }}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left">
        <span className="text-sm font-bold text-gray-900">🎟️ Bring a colleague in</span>
        <span className="text-xs font-semibold text-emerald-700">{open ? 'Hide' : 'Show QR'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 text-center">
          <p className="text-xs text-gray-500 mb-3">They scan it, join the sweep, and ask the organiser for a ticket.</p>
          {qr ? <img src={qr} alt="QR code to join this sweep" className="mx-auto mb-3 rounded-lg border border-gray-200 w-[200px] h-[200px]" />
              : <div className="mx-auto mb-3 w-[200px] h-[200px]" />}
          <button onClick={copy} className="text-xs text-gray-500 break-all hover:text-gray-700">{url} ⎘</button>
          <div className="mt-3 flex items-center justify-center gap-4">
            <a href={`https://wa.me/?text=${text}`} target="_blank" rel="noreferrer" onClick={() => track('pool_invite_share', { via: 'whatsapp' })}
              className="text-sm font-bold text-emerald-600 hover:underline">WhatsApp →</a>
            <a href={`mailto:?subject=${encodeURIComponent(`Join our sweep: ${sweepName}`)}&body=${text}`} onClick={() => track('pool_invite_share', { via: 'email' })}
              className="text-sm font-bold text-emerald-600 hover:underline">Email →</a>
          </div>
        </div>
      )}
    </div>
  )
}
