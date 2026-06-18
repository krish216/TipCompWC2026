import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/sponsors/auth'
import { toSlug } from '@/lib/sponsors/campaigns'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/sponsors[?status=lead|active|archived] — admin: list sponsors.
export async function GET(request: NextRequest) {
  const { admin, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const status = new URL(request.url).searchParams.get('status')
  let q = (admin.from('sponsors') as any).select('*').order('created_at', { ascending: false })
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sponsors: data ?? [] })
}

// POST /api/sponsors — admin: create a sponsor. Generates a unique slug.
export async function POST(request: NextRequest) {
  const { admin, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const b = await request.json().catch(() => ({}))
  if (!b.name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })

  // Unique slug: base from name, then -2, -3, … on collision.
  const base = toSlug(b.name)
  let slug = base
  for (let n = 2; n < 100; n++) {
    const { data: clash } = await (admin.from('sponsors') as any).select('id').eq('slug', slug).maybeSingle()
    if (!clash) break
    slug = `${base}-${n}`
  }

  const now = new Date().toISOString()
  const { data, error } = await (admin.from('sponsors') as any).insert({
    slug,
    name:          b.name.trim(),
    contact_name:  b.contact_name?.trim()  || null,
    contact_email: b.contact_email?.trim() || null,
    phone:         b.phone?.trim()         || null,
    website_url:   b.website_url?.trim()   || null,
    logo_url:      b.logo_url?.trim()      || null,
    logo_tone:     b.logo_tone === 'light' ? 'light' : 'dark',
    status:        ['lead', 'active', 'archived'].includes(b.status) ? b.status : 'active',
    notes:         b.notes?.trim()         || null,
    created_at:    now,
    updated_at:    now,
  }).select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sponsor: data })
}
