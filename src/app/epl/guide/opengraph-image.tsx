import { ImageResponse } from 'next/og'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createAdminClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'EPL Co-Design Crew — the lay of the land | TribePicks'

const EPL_SLUG = 'epl-2026-27'

// TribePicks wordmark — bundled, embedded once as a data URI (no network fetch).
let LOGO_DATA = ''
try { LOGO_DATA = `data:image/png;base64,${readFileSync(join(process.cwd(), 'public', 'logo.png')).toString('base64')}` } catch { /* fall back to wordmark */ }

// Pull the tournament's own crest from its logo_url (the org-logos bucket) — rather than
// bundling a copy — so the card always matches whatever's set on the tournaments row. Inlined
// as a data URI so the rendered image doesn't depend on a live fetch. Best-effort: on any
// failure the card falls back to a "Premier League" text kicker.
async function tournamentCrest(): Promise<string> {
  try {
    const admin = createAdminClient()
    const { data } = await (admin.from('tournaments') as any).select('logo_url').eq('slug', EPL_SLUG).maybeSingle()
    if (!data?.logo_url) return ''
    const res = await fetch(data.logo_url as string)
    if (!res.ok) return ''
    const ct = res.headers.get('content-type') || 'image/png'
    const buf = Buffer.from(await res.arrayBuffer())
    return `data:${ct};base64,${buf.toString('base64')}`
  } catch { return '' }
}

// 1200×630 shareable card for the EPL co-design brief — what WhatsApp renders when the
// /epl/guide link is dropped in the crew chat. Purple to match the guide's own hero, and
// crew-facing (not the public /epl marketing card it would otherwise inherit).
export default async function Image() {
  const CREST = await tournamentCrest()
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: 'linear-gradient(160deg,#2e1065 0%,#4c1d95 55%,#1e1b4b 100%)', color: 'white', padding: '56px 64px' }}>

        {/* TribePicks chip + tournament crest */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.96)', borderRadius: 999, padding: '9px 22px 9px 12px' }}>
            {LOGO_DATA ? <img src={LOGO_DATA} width={44} height={44} style={{ objectFit: 'contain' }} /> : null}
            <span style={{ fontSize: 30, fontWeight: 800, color: '#4c1d95', letterSpacing: -0.5 }}>TribePicks</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: 3, color: 'rgba(216,180,254,0.9)', textTransform: 'uppercase' }}>Co-Design</span>
            {CREST ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.96)', borderRadius: 20, padding: '8px 16px' }}>
                <img src={CREST} width={54} height={64} style={{ objectFit: 'contain' }} />
              </div>
            ) : (
              <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: 3, color: 'rgba(216,180,254,0.85)', textTransform: 'uppercase' }}>Premier League</span>
            )}
          </div>
        </div>

        {/* Hero */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <span style={{ fontSize: 82, fontWeight: 800, letterSpacing: -2, lineHeight: 1 }}>The lay of the land 🗺️</span>
          <span style={{ fontSize: 34, fontWeight: 600, color: 'rgba(255,255,255,0.82)', marginTop: 24, maxWidth: 900 }}>Help shape TribePicks&apos; Premier League — before it launches</span>
        </div>

        {/* The three buckets */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 18 }}>
          {['✅ Carries over', '🆕 New for EPL', '🗳️ Your call'].map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.12)', borderRadius: 999, padding: '14px 28px', fontSize: 30, fontWeight: 700 }}>{t}</div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'center', fontSize: 30, color: 'rgba(255,255,255,0.75)' }}>
          Co-design crew · tribepicks.com/epl/guide
        </div>
      </div>
    ),
    { ...size, emoji: 'twemoji' },
  )
}
