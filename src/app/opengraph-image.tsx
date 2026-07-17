import { ImageResponse } from 'next/og'
import { readFileSync } from 'fs'
import { join } from 'path'

export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'TribePicks — free football prediction game'

// Embed the logo once as a data URI — no network fetch at render time.
let LOGO_DATA = ''
try { LOGO_DATA = `data:image/png;base64,${readFileSync(join(process.cwd(), 'public', 'logo.png')).toString('base64')}` } catch { /* fall back to wordmark */ }

// Default 1200×630 share card for the whole site — what social/chat/AI previews render for
// any page that doesn't supply its own opengraph-image or openGraph.images.
export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: 'linear-gradient(160deg,#047857 0%,#064e3b 52%,#022c22 100%)', color: 'white', padding: '56px 64px' }}>

        {/* Brand chip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, alignSelf: 'flex-start', background: 'rgba(255,255,255,0.96)', borderRadius: 999, padding: '9px 22px 9px 12px' }}>
          {LOGO_DATA ? <img src={LOGO_DATA} width={44} height={44} style={{ objectFit: 'contain' }} /> : null}
          <span style={{ fontSize: 30, fontWeight: 800, color: '#065f46', letterSpacing: -0.5 }}>TribePicks</span>
        </div>

        {/* Hero */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 74, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05 }}>The free football</span>
          <span style={{ fontSize: 74, fontWeight: 800, letterSpacing: -2, lineHeight: 1.1, color: '#6ee7b7' }}>prediction game</span>
          <span style={{ fontSize: 32, fontWeight: 600, color: 'rgba(255,255,255,0.82)', marginTop: 20 }}>Tip every match · beat your tribe · win bragging rights</span>
        </div>

        {/* Feature chips */}
        <div style={{ display: 'flex', gap: 16 }}>
          {['⚽ Tip every match', '🏆 Build brackets', '👥 Private comps'].map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.12)', borderRadius: 999, padding: '13px 26px', fontSize: 28, fontWeight: 700 }}>{t}</div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', fontSize: 28, color: 'rgba(255,255,255,0.72)' }}>
          Free to play · no betting · tribepicks.com
        </div>
      </div>
    ),
    { ...size, emoji: 'twemoji' },
  )
}
