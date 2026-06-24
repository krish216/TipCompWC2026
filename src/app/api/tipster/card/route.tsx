import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { computeTipsterStats } from '@/lib/tipster-stats'
import QRCode from 'qrcode'
import { readFileSync } from 'fs'
import { join } from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Embed the logo as a data URI (read once) — no network fetch at render time.
let LOGO_DATA = ''
try { LOGO_DATA = `data:image/png;base64,${readFileSync(join(process.cwd(), 'public', 'logo.png')).toString('base64')}` } catch { /* fall back to wordmark */ }

// GET /api/tipster/card?tournament_id=   → 1080×1080 shareable tipster card (PNG).
// ?demo=1 renders a sample card (no auth) for the showcase / previews.
// Each persona gets an accent colour (avatar ring + badge border).
const PERSONA_ACCENT: Record<string, string> = {
  oracle: '#a78bfa', maverick: '#fb7185', banker: '#fbbf24', whisperer: '#2dd4bf', allrounder: '#34d399',
}
interface CardData {
  name: string; avatarUrl: string | null
  emoji: string; persona: string
  topPercent: number | null; hitRate: number | null; points: number
  tagline: string; joinUrl: string; accent: string
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.tribepicks.com').replace(/\/$/, '')

  let data: CardData
  if (url.searchParams.get('demo') === '1') {
    data = {
      name: 'Sample', avatarUrl: null, emoji: '🔮', persona: 'The Oracle',
      topPercent: 8, hitRate: 61, points: 142, tagline: '🐐 Called Morocco over the field',
      joinUrl: `${appUrl}/join`, accent: PERSONA_ACCENT.oracle,
    }
  } else {
    createServerSupabaseClient()
    const user = await getSessionUser()
    if (!user) return new Response('Unauthorized', { status: 401 })
    const tournamentId = url.searchParams.get('tournament_id')
    if (!tournamentId) return new Response('tournament_id required', { status: 400 })

    const admin = createAdminClient()
    const [{ data: ut }, { data: u }] = await Promise.all([
      (admin.from('user_tournaments') as any).select('is_premium, is_ad_free').eq('user_id', user.id).eq('tournament_id', tournamentId).maybeSingle(),
      (admin.from('users') as any).select('display_name, avatar_url').eq('id', user.id).maybeSingle(),
    ])
    if (!(ut?.is_premium || ut?.is_ad_free)) return new Response('Pro only', { status: 403 })

    const res = await computeTipsterStats(admin, user.id, tournamentId)
    const name = (u as any)?.display_name ?? 'Tipster'
    const avatarUrl = (u as any)?.avatar_url ?? null
    if (!res.ok) {
      data = { name, avatarUrl, emoji: '⚽', persona: name, topPercent: null, hitRate: null, points: 0, tagline: 'I’m playing TribePicks', joinUrl: `${appUrl}/join?ref=${user.id}`, accent: PERSONA_ACCENT.allrounder }
    } else {
      const s = res.stats
      const upset = s.biggestUpset ? `🐐 Called ${s.biggestUpset.picked} over the field` : `${s.correctCount}/${s.predictionsMade} results called`
      data = { name, avatarUrl, emoji: s.persona.emoji, persona: s.persona.label, topPercent: s.topPercent, hitRate: Math.round(s.hitRate * 100), points: s.totalPoints, tagline: upset, joinUrl: `${appUrl}/join?ref=${user.id}`, accent: PERSONA_ACCENT[s.persona.key] ?? '#34d399' }
    }
  }

  const qr = await QRCode.toDataURL(data.joinUrl, { margin: 1, width: 220, color: { dark: '#065f46', light: '#ffffff' } })
  const initials = data.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '⚽'

  const tiles = data.topPercent != null
    ? [{ v: `Top ${data.topPercent}%`, l: 'Ranked' }, { v: `${data.hitRate}%`, l: 'Hit-rate' }, { v: `${data.points}`, l: 'Points' }]
    : []

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(160deg, #047857 0%, #064e3b 52%, #022c22 100%)', color: 'white', padding: '60px 56px 52px' }}>

        {/* Brand chip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.96)', borderRadius: 999, padding: '9px 22px 9px 12px' }}>
          {LOGO_DATA ? <img src={LOGO_DATA} width={46} height={46} style={{ objectFit: 'contain' }} /> : null}
          <span style={{ fontSize: 30, fontWeight: 800, color: '#065f46', letterSpacing: -0.5 }}>TribePicks</span>
        </div>

        {/* Hero — avatar + persona */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ display: 'flex', padding: 9, borderRadius: 999, background: data.accent, boxShadow: '0 20px 55px rgba(0,0,0,0.4)' }}>
            {data.avatarUrl
              ? <img src={data.avatarUrl} width={232} height={232} style={{ borderRadius: 116 }} />
              : <div style={{ width: 232, height: 232, borderRadius: 116, background: '#064e3b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 96, fontWeight: 800 }}>{initials}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 28, background: 'rgba(255,255,255,0.1)', border: `2px solid ${data.accent}`, borderRadius: 999, padding: '12px 32px' }}>
            <span style={{ fontSize: 52 }}>{data.emoji}</span>
            <span style={{ fontSize: 56, fontWeight: 800, letterSpacing: -1 }}>{data.persona}</span>
          </div>
          <div style={{ display: 'flex', fontSize: 32, color: 'rgba(255,255,255,0.85)', marginTop: 20 }}>{data.tagline}</div>
        </div>

        {/* Stat tiles */}
        {tiles.length > 0 && (
          <div style={{ display: 'flex', gap: 18, width: '100%' }}>
            {tiles.map((t, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.1)', borderRadius: 30, padding: '28px 0' }}>
                <span style={{ fontSize: 58, fontWeight: 800, letterSpacing: -1 }}>{t.v}</span>
                <span style={{ fontSize: 24, color: 'rgba(255,255,255,0.65)', marginTop: 4 }}>{t.l}</span>
              </div>
            ))}
          </div>
        )}

        {/* Footer bar — QR + CTA */}
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', background: 'rgba(0,0,0,0.25)', borderRadius: 30, padding: '20px 26px' }}>
          <div style={{ display: 'flex', background: 'white', borderRadius: 16, padding: 9 }}>
            <img src={qr} width={138} height={138} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 26 }}>
            <span style={{ fontSize: 42, fontWeight: 800, letterSpacing: -0.5 }}>Think you can beat me?</span>
            <span style={{ display: 'flex', fontSize: 27, color: 'rgba(255,255,255,0.75)', marginTop: 6 }}>Scan to play · tribepicks.com</span>
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1080, emoji: 'twemoji' },
  )
}
