import { ImageResponse } from 'next/og'
import { readFileSync } from 'fs'
import { join } from 'path'

export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Premier League 2026/27 Predictor — free to play on TribePicks'

// Embed the logo once as a data URI — no network fetch at render time.
let LOGO_DATA = ''
try { LOGO_DATA = `data:image/png;base64,${readFileSync(join(process.cwd(), 'public', 'logo.png')).toString('base64')}` } catch { /* fall back to wordmark */ }

// 1200×630 shareable card for the EPL landing page — what WhatsApp / X / Facebook
// render when the /epl link is posted in social launch ads.
export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: 'linear-gradient(160deg,#047857 0%,#064e3b 52%,#022c22 100%)', color: 'white', padding: '56px 64px' }}>

        {/* Brand chip + kicker */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.96)', borderRadius: 999, padding: '9px 22px 9px 12px' }}>
            {LOGO_DATA ? <img src={LOGO_DATA} width={44} height={44} style={{ objectFit: 'contain' }} /> : null}
            <span style={{ fontSize: 30, fontWeight: 800, color: '#065f46', letterSpacing: -0.5 }}>TribePicks</span>
          </div>
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: 3, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Premier League 2026/27</span>
        </div>

        {/* Hero */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <span style={{ fontSize: 84, fontWeight: 800, letterSpacing: -2, lineHeight: 1 }}>The Premier League</span>
          <span style={{ fontSize: 84, fontWeight: 800, letterSpacing: -2, lineHeight: 1.1, color: '#6ee7b7' }}>Predictor</span>
          <span style={{ fontSize: 34, fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginTop: 22 }}>Predict the table · tip every matchweek · climb the leaderboard</span>
        </div>

        {/* Feature chips */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 18 }}>
          {['🪜 Top 5 & Bottom 3', '⚽ Weekly tips', '🆚 Match challenges'].map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.12)', borderRadius: 999, padding: '14px 28px', fontSize: 30, fontWeight: 700 }}>{t}</div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'center', fontSize: 30, color: 'rgba(255,255,255,0.75)' }}>
          Free to play · no betting · tribepicks.com/epl
        </div>
      </div>
    ),
    { ...size, emoji: 'twemoji' },
  )
}
