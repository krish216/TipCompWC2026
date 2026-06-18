import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/sponsors/auth'
import { sponsorLogoPath, SPONSOR_BUCKET } from '@/lib/sponsors/storage'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// POST /api/sponsors/:id/logo  (multipart: file) — admin.
// Uploads via the service-role client (bypasses storage RLS) to the sponsor's
// folder with upsert, so replacing a logo overwrites cleanly (no orphans), then
// stores the public URL (cache-busted) on the sponsor.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { admin, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: sponsor } = await (admin.from('sponsors') as any).select('slug').eq('id', params.id).maybeSingle()
  if (!sponsor) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const form = await request.formData()
  const file = form.get('file') as File | null
  if (!file)                          return NextResponse.json({ error: 'file required' }, { status: 400 })
  if (file.size > 5 * 1024 * 1024)    return NextResponse.json({ error: 'Logo must be under 5 MB' }, { status: 400 })

  const ext  = (file.name.split('.').pop() || file.type.split('/').pop() || 'png')
  const path = sponsorLogoPath((sponsor as any).slug, ext)
  const buf  = new Uint8Array(await file.arrayBuffer())

  const { error: upErr } = await admin.storage.from(SPONSOR_BUCKET)
    .upload(path, buf, { upsert: true, contentType: file.type || undefined })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: pub } = admin.storage.from(SPONSOR_BUCKET).getPublicUrl(path)
  const url = `${pub.publicUrl}?v=${Date.now()}`   // bust CDN cache on overwrite
  const { error: updErr } = await (admin.from('sponsors') as any)
    .update({ logo_url: url, updated_at: new Date().toISOString() }).eq('id', params.id)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ logo_url: url })
}
