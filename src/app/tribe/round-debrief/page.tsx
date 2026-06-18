'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Spinner } from '@/components/ui'
import { RoundDebrief } from '@/components/game/RoundDebrief'

function Msg({ title, body }: { title: string; body: string }) {
  return (
    <div className="max-w-md mx-auto px-4 py-24 text-center">
      <h1 className="text-lg font-bold text-gray-900">{title}</h1>
      <p className="text-sm text-gray-500 mt-2">{body}</p>
      <a href="/" className="inline-block mt-5 text-sm font-semibold text-emerald-600 hover:text-emerald-700">Open TribePicks →</a>
    </div>
  )
}

const ACTION_BTN = 'flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors'

function DebriefInner() {
  const params  = useSearchParams()
  const tribeId = params.get('tribe_id')
  const round   = params.get('round') || 'gs1'
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'unauth' | 'error'>('loading')
  const [data, setData]   = useState<any>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [copied, setCopied]       = useState(false)

  useEffect(() => {
    if (!tribeId) { setState('error'); return }
    fetch(`/api/tribes/round-debrief?tribe_id=${tribeId}&round=${round}`)
      .then(async r => {
        if (r.status === 401) return setState('unauth')
        if (r.status === 403) return setState('forbidden')
        if (!r.ok)            return setState('error')
        setData(await r.json()); setState('ok')
      })
      .catch(() => setState('error'))
  }, [tribeId, round])

  if (state === 'loading')   return <div className="flex justify-center py-24"><Spinner className="w-8 h-8" /></div>
  if (state === 'unauth')    return <Msg title="Sign in required" body="Log in to TribePicks to view this debrief." />
  if (state === 'forbidden') return <Msg title="Members only" body="This debrief is restricted to members of this tribe." />
  if (state === 'error' || !data) return <Msg title="Debrief unavailable" body="Couldn't load this debrief — the link may be invalid." />

  const shareUrl = typeof window !== 'undefined' ? window.location.href : ''
  const caption  = `📋 Our ${data.round_name} debrief is in — find out who won the Wooden Spoon 🥄`
  const canShare = typeof navigator !== 'undefined' && !!navigator.share

  const nativeShare = async () => {
    try { await navigator.share({ title: 'TribePicks Round Debrief', text: caption, url: shareUrl }) } catch { /* cancelled */ }
    setShareOpen(false)
  }
  const copyLink = () => navigator.clipboard.writeText(shareUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  const wa = `https://wa.me/?text=${encodeURIComponent(`${caption} ${shareUrl}`)}`
  const tw = `https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}&url=${encodeURIComponent(shareUrl)}`
  const fb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`
  const menuLink = 'block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg'

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html:
        `@media print { body *{visibility:hidden!important} #debrief-print,#debrief-print *{visibility:visible!important} #debrief-print{position:absolute;left:0;top:0;width:100%;padding:16px} }` }} />

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-3">
        <div className="print:hidden flex items-center justify-between gap-2">
          <a href="/" className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-gray-900">
            <span className="text-gray-400">←</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="TribePicks" className="h-6 w-auto" />
            <span>TribePicks</span>
          </a>
          <div className="flex items-center gap-2 relative">
            <button onClick={() => window.print()} className={ACTION_BTN} aria-label="Download as PDF">⬇ PDF</button>
            <button onClick={() => setShareOpen(o => !o)} className={ACTION_BTN} aria-label="Share">↗ Share</button>
            {shareOpen && (
              <div className="absolute right-0 top-10 z-20 w-48 bg-white border border-gray-200 rounded-xl shadow-lg p-1">
                {canShare && <button onClick={nativeShare} className={menuLink + ' w-full text-left'}>Share via device…</button>}
                <a href={wa} target="_blank" rel="noopener noreferrer" className={menuLink}>WhatsApp</a>
                <a href={tw} target="_blank" rel="noopener noreferrer" className={menuLink}>X / Twitter</a>
                <a href={fb} target="_blank" rel="noopener noreferrer" className={menuLink}>Facebook</a>
                <button onClick={copyLink} className={menuLink + ' w-full text-left'}>{copied ? '✓ Copied!' : 'Copy link'}</button>
              </div>
            )}
          </div>
        </div>

        <div id="debrief-print">
          <RoundDebrief data={data} />
        </div>

        <p className="print:hidden text-[10px] text-gray-400 text-center">A bit of fun — no operatives were harmed. 🙂</p>
        <div className="print:hidden text-center pt-1">
          <a href="/" className="inline-block text-sm font-semibold text-emerald-600 hover:text-emerald-700">Open TribePicks →</a>
        </div>
      </div>
    </>
  )
}

export default function RoundDebriefPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-24"><Spinner className="w-8 h-8" /></div>}>
      <DebriefInner />
    </Suspense>
  )
}
