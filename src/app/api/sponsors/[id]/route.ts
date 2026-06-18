import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/sponsors/auth'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/sponsors/:id — admin: one sponsor + its campaigns.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { admin, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: sponsor, error } = await (admin.from('sponsors') as any).select('*').eq('id', params.id).maybeSingle()
  if (error)    return NextResponse.json({ error: error.message }, { status: 500 })
  if (!sponsor) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: campaigns } = await (admin.from('sponsor_campaigns') as any)
    .select('*, challenges(type, name, tournament_id)').eq('sponsor_id', params.id)
    .order('starts_at', { ascending: false })

  return NextResponse.json({ sponsor, campaigns: campaigns ?? [] })
}

const EDITABLE = ['name', 'contact_name', 'contact_email', 'phone', 'website_url', 'logo_url', 'logo_tone', 'status', 'notes'] as const

// PATCH /api/sponsors/:id — admin: update editable fields.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { admin, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const b = await request.json().catch(() => ({}))
  const patch: Record<string, any> = { updated_at: new Date().toISOString() }
  for (const k of EDITABLE) {
    if (!(k in b)) continue
    if (k === 'logo_tone')  patch[k] = b[k] === 'light' ? 'light' : 'dark'
    else if (k === 'status') patch[k] = ['lead', 'active', 'archived'].includes(b[k]) ? b[k] : undefined
    else patch[k] = typeof b[k] === 'string' ? (b[k].trim() || null) : b[k]
  }

  const { data, error } = await (admin.from('sponsors') as any).update(patch).eq('id', params.id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sponsor: data })
}

// DELETE /api/sponsors/:id — admin: delete (cascades to its campaigns).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { admin, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await (admin.from('sponsors') as any).delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
