import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { createNotifications } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

const MIN_MEMBERS = 4

// POST /api/admin/post-round-debrief { round?: 'gs1' }
// Global-admin action: post the satirical Round Debrief link into every eligible
// tribe's chat (≥4 members) for the active tournament, once the round is fully
// scored. Idempotent per round per tribe (skips tribes already posted to).
export async function POST(request: NextRequest) {
  const admin = createAdminClient()
  const user  = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: ga } = await (admin.from('admin_users') as any).select('user_id').eq('user_id', user.id).maybeSingle()
  if (!ga) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const round = (await request.json().catch(() => ({})))?.round || 'gs1'
  const origin = new URL(request.url).origin

  // Active tournament
  const { data: t } = await (admin.from('tournaments') as any).select('id').eq('is_active', true).maybeSingle()
  const tournId = (t as any)?.id
  if (!tournId) return NextResponse.json({ error: 'No active tournament' }, { status: 400 })

  // Round must be fully scored
  const { data: fx } = await (admin.from('fixtures') as any).select('home_score').eq('tournament_id', tournId).eq('round', round)
  const fixtures = (fx ?? []) as any[]
  if (!fixtures.length || !fixtures.every(f => f.home_score != null)) {
    return NextResponse.json({ error: `${round} isn't fully scored yet — wait until all matches are in.` }, { status: 409 })
  }

  // Eligible tribes for this tournament
  const { data: tribes } = await (admin.from('tribes') as any).select('id, name').eq('tournament_id', tournId)
  let posted = 0, notified = 0, skipped = 0

  for (const tribe of (tribes ?? []) as any[]) {
    // Member ids (union of tribe_members + users.tribe_id)
    const [{ data: tm }, { data: us }] = await Promise.all([
      (admin.from('tribe_members') as any).select('user_id').eq('tribe_id', tribe.id),
      (admin.from('users') as any).select('id').eq('tribe_id', tribe.id),
    ])
    const ids = new Set<string>()
    ;(tm ?? []).forEach((r: any) => r.user_id && ids.add(r.user_id))
    ;(us ?? []).forEach((r: any) => r.id && ids.add(r.id))
    if (ids.size < MIN_MEMBERS) { skipped++; continue }

    const link = `${origin}/tribe/round-debrief?tribe_id=${tribe.id}&round=${round}`

    // Dedupe: skip if this tribe's chat already has the debrief link for this round.
    const { data: existing } = await (admin.from('chat_messages') as any)
      .select('id').eq('tribe_id', tribe.id).eq('is_system', true).ilike('content', `%round=${round}%round-debrief%`).limit(1)
    // (the ilike is best-effort; also match the plain link)
    const { data: existing2 } = await (admin.from('chat_messages') as any)
      .select('id').eq('tribe_id', tribe.id).eq('is_system', true).ilike('content', `%/tribe/round-debrief%${round}%`).limit(1)
    if ((existing as any[])?.length || (existing2 as any[])?.length) { skipped++; continue }

    const content = `🕵️ The Round Debrief is in 👀 (members only) — who bagged the Wooden Spoon? 🥄\n${link}`
    const { error } = await (admin.from('chat_messages') as any)
      .insert({ tribe_id: tribe.id, user_id: null, is_system: true, content, round_code: null })
    if (error) { skipped++; continue }
    posted++

    await createNotifications([...ids].map(uid => ({
      user_id: uid,
      type:    'round_complete' as const,
      title:   '🕵️ Round debrief is in',
      body:    'See who topped the tribe — and who got the Wooden Spoon 🥄. Tap to open your tribe chat.',
      data:    { href: '/tribe?tab=chat', tribe_id: tribe.id },
    })))
    notified += ids.size
  }

  return NextResponse.json({ ok: true, posted, notified, skipped })
}
