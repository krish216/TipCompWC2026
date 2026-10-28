'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'

const EOI_URL = 'https://tribepicks.com/melbourne-cup'

// Admin-only "EOI QR" button for a sweep tournament: opens a modal with a printable QR code
// for the public /melbourne-cup expression-of-interest page. The link carries ?src=qr so
// leads that came from a printed/shared QR are tagged in sweep_eoi.source (migration 197).
export function SweepEoiQrButton() {
  const [open, setOpen] = useState(false)
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  const url = `${EOI_URL}?src=qr`

  useEffect(() => {
    if (!open || qr) return
    // Big enough to print on a poster; the modal scales it down on screen.
    QRCode.toDataURL(url, { margin: 2, width: 1024 }).then(setQr).catch(() => setQr(''))
  }, [open, qr, url])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
        <span className="text-[11px] font-medium text-gray-700">▦ EOI QR</span>
      </button>

      {open && createPortal(
        <div onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
          className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 text-center">
            <div className="flex items-start justify-between mb-2">
              <div className="text-left">
                <p className="font-bold text-gray-900">Melbourne Cup — register interest</p>
                <p className="text-xs text-gray-500">Scan to run or join a sweep</p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>

            {qr
              ? <img src={qr} alt="QR code for the Melbourne Cup interest page" className="w-64 h-64 mx-auto rounded-lg border border-gray-200" />
              : <div className="w-64 h-64 mx-auto rounded-lg border border-gray-200 bg-gray-50" />}

            <p className="text-[11px] text-gray-500 mt-3 break-all">{url}</p>

            <div className="grid grid-cols-3 gap-2 mt-4">
              <button onClick={copy} className="text-xs font-bold text-gray-700 border border-gray-200 hover:bg-gray-50 px-2 py-2 rounded-lg">
                {copied ? '✓ Copied' : 'Copy link'}
              </button>
              <a href={qr || undefined} download="melbourne-cup-eoi-qr.png"
                className={`text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-2 py-2 rounded-lg ${qr ? '' : 'pointer-events-none opacity-50'}`}>
                Download
              </a>
              <a href="/melbourne-cup" target="_blank" rel="noreferrer"
                className="text-xs font-bold text-gray-700 border border-gray-200 hover:bg-gray-50 px-2 py-2 rounded-lg">
                Open page
              </a>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
