import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { resolveActiveCampaign } from '@/lib/sponsors/resolver'
import { readFileSync } from 'fs'
import { join } from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Embed the logo once as a data URI — no network fetch at render time.
let LOGO_DATA = ''
try { LOGO_DATA = `data:image/png;base64,${readFileSync(join(process.cwd(), 'public', 'logo.png')).toString('base64')}` } catch { /* fall back to wordmark */ }

// GET /api/bracket/og?slug=<bracket-challenge-slug>
// A 1200×630 shareable card for a bracket leaderboard/challenge. Composes the sponsor +
// prize when there's a live campaign, else a generic TribePicks bracket card. Referenced by
// boardMetadata() so a /bracket/leaderboard/<slug> link renders a rich preview even without
// a hand-made card.
export async function GET(request: NextRequest) {
  const slug = new URL(request.url).searchParams.get('slug') || ''

  let sponsor = '', tagline = '', prize = ''
  try {
    const admin = createAdminClient()
    const cfg = await resolveActiveCampaign(admin, { challengeType: 'bracket', slug })
    if (cfg.enabled) { sponsor = cfg.sponsor_name || ''; tagline = cfg.sponsor_tagline || ''; prize = cfg.prize || '' }
  } catch { /* generic card */ }

  const kicker = sponsor ? `${sponsor}${tagline ? ` · ${tagline}` : ''}` : 'WC 2026 Bracket Challenge'
  const sub = prize ? `Top 3 share ${prize}` : 'Predict every knockout tie all the way to the Final'

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: 'linear-gradient(160deg,#047857 0%,#064e3b 52%,#022c22 100%)', color: 'white', padding: '56px 64px' }}>

        {/* Brand chip + kicker */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.96)', borderRadius: 999, padding: '9px 22px 9px 12px' }}>
            {LOGO_DATA ? <img src={LOGO_DATA} width={44} height={44} style={{ objectFit: 'contain' }} /> : null}
            <span style={{ fontSize: 30, fontWeight: 800, color: '#065f46', letterSpacing: -0.5 }}>TribePicks</span>
          </div>
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: 1.5, color: 'rgba(255,255,255,0.72)', textTransform: 'uppercase', maxWidth: 620, textAlign: 'right' }}>{kicker}</span>
        </div>

        {/* Hero */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 76, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05 }}>Pick the World Cup</span>
          <span style={{ fontSize: 76, fontWeight: 800, letterSpacing: -2, lineHeight: 1.1, color: '#6ee7b7' }}>Winners</span>
          <span style={{ fontSize: 32, fontWeight: 600, color: 'rgba(255,255,255,0.82)', marginTop: 20 }}>{sub}</span>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', fontSize: 28, color: 'rgba(255,255,255,0.72)' }}>
          Free · no betting · no account needed · tribepicks.com
        </div>
      </div>
    ),
    { width: 1200, height: 630, emoji: 'twemoji' },
  )
}
