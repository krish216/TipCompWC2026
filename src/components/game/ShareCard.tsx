'use client'

import { useCallback, useState } from 'react'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://tip-comp-wc-2026.vercel.app'

// ── Draw a share card onto a canvas ───────────────────────────────────────
function drawCard(canvas: HTMLCanvasElement, payload: SharePayload, flagFn: (name: string) => string) {
  const W = 600, H = 315
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, W, H)
  grad.addColorStop(0, '#064e3b')
  grad.addColorStop(1, '#065f46')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // Subtle grid pattern
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'
  ctx.lineWidth = 1
  for (let x = 0; x < W; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
  for (let y = 0; y < H; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }

  // TipComp branding
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.font = 'bold 18px system-ui, sans-serif'
  ctx.fillText('⚽ TipComp 2026', 28, 38)

  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.font = '12px system-ui, sans-serif'
  ctx.fillText(APP_URL.replace('https://', ''), 28, 58)

  // Divider
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(28, 68); ctx.lineTo(W - 28, 68); ctx.stroke()

  if (payload.type === 'prediction') {
    drawPredictionCard(ctx, W, H, payload, flagFn)
  } else if (payload.type === 'rank') {
    drawRankCard(ctx, W, H, payload)
  } else if (payload.type === 'achievement') {
    drawAchievementCard(ctx, W, H, payload)
  }

  // Bottom CTA
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  roundRect(ctx, 28, H - 46, W - 56, 30, 6)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = '12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Join TipComp 2026 → ' + APP_URL.replace('https://', ''), W / 2, H - 25)
  ctx.textAlign = 'left'
}

function drawPredictionCard(ctx: CanvasRenderingContext2D, W: number, H: number, p: PredictionPayload, flagFn: (name: string) => string) {
  // Round badge
  ctx.fillStyle = 'rgba(52,211,153,0.3)'
  roundRect(ctx, 28, 80, 120, 22, 4); ctx.fill()
  ctx.fillStyle = '#6ee7b7'
  ctx.font = '11px system-ui, sans-serif'
  ctx.fillText(p.roundLabel.toUpperCase(), 38, 96)

  // "My prediction" label
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '13px system-ui, sans-serif'
  ctx.fillText('My prediction', 28, 125)

  // Scores
  ctx.fillStyle = 'white'
  ctx.font = 'bold 64px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(`${p.homeScore} – ${p.awayScore}`, W / 2, 195)
  ctx.textAlign = 'left'

  // Teams
  ctx.font = 'bold 20px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.textAlign = 'right'
  ctx.fillText(`${flagFn(p.home)} ${p.home}`, W / 2 - 55, 225)
  ctx.textAlign = 'left'
  ctx.fillText(`${flagFn(p.away)} ${p.away}`, W / 2 + 55, 225)
  ctx.textAlign = 'left'

  // Favourite star
  if (p.isFavourite) {
    ctx.fillStyle = '#fbbf24'
    ctx.font = '13px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('⭐ Favourite team — double points!', W / 2, 248)
    ctx.textAlign = 'left'
  }
}

function drawRankCard(ctx: CanvasRenderingContext2D, W: number, H: number, p: RankPayload) {
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '14px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(p.roundLabel ? `Standing after ${p.roundLabel}` : 'Current standing', W / 2, 105)

  ctx.font = 'bold 80px system-ui, sans-serif'
  ctx.fillStyle = '#fbbf24'
  ctx.fillText(`#${p.rank}`, W / 2, 195)

  ctx.font = 'bold 22px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fillText(`${p.points} pts`, W / 2, 228)

  ctx.font = '14px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.fillText(`${p.exact} exact · ${p.correct} correct`, W / 2, 252)

  if (p.displayName) {
    ctx.font = '13px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.fillText(p.displayName, W / 2, 272)
  }
  ctx.textAlign = 'left'
}

