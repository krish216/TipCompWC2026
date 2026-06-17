import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'
import { createNotifications } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

async function resolveAdmin(request: NextRequest) {
  const admin = createAdminClient()
  let userId: string | null = null

  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (token) {
    const { data: { user } } = await admin.auth.getUser(token)
    userId = user?.id ?? null
  } else {
    const user = await getSessionUser()
    userId = user?.id ?? null
  }

  if (!userId) return null
  const { data } = await (admin.from('admin_users') as any).select('user_id').eq('user_id', userId).maybeSingle()
  return data ? userId : null
}

// GET /api/admin/feedback — list all feedback with optional filter
export async function GET(request: NextRequest) {
  const callerId = await resolveAdmin(request)
  if (!callerId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const filter = searchParams.get('filter') ?? 'all' // all | responded | unresponded
  const category = searchParams.get('category') ?? 'all'

  const admin = createAdminClient()
  const build = (cols: string) => {
    let q = (admin.from('feedback') as any).select(cols).order('created_at', { ascending: false })
    if (filter === 'responded')   q = q.not('admin_response', 'is', null)
    if (filter === 'unresponded') q = q.is('admin_response', null)
    if (category !== 'all')       q = q.eq('category', category)
    return q
  }

  // Try with the rating columns (migration 118); fall back if not applied yet.
  let { data, error } = await build('id, user_id, category, message, page_url, contact_email, created_at, admin_response, response_at, show_response, helpful_count, response_rating')
  if (error) ({ data, error } = await build('id, user_id, category, message, page_url, contact_email, created_at, admin_response, response_at, show_response'))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Resolve emails for logged-in submitters
  const userIds = [...new Set((data as any[]).map((r: any) => r.user_id).filter(Boolean))]
  let emailMap: Record<string, string> = {}
  if (userIds.length) {
    const { data: users } = await (admin.from('users') as any)
      .select('id, email').in('id', userIds)
    for (const u of (users ?? []) as any[]) emailMap[u.id] = u.email
  }

  const items = (data as any[]).map((r: any) => ({
    ...r,
    user_email: r.user_id ? (emailMap[r.user_id] ?? null) : null,
  }))

  return NextResponse.json({ items })
}

// PATCH /api/admin/feedback — save response and/or toggle show_response
export async function PATCH(request: NextRequest) {
  const callerId = await resolveAdmin(request)
  if (!callerId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const { id, admin_response, show_response } = body ?? {}
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const update: Record<string, any> = { show_response: !!show_response }
  if (admin_response !== undefined) {
    update.admin_response = admin_response?.trim() || null
    update.response_at    = admin_response?.trim() ? new Date().toISOString() : null
    update.responded_by   = admin_response?.trim() ? callerId : null
  }

  const admin = createAdminClient()

  // Snapshot the prior state so we only notify on the FIRST reply (not edits).
  const { data: existing } = await (admin.from('feedback') as any)
    .select('user_id, admin_response').eq('id', id).maybeSingle()

  const { error } = await (admin.from('feedback') as any).update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // "We replied to your feedback" — bell notification to the submitter the first
  // time a response is written. Guests (no user_id) can't be notified in-app.
  const newResp = update.admin_response as string | null | undefined
  if (newResp && existing && !(existing as any).admin_response && (existing as any).user_id) {
    await createNotifications({
      user_id: (existing as any).user_id,
      type:    'feedback_reply',
      title:   'We replied to your feedback',
      body:    newResp.length > 90 ? `${newResp.slice(0, 90)}…` : newResp,
      data:    { href: '/?feedback=1', feedback_id: id },
    })
  }

  return NextResponse.json({ ok: true })
}
