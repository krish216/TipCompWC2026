import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/sponsors/auth'
import { challengeTeamImagePath, CHALLENGE_IMAGE_BUCKET } from '@/lib/match/storage'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// POST /api/match/challenges/:id/team-image?side=home|away  (multipart: file) — admin.
// Uploads a custom team visual for a challenge to the public org-logos bucket (upsert,
// so re-uploads overwrite cleanly) and stores the cache-busted public URL on the
// challenge's home_image_url / away_image_url.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { admin, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const side = new URL(request.url).searchParams.get('side')
  if (side !== 'home' && side !== 'away') return NextResponse.json({ error: 'side must be home|away' }, { status: 400 })

  const { data: challenge } = await (admin.from('challenges') as any).select('slug').eq('id', params.id).maybeSingle()
  if (!challenge) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const form = await request.formData()
  const file = form.get('file') as File | null
  if (!file)                       return NextResponse.json({ error: 'file required' }, { status: 400 })
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'Image must be under 5 MB' }, { status: 400 })

  const ext  = (file.name.split('.').pop() || file.type.split('/').pop() || 'png')
  const path = challengeTeamImagePath((challenge as any).slug, side, ext)
  const buf  = new Uint8Array(await file.arrayBuffer())

  const { error: upErr } = await admin.storage.from(CHALLENGE_IMAGE_BUCKET)
    .upload(path, buf, { upsert: true, contentType: file.type || undefined })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: pub } = admin.storage.from(CHALLENGE_IMAGE_BUCKET).getPublicUrl(path)
  const url = `${pub.publicUrl}?v=${Date.now()}`   // bust CDN cache on overwrite
  const col = side === 'home' ? 'home_image_url' : 'away_image_url'
  const { error: updErr } = await (admin.from('challenges') as any).update({ [col]: url }).eq('id', params.id)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ url, side })
}