function drawAchievementCard(ctx: CanvasRenderingContext2D, W: number, H: number, p: AchievementPayload) {
  ctx.textAlign = 'center'

  ctx.font = '56px system-ui, sans-serif'
  ctx.fillText(p.icon, W / 2, 155)

  ctx.font = 'bold 24px system-ui, sans-serif'
  ctx.fillStyle = '#fbbf24'
  ctx.fillText(p.title, W / 2, 195)

  ctx.font = '15px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  // Word wrap description
  const words = p.description.split(' ')
  let line = ''; let y = 220
  for (const word of words) {
    const test = line + word + ' '
    if (ctx.measureText(test).width > W - 100 && line !== '') {
      ctx.fillText(line.trim(), W / 2, y); y += 22; line = word + ' '
    } else { line = test }
  }
  if (line) ctx.fillText(line.trim(), W / 2, y)
  ctx.textAlign = 'left'
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

// ── Tipsheet types ─────────────────────────────────────────────────────────
export interface TipsheetFixture {
  id: number
  home: string
  away: string
  prediction: { home: number; away: number } | null
  result: { home: number; away: number } | null
  points: number | null
}

function drawTipsheet(
  canvas: HTMLCanvasElement,
  roundLabel: string,
  rows: TipsheetFixture[],
  flagFn: (name: string) => string
) {
  const W        = 600
  const ROW_H    = 30
  const HEADER_H = 84
  const FOOTER_H = 48
  const H        = HEADER_H + rows.length * ROW_H + FOOTER_H

  canvas.width  = W
  canvas.height = H

  const ctx = canvas.getContext('2d')!

  const grad = ctx.createLinearGradient(0, 0, W, H)
  grad.addColorStop(0, '#064e3b')
  grad.addColorStop(1, '#065f46')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  ctx.strokeStyle = 'rgba(255,255,255,0.04)'
  ctx.lineWidth = 1
  for (let x = 0; x < W; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
  for (let y = 0; y < H; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }

  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.font = 'bold 16px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('⚽ TipComp 2026', 20, 30)

  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.font = '11px system-ui, sans-serif'
  ctx.fillText(APP_URL.replace('https://', ''), 20, 46)

  const badgeLabel = roundLabel.toUpperCase() + ' — MY TIPSHEET'
  const badgeW = ctx.measureText(badgeLabel).width + 20
  ctx.fillStyle = 'rgba(52,211,153,0.3)'
  roundRect(ctx, 20, 54, badgeW, 18, 4)
  ctx.fill()
  ctx.fillStyle = '#6ee7b7'
  ctx.font = 'bold 10px system-ui, sans-serif'
  ctx.fillText(badgeLabel, 30, 67)

  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.font = '9px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('MY PICK', 392, 81)
  ctx.fillText('RESULT',  462, 81)
  ctx.fillText('PTS',     538, 81)
  ctx.textAlign = 'left'

  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(20, HEADER_H); ctx.lineTo(W - 20, HEADER_H); ctx.stroke()

  for (let i = 0; i < rows.length; i++) {
    const fx   = rows[i]
    const rowY = HEADER_H + i * ROW_H
    const midY = rowY + ROW_H / 2 + 3.5

    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.03)'
      ctx.fillRect(0, rowY, W, ROW_H)
    }

    const homeFlag = flagFn(fx.home) || ''
    const awayFlag = flagFn(fx.away) || ''

    ctx.font = '10px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.textAlign = 'right'
    ctx.fillText(`${homeFlag ? homeFlag + ' ' : ''}${truncate(fx.home, 17)}`, 158, midY)

    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.fillText('v', 172, midY)

    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillText(`${truncate(fx.away, 17)}${awayFlag ? ' ' + awayFlag : ''}`, 183, midY)

    ctx.strokeStyle = 'rgba(255,255,255,0.1)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(352, rowY + 5); ctx.lineTo(352, rowY + ROW_H - 5); ctx.stroke()

    ctx.textAlign = 'center'
    if (fx.prediction) {
      ctx.fillStyle = '#fbbf24'
      ctx.font = 'bold 11px system-ui, sans-serif'
      ctx.fillText(`${fx.prediction.home}–${fx.prediction.away}`, 392, midY)
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.font = '10px system-ui, sans-serif'
      ctx.fillText('—', 392, midY)
    }

    if (fx.result !== null) {
      ctx.font = '10px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.fillText(`${fx.result.home}–${fx.result.away}`, 462, midY)
      if (fx.points !== null) {
        if (fx.points > 0) {
          ctx.fillStyle = '#34d399'
          ctx.font = 'bold 11px system-ui, sans-serif'
          ctx.fillText(`+${fx.points}`, 538, midY)
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.3)'
          ctx.font = '10px system-ui, sans-serif'
          ctx.fillText('0', 538, midY)
        }
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.2)'
        ctx.font = '10px system-ui, sans-serif'
        ctx.fillText('—', 538, midY)
      }
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.2)'
      ctx.font = '10px system-ui, sans-serif'
      ctx.fillText('TBD', 462, midY)
      ctx.fillText('—',   538, midY)
    }

    ctx.textAlign = 'left'

    if (i < rows.length - 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(20, rowY + ROW_H); ctx.lineTo(W - 20, rowY + ROW_H); ctx.stroke()
    }
  }

  const footerTop = HEADER_H + rows.length * ROW_H
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(20, footerTop); ctx.lineTo(W - 20, footerTop); ctx.stroke()

  ctx.fillStyle = 'rgba(255,255,255,0.2)'
  roundRect(ctx, 20, footerTop + 10, W - 40, 26, 6)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.font = '11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Join TripComp 2026 → ' + APP_URL.replace('https://', ''), W / 2, footerTop + 27)
  ctx.textAlign = 'left'
}

