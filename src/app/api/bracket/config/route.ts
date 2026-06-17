import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Bracket Challenge co-branding, stored as app_settings rows (admin-editable, no
// deploy). enabled=false → the bracket runs TribePicks-only (no sponsor shown).
const KEYS = {
  enabled:      'bracket_sponsor_enabled',
  sponsor_name: 'bracket_sponsor_name',
  sponsor_logo: 'bracket_sponsor_logo',
  prize:        'bracket_prize',
  sponsor_url:  'bracket_sponsor_url',
  logo_tone:    'bracket_sponsor_logo_tone',   // 'dark' | 'light' — drives backing per surface
} as const

export async function GET() {
  const admin = createAdminClient()
  const { data } = await (admin.from('app_settings') as any).select('key, value').in('key', Object.values(KEYS))
  const m: Record<string, string> = {}
  ;((data ?? []) as any[]).forEach(r => { m[r.key] = r.value })
  return NextResponse.json({
    enabled:      m[KEYS.enabled] === 'on',
    sponsor_name: m[KEYS.sponsor_name] ?? '',
    sponsor_logo: m[KEYS.sponsor_logo] ?? '',
    prize:        m[KEYS.prize] ?? '',
    sponsor_url:  m[KEYS.sponsor_url] ?? '',
    logo_tone:    m[KEYS.logo_tone] === 'light' ? 'light' : 'dark',
  })
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
