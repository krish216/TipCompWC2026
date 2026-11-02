import { ImageResponse } from 'next/og'
import { readFileSync } from 'fs'
import { join } from 'path'

export const CUP_CARD_SIZE = { width: 1200, height: 630 }

let LOGO_DATA = ''
try { LOGO_DATA = `data:image/png;base64,${readFileSync(join(process.cwd(), 'public', 'logo.png')).toString('base64')}` } catch { /* fall back to wordmark */ }

// The Melbourne Cup share card (1200×630) — what Slack, WhatsApp, Teams and socials show for
// the Cup pages and sweep join links, instead of the site-wide football card
// (app/opengraph-image.tsx). Same brand chip; the TribePicks dark green with gold, like the wheel.
const ORGANISER_CHIPS = ['🔗 Share one link', '💸 They pay you', '🎡 Spin for a horse']

export function cupCard({ headline, accent, sub, chips = ORGANISER_CHIPS }: { headline: string; accent: string; sub: string; chips?: string[] }) {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: 'linear-gradient(160deg,#0a2e1c 0%,#153d26 50%,#0d3320 100%)', color: 'white', padding: '56px 64px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, alignSelf: 'flex-start', background: 'rgba(255,255,255,0.96)', borderRadius: 999, padding: '9px 22px 9px 12px' }}>
          {LOGO_DATA ? <img src={LOGO_DATA} width={44} height={44} style={{ objectFit: 'contain' }} /> : null}
          <span style={{ fontSize: 30, fontWeight: 800, color: '#065f46', letterSpacing: -0.5 }}>TribePicks</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 30, fontWeight: 800, color: '#fbbf24', letterSpacing: 2, textTransform: 'uppercase' }}>🐎 Melbourne Cup 2026</span>
          <span style={{ fontSize: 72, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05, marginTop: 14 }}>{headline}</span>
          <span style={{ fontSize: 72, fontWeight: 800, letterSpacing: -2, lineHeight: 1.1, color: '#6ee7b7' }}>{accent}</span>
          <span style={{ fontSize: 30, fontWeight: 600, color: 'rgba(255,255,255,0.82)', marginTop: 20 }}>{sub}</span>
        </div>

        <div style={{ display: 'flex', gap: 16 }}>
          {chips.map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.12)', borderRadius: 999, padding: '13px 26px', fontSize: 28, fontWeight: 700 }}>{t}</div>
          ))}
        </div>
      </div>
    ),
    { ...CUP_CARD_SIZE, emoji: 'twemoji' },
  )
}
