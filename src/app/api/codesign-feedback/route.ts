import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const REACTIONS = new Set(['love', 'good', 'needs_work'])

// GET /api/codesign-feedback — the signed-in user's feedback across all guide items,
// keyed by item_key, so the /epl/guide cards can prefill.
export async function GET() {
  const user = await getSessionUser().catch(() => null)
  if (!user) return NextResponse.json({ feedback: {} })
  const admin = createAdminClient()
  const { data } = await (admin.from('codesign_feedback') as any)
    .select('item_key, reaction, comment').eq('user_id', user.id)
  const feedback: Record<string, { reaction: string | null; comment: string | null }> = {}
  for (const r of (data ?? []) as any[]) feedback[r.item_key] = { reaction: r.reaction ?? null, comment: r.comment ?? null }
  return NextResponse.json({ feedback })
}

// POST /api/codesign-feedback — upsert this user's feedback on one item.
// Body: { item_key, reaction?: 'love'|'good'|'needs_work', comment?: string }
// Clearing both reaction and comment deletes the row.
export async function POST(request: NextRequest) {
  const user = await getSessionUser().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })

  const b = await request.json().catch(() => ({}))
  const itemKey = typeof b.item_key === 'string' ? b.item_key.trim().slice(0, 80) : ''
  if (!itemKey) return NextResponse.json({ error: 'Missing item.' }, { status: 400 })
  const reaction = REACTIONS.has(b.reaction) ? b.reaction : null
  const comment = typeof b.comment === 'string' ? b.comment.trim().slice(0, 1000) || null : null

  const admin = createAdminClient()

  if (!reaction && !comment) {
    await (admin.from('codesign_feedback') as any).delete().eq('user_id', user.id).eq('item_key', itemKey)
    return NextResponse.json({ ok: true, reaction: null, comment: null })
  }

  const { error } = await (admin.from('codesign_feedback') as any).upsert(
    { user_id: user.id, item_key: itemKey, reaction, comment, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,item_key' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, reaction, comment })
}
