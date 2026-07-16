import { ImageResponse } from 'next/og'
import { readFileSync } from 'fs'
import { join } from 'path'

export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Feed the doggies on TribePicks — keeps the game free and helps dog rescues'

// Embed assets once as data URIs — no network fetch at render time.
let LOGO_DATA = ''
try { LOGO_DATA = `data:image/png;base64,${readFileSync(join(process.cwd(), 'public', 'logo.png')).toString('base64')}` } catch { /* fall back to wordmark */ }
let DOG_DATA = ''
try { DOG_DATA = `data:image/jpeg;base64,${readFileSync(join(process.cwd(), 'public', 'dogs', 'Neve Socceroos Fan.jpeg')).toString('base64')}` } catch { /* fall back to paw emoji */ }

// 1200×630 shareable card for the "Feed the doggies" donation page — what email clients,
// WhatsApp / X / Facebook render when a tribepicks.com/feed link is shared.
export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: 'linear-gradient(160deg,#f59e0b 0%,#d97706 50%,#b45309 100%)', color: 'white', padding: '56px 64px' }}>

        {/* Brand chip + kicker */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.96)', borderRadius: 999, padding: '9px 22px 9px 12px' }}>
            {LOGO_DATA ? <img src={LOGO_DATA} width={44} height={44} style={{ objectFit: 'contain' }} /> : null}
            <span style={{ fontSize: 30, fontWeight: 800, color: '#b45309', letterSpacing: -0.5 }}>TribePicks</span>
          </div>
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: 3, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase' }}>Feed the doggies</span>
        </div>

        {/* Hero: text + dog portrait */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 48 }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <span style={{ fontSize: 82, fontWeight: 800, letterSpacing: -2, lineHeight: 1 }}>Feed the pack 🐾</span>
            <span style={{ fontSize: 33, fontWeight: 600, color: 'rgba(255,255,255,0.9)', marginTop: 22, lineHeight: 1.3 }}>
              A little treat keeps TribePicks free, funds what’s next, and sends a slice to dog rescues.
            </span>
          </div>
          {DOG_DATA ? (
            <img src={DOG_DATA} width={300} height={300} style={{ borderRadius: 999, objectFit: 'cover', border: '10px solid rgba(255,255,255,0.95)' }} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 300, height: 300, borderRadius: 999, background: 'rgba(255,255,255,0.15)', fontSize: 150 }}>🐶</div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'center', fontSize: 29, color: 'rgba(255,255,255,0.8)' }}>
          15% to the RSPCA · no betting · tribepicks.com/feed
        </div>
      </div>
    ),
    { ...size, emoji: 'twemoji' },
  )
}
