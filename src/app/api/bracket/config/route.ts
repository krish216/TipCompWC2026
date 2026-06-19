import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { resolveActiveCampaign } from '@/lib/sponsors/resolver'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Bracket Challenge co-branding. READS now resolve the active campaign from the
// Sponsor Campaigns module (with a legacy app_settings fallback baked into the
// resolver), so the bracket header/insert auto on/off with the campaign window.
// The legacy app_settings WRITE (POST) below remains for the old admin card until
// the Sponsor Campaigns admin UI (Phase 2) replaces it.
const KEYS = {
  enabled:      'bracket_sponsor_enabled',
  sponsor_name: 'bracket_sponsor_name',
  sponsor_logo: 'bracket_sponsor_logo',
  prize:        'bracket_prize',
  sponsor_url:  'bracket_sponsor_url',
  logo_tone:    'bracket_sponsor_logo_tone',   // 'dark' | 'light' — drives backing per surface
} as const

export async function GET(request: NextRequest) {
  const admin = createAdminClient()
  // ?challenge=<slug> resolves that specific bracket challenge's sponsor; absent,
  // the resolver falls back to the tournament's default bracket challenge.
  const slug = new URL(request.url).searchParams.get('challenge')
  const cfg = await resolveActiveCampaign(admin, { challengeType: 'bracket', slug })
  return NextResponse.json(cfg)
}

export async function POST(request: NextRequest) {
  const admin = createAdminClient()
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: isAdmin } = await admin.from('admin_users').select('user_id').eq('user_id', user.id).single()
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const b = await request.json().catch(() => ({}))
  const now = new Date().toISOString()
  const rows = [
    { key: KEYS.enabled,      value: b.enabled ? 'on' : 'off' },
    { key: KEYS.sponsor_name, value: String(b.sponsor_name ?? '').trim() },
    { key: KEYS.sponsor_logo, value: String(b.sponsor_logo ?? '').trim() },
    { key: KEYS.prize,        value: String(b.prize ?? '').trim() },
    { key: KEYS.sponsor_url,  value: String(b.sponsor_url ?? '').trim() },
    { key: KEYS.logo_tone,    value: b.logo_tone === 'light' ? 'light' : 'dark' },
  ].map(r => ({ ...r, updated_at: now }))

  const { error } = await (admin.from('app_settings') as any).upsert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
