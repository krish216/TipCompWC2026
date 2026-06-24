import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { computeTipsterStats } from '@/lib/tipster-stats'
import QRCode from 'qrcode'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/tipster/card?tournament_id=   → 1080×1080 shareable tipster card (PNG).
// ?demo=1 renders a sample card (no auth) for the showcase / previews.
interface CardData {
  name: string; avatarUrl: string | null
  emoji: string; persona: string
  topPercent: number | null; hitRate: number | null
  tagline: string; joinUrl: string
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.tribepicks.com').replace(/\/$/, '')

  let data: CardData
  if (url.searchParams.get('demo') === '1') {
    data = {
      name: 'Sample', avatarUrl: null, emoji: '🔮', persona: 'The Oracle',
      topPercent: 8, hitRate: 61, tagline: '🐐 Called Morocco over the field',
      joinUrl: `${appUrl}/join`,
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
      data = { name, avatarUrl, emoji: '⚽', persona: name, topPercent: null, hitRate: null, tagline: 'I’m playing TribePicks', joinUrl: `${appUrl}/join?ref=${user.id}` }
    } else {
      const s = res.stats
      const upset = s.biggestUpset ? `🐐 Called ${s.biggestUpset.picked} over the field` : `${s.correctCount}/${s.predictionsMade} results called`
      data = { name, avatarUrl, emoji: s.persona.emoji, persona: s.persona.label, topPercent: s.topPercent, hitRate: Math.round(s.hitRate * 100), tagline: upset, joinUrl: `${appUrl}/join?ref=${user.id}` }
    }
  }

  const qr = await QRCode.toDataURL(data.joinUrl, { margin: 1, width: 220, color: { dark: '#065f46', light: '#ffffff' } })
  const initials = data.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '⚽'

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(165deg, #059669 0%, #065f46 100%)', color: 'white', padding: '76px 64px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 44, fontWeight: 800, letterSpacing: -1 }}>⚽ TribePicks</div>

        {/* Middle */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {data.avatarUrl
            ? <img src={data.avatarUrl} width={210} height={210} style={{ borderRadius: 105, border: '8px solid rgba(255,255,255,0.25)' }} />
            : <div style={{ width: 210, height: 210, borderRadius: 105, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 88, fontWeight: 800 }}>{initials}</div>}
          <div style={{ fontSize: 112, marginTop: 18 }}>{data.emoji}</div>
          <div style={{ fontSize: 72, fontWeight: 800, marginTop: 4 }}>{data.persona}</div>
          {data.topPercent != null && (
            <div style={{ display: 'flex', fontSize: 40, opacity: 0.95, marginTop: 18, background: 'rgba(255,255,255,0.14)', padding: '14px 30px', borderRadius: 999 }}>
              Top {data.topPercent}%{data.hitRate != null ? `  ·  ${data.hitRate}% hit-rate` : ''}
            </div>
          )}
          <div style={{ display: 'flex', fontSize: 34, opacity: 0.92, marginTop: 22 }}>{data.tagline}</div>
        </div>

        {/* Footer — QR + CTA */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={qr} width={172} height={172} style={{ borderRadius: 18, background: 'white', padding: 10 }} />
          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 28 }}>
            <div style={{ fontSize: 40, fontWeight: 800 }}>Think you can beat me?</div>
            <div style={{ display: 'flex', fontSize: 30, opacity: 0.9, marginTop: 6 }}>Scan to play · tribepicks.com</div>
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1080, emoji: 'twemoji' },
  )
}