// ── Types ──────────────────────────────────────────────────────────────────
interface PredictionPayload {
  type: 'prediction'
  home: string; away: string
  homeScore: number; awayScore: number
  roundLabel: string
  isFavourite?: boolean
}
interface RankPayload {
  type: 'rank'
  rank: number; points: number; exact: number; correct: number; bonus?: number
  displayName?: string; roundLabel?: string
}
interface AchievementPayload {
  type: 'achievement'
  icon: string; title: string; description: string
}
export type SharePayload = PredictionPayload | RankPayload | AchievementPayload

// ── Share button component ─────────────────────────────────────────────────
interface ShareButtonProps {
  payload: SharePayload
  label?: string
  className?: string
  compact?: boolean
}

export function ShareButton({ payload, label, className = '', compact = false }: ShareButtonProps) {
  const { flag } = useUserPrefs()
  const [sharing, setSharing] = useState(false)
  const [copied, setCopied]   = useState(false)

  const share = useCallback(async () => {
    if (sharing) return
    setSharing(true)

    try {
      const canvas = document.createElement('canvas')
      drawCard(canvas, payload, flag)

      // Build share text
      let text = ''
      if (payload.type === 'prediction') {
        text = `I'm picking ${payload.home} ${payload.homeScore}–${payload.awayScore} ${payload.away} in TipComp 2026! Think you can do better? 🎯`
      } else if (payload.type === 'rank') {
        text = `I'm ranked #${payload.rank} in TipComp 2026 with ${payload.points} pts! 🏆`
      } else {
        text = `${payload.title} — TipComp 2026 🎯`
      }
      text += `\n${APP_URL}`

      // Try Web Share API (mobile)
      if (navigator.canShare) {
        canvas.toBlob(async blob => {
          if (!blob) return
          const file = new File([blob], 'tipcomp-share.png', { type: 'image/png' })
          if (navigator.canShare({ files: [file] })) {
            try {
              await navigator.share({ files: [file], text })
              setSharing(false); return
            } catch { /* user cancelled or not supported */ }
          }
          // Fallback to text-only share
          try { await navigator.share({ text }) } catch { }
          setSharing(false)
        }, 'image/png')
        return
      }

      // Desktop fallback — copy image to clipboard
      canvas.toBlob(async blob => {
        if (!blob) return
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ])
          setCopied(true)
          setTimeout(() => setCopied(false), 2500)
        } catch {
          // Final fallback — copy text
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 2500)
        }
        setSharing(false)
      }, 'image/png')
    } catch {
      setSharing(false)
    }
  }, [payload, sharing])

  if (compact) {
    return (
      <button
        onClick={share}
        title={copied ? 'Copied!' : 'Share'}
        className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors ${
          copied ? 'bg-green-100 text-green-600' : 'bg-gray-100 hover:bg-gray-200 text-gray-500'
        } ${className}`}
      >
        {copied ? '✓' : (
          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z"/>
          </svg>
        )}
      </button>
    )
  }

  return (
    <button
      onClick={share}
      disabled={sharing}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        copied
          ? 'bg-green-100 text-green-700 border border-green-300'
          : 'bg-white hover:bg-gray-50 text-gray-600 border border-gray-200'
      } ${className}`}
    >
      {copied ? (
        <><span>✓</span><span>Copied!</span></>
      ) : sharing ? (
        <><span className="animate-pulse">⏳</span><span>Generating…</span></>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z"/>
          </svg>
          <span>{label || 'Share'}</span>
        </>
      )}
    </button>
  )
}

