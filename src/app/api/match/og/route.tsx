import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { resolveActiveCampaign } from '@/lib/sponsors/resolver'
import { resolveMatchChallenge, getFixture } from '@/lib/match/challenge'
import { flagFor } from '@/lib/team-flags'
import { readFileSync } from 'fs'
import { join } from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Embed the logo once as a data URI — no network fetch at render time.
let LOGO_DATA = ''
try { LOGO_DATA = `data:image/png;base64,${readFileSync(join(process.cwd(), 'public', 'logo.png')).toString('base64')}` } catch { /* fall back to wordmark */ }

// GET /api/match/og?slug=<match-challenge-slug>
// A 1200×630 shareable link-preview card for a single-match challenge — teams +
// flags, sponsor + prize, and the "pick the score" hook. Referenced by
// matchMetadata() so WhatsApp/iMessage/Slack/Facebook render a rich card. Falls back
// to a generic TribePicks card if the slug can't be resolved.
export async function GET(request: NextRequest) {
  const slug = new URL(request.url).searchParams.get('slug') || ''

  let home = '', away = '', homeFlag = '⚽', awayFlag = '⚽'
  let homeImg = '', awayImg = ''
  let sponsor = '', prize = '', challengeName = 'Match Challenge'
  try {
    const admin = createAdminClient()
    const challenge = await resolveMatchChallenge(admin, slug)
    if (challenge) {
      challengeName = challenge.name || challengeName
      homeImg = challenge.home_image_url || ''
      awayImg = challenge.away_image_url || ''
      const fixture = challenge.fixture_id ? await getFixture(admin, challenge.fixture_id) : null
      if (fixture) {
        home = fixture.home; away = fixture.away
        homeFlag = flagFor(fixture.home) || '⚽'
        awayFlag = flagFor(fixture.away) || '⚽'
      }
      const cfg = await resolveActiveCampaign(admin, { challengeType: 'match', challengeId: challenge.id })
      if (cfg.enabled) {
        // Ignore the house "TribePicks" fallback so unsponsored matches don't imply a sponsor.
        const name = cfg.sponsor_name || ''
        sponsor = name.trim().toLowerCase() === 'tribepicks' ? '' : name
        prize = cfg.prize || ''
      }
    }
  } catch { /* fall through to generic card */ }

  const matchLabel = home && away ? `${home} v ${away}` : 'Pick the score'

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: 'linear-gradient(160deg, #047857 0%, #064e3b 52%, #022c22 100%)', color: 'white', padding: '56px 64px' }}>

        {/* Brand chip + "pick the score" kicker */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.96)', borderRadius: 999, padding: '9px 22px 9px 12px' }}>
            {LOGO_DATA ? <img src={LOGO_DATA} width={44} height={44} style={{ objectFit: 'contain' }} /> : null}
            <span style={{ fontSize: 30, fontWeight: 800, color: '#065f46', letterSpacing: -0.5 }}>TribePicks</span>
          </div>
          <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: 3, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>🎯 Pick the Score</span>
        </div>

        {/* Hero — teams, flags, and a blank scoreline motif */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
            {homeImg
              ? <img src={homeImg} width={150} height={120} style={{ objectFit: 'cover', borderRadius: 18 }} />
              : <span style={{ fontSize: 110 }}>{homeFlag}</span>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 22, background: 'rgba(255,255,255,0.12)', borderRadius: 28, padding: '14px 34px' }}>
              <span style={{ fontSize: 76, fontWeight: 800 }}>?</span>
              <span style={{ fontSize: 56, fontWeight: 700, color: 'rgba(255,255,255,0.55)' }}>–</span>
              <span style={{ fontSize: 76, fontWeight: 800 }}>?</span>
            </div>
            {awayImg
              ? <img src={awayImg} width={150} height={120} style={{ objectFit: 'cover', borderRadius: 18 }} />
              : <span style={{ fontSize: 110 }}>{awayFlag}</span>}
          </div>
          <span style={{ fontSize: 60, fontWeight: 800, letterSpacing: -1, marginTop: 30, textAlign: 'center' }}>{matchLabel}</span>
        </div>

        {/* Prize badge when there's a real prize; else the sponsor host line; else free hook */}
        {prize ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, background: 'rgba(251,191,36,0.15)', border: '2px solid rgba(251,191,36,0.55)', borderRadius: 999, padding: '18px 34px', alignSelf: 'center' }}>
            <span style={{ fontSize: 34 }}>🏆</span>
            <span style={{ fontSize: 34, fontWeight: 700 }}>Win {prize}{sponsor ? ` · ${sponsor}` : ''}</span>
          </div>
        ) : sponsor ? (
          <div style={{ display: 'flex', justifyContent: 'center', fontSize: 34, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>🤝 Hosted by {sponsor}</div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', fontSize: 34, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>Free to play — climb the leaderboard</div>
        )}

        {/* Footer CTA */}
        <div style={{ display: 'flex', justifyContent: 'center', fontSize: 30, color: 'rgba(255,255,255,0.75)' }}>
          Free · locks 5 min before kick-off · tribepicks.com
        </div>
      </div>
    ),
    { width: 1200, height: 630, emoji: 'twemoji' },
  )
}
