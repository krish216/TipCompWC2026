import { ImageResponse } from 'next/og'
import { readFileSync } from 'fs'
import { join } from 'path'

export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = "Quiz: What's the biggest problem facing Australia right now?"

// Embed the logo once as a data URI — no network fetch at render time.
let LOGO_DATA = ''
try { LOGO_DATA = `data:image/png;base64,${readFileSync(join(process.cwd(), 'public', 'logo.png')).toString('base64')}` } catch { /* fall back to wordmark */ }

// 1200×630 card for the /quiz/australia link on WhatsApp / X / Facebook. Shows four of the
// five answers and teases "one more" — the fifth (the Melbourne Cup) is the punchline, so it
// never appears here.
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
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: 3, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Quick quiz · 1 question</span>
        </div>

        {/* Question */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <span style={{ fontSize: 76, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05 }}>What's the biggest problem</span>
          <span style={{ fontSize: 76, fontWeight: 800, letterSpacing: -2, lineHeight: 1.1, color: '#6ee7b7' }}>facing Australia right now?</span>
        </div>

        {/* Four of the answers + the tease */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
          {['Cost of living', 'Housing', 'The economy', 'Crime'].map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.12)', borderRadius: 999, padding: '14px 26px', fontSize: 28, fontWeight: 700 }}>{t}</div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', border: '2px dashed rgba(255,255,255,0.5)', borderRadius: 999, padding: '12px 24px', fontSize: 28, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>+1 more…</div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'center', fontSize: 30, color: 'rgba(255,255,255,0.75)' }}>
          Bet you get it wrong · tribepicks.com/quiz/australia
        </div>
      </div>
    ),
    size,
  )
}
