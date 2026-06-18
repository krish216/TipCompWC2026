import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/sponsors/auth'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const EDITABLE = ['prize', 'click_url', 'logo_tone', 'starts_at', 'ends_at', 'enabled'] as const

// PATCH /api/sponsors/campaigns/:id — admin: update a campaign.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { admin, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const b = await request.json().catch(() => ({}))
  const patch: Record<string, any> = { updated_at: new Date().toISOString() }
  for (const k of EDITABLE) {
    if (!(k in b)) continue
    if (k === 'logo_tone')   patch[k] = b[k] === 'light' ? 'light' : (b[k] === 'dark' ? 'dark' : null)
    else if (k === 'enabled') patch[k] = b[k] !== false
    else if (k === 'starts_at' || k === 'ends_at') patch[k] = b[k] || null
    else patch[k] = typeof b[k] === 'string' ? (b[k].trim() || null) : b[k]
  }

  const { data, error } = await (admin.from('sponsor_campaigns') as any)
    .update(patch).eq('id', params.id)
    .select('*, sponsors(id, name, slug), challenges(type, name, tournament_id)').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ campaign: data })
}

// DELETE /api/sponsors/campaigns/:id — admin: remove a campaign.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { admin, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await (admin.from('sponsor_campaigns') as any).delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
