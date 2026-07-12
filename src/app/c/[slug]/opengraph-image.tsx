import { ImageResponse } from 'next/og'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createAdminClient } from '@/lib/supabase'
import { resolveCompChief } from '@/lib/comp-chief'

export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Join this comp on TribePicks'

let LOGO_DATA = ''
try { LOGO_DATA = `data:image/png;base64,${readFileSync(join(process.cwd(), 'public', 'logo.png')).toString('base64')}` } catch { /* wordmark fallback */ }

// 1200×630 share card for a comp's public page — what WhatsApp / X / Facebook render when
// a Chief shares their /c/[slug] link. Makes every shared recruit link look compelling.
export default async function Image({ params }: { params: { slug: string } }) {
  const admin = createAdminClient()
  const { data: c } = await (admin.from('comps') as any)
    .select('name, prize_type, comp_category, team_affiliation, created_by, owner_name, user_comps(count)')
    .eq('slug', params.slug).maybeSingle()

  const compName = (c as any)?.name ?? 'Join the comp'
  const members  = (c as any)?.user_comps?.[0]?.count ?? 0
  const chief    = c ? await resolveCompChief(admin, c as any) : null
  const prize    = (c as any)?.prize_type
  const teamFans = (c as any)?.comp_category === 'team_fans' ? (c as any)?.team_affiliation : null

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: 'linear-gradient(160deg,#047857 0%,#064e3b 52%,#022c22 100%)', color: 'white', padding: '56px 64px' }}>

        {/* Brand + kicker */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.96)', borderRadius: 999, padding: '9px 22px 9px 12px' }}>
            {LOGO_DATA ? <img src={LOGO_DATA} width={44} height={44} style={{ objectFit: 'contain' }} /> : null}
            <span style={{ fontSize: 30, fontWeight: 800, color: '#065f46', letterSpacing: -0.5 }}>TribePicks</span>
          </div>
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: 3, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>You're invited</span>
        </div>

        {/* Hero — comp name + chief */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 30, fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>Join the comp</span>
          <span style={{ fontSize: 82, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05, marginTop: 8 }}>{compName}</span>
          {chief && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 26 }}>
              <span style={{ fontSize: 34 }}>🧑‍✈️</span>
              <span style={{ fontSize: 34, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>Run by {chief.name}</span>
              {chief.verified && <span style={{ fontSize: 30, color: '#6ee7b7', fontWeight: 800 }}>✔</span>}
            </div>
          )}
        </div>

        {/* Chips + CTA */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.12)', borderRadius: 999, padding: '12px 26px', fontSize: 28, fontWeight: 700 }}>{members} tipster{members === 1 ? '' : 's'}</div>
            {teamFans && <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.12)', borderRadius: 999, padding: '12px 26px', fontSize: 28, fontWeight: 700 }}>⚽ {teamFans} fans</div>}
            {prize === 'pool' && <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(251,191,36,0.22)', borderRadius: 999, padding: '12px 26px', fontSize: 28, fontWeight: 700 }}>💰 Pool prize</div>}
            {prize === 'chief_offers' && <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(168,85,247,0.22)', borderRadius: 999, padding: '12px 26px', fontSize: 28, fontWeight: 700 }}>🎁 Prize offered</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', background: '#6ee7b7', color: '#022c22', borderRadius: 999, padding: '16px 34px', fontSize: 30, fontWeight: 800 }}>Join free →</div>
        </div>
      </div>
    ),
    { ...size }
  )
}