// ── Tipsheet share button ─────────────────────────────────────────────────
interface TipsheetShareButtonProps {
  roundLabel: string
  fixtures: TipsheetFixture[]
  className?: string
}

export function TipsheetShareButton({ roundLabel, fixtures, className = '' }: TipsheetShareButtonProps) {
  const { flag }              = useUserPrefs()
  const [busy, setBusy]       = useState(false)
  const [saved, setSaved]     = useState(false)

  const generate = useCallback(async () => {
    if (busy || fixtures.length === 0) return
    setBusy(true)
    try {
      const canvas = document.createElement('canvas')
      drawTipsheet(canvas, roundLabel, fixtures, flag)
      const text = `My ${roundLabel} tipsheet — TipComp 2026 🎯\n${APP_URL}`

      if (navigator.canShare) {
        canvas.toBlob(async blob => {
          if (!blob) { setBusy(false); return }
          const file = new File([blob], 'tipsheet.png', { type: 'image/png' })
          if (navigator.canShare({ files: [file] })) {
            try { await navigator.share({ files: [file], text }); setBusy(false); return } catch { /* cancelled */ }
          }
          try { await navigator.share({ text }) } catch { /* cancelled */ }
          setBusy(false)
        }, 'image/png')
        return
      }

      // Desktop — download as PNG
      canvas.toBlob(blob => {
        if (!blob) { setBusy(false); return }
        const url = URL.createObjectURL(blob)
        const a   = document.createElement('a')
        a.href     = url
        a.download = `tipsheet-${roundLabel.toLowerCase().replace(/\s+/g, '-')}.png`
        a.click()
        URL.revokeObjectURL(url)
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
        setBusy(false)
      }, 'image/png')
    } catch { setBusy(false) }
  }, [roundLabel, fixtures, flag, busy])

  return (
    <button
      onClick={generate}
      disabled={busy || fixtures.length === 0}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        saved
          ? 'bg-green-100 text-green-700 border border-green-300'
          : 'bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 disabled:opacity-40'
      } ${className}`}
    >
      {saved ? (
        <><span>✓</span><span>Saved!</span></>
      ) : busy ? (
        <><span className="animate-pulse">⏳</span><span>Generating…</span></>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
          <span>Save tipsheet</span>
        </>
      )}
    </button>
  )
}

// ── Achievement toast popup ────────────────────────────────────────────────
interface AchievementToastProps {
  icon: string
  title: string
  description: string
  onShare: () => void
  onDismiss: () => void
}

export function AchievementToast({ icon, title, description, onShare, onDismiss }: AchievementToastProps) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[340px] max-w-[calc(100vw-32px)] bg-gradient-to-br from-green-800 to-green-900 border border-green-600 rounded-2xl shadow-2xl p-4 animate-slide-up">
      <button onClick={onDismiss} className="absolute top-3 right-3 text-green-400 hover:text-white text-lg leading-none">×</button>
      <div className="flex items-start gap-3">
        <div className="text-3xl flex-shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="text-xs text-green-300 mt-0.5">{description}</p>
          <button
            onClick={onShare}
            className="mt-2.5 flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z"/>
            </svg>
            Share this achievement
          </button>
        </div>
      </div>
    </div>
  )
}
