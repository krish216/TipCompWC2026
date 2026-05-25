import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

async function resolveAdmin() {
  const user = await getSessionUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data } = await (admin.from('admin_users') as any).select('user_id').eq('user_id', user.id).maybeSingle()
  return data ? user : null
}

// GET /api/admin/feedback — list all feedback with optional filter
export async function GET(request: NextRequest) {
  const caller = await resolveAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const filter = searchParams.get('filter') ?? 'all' // all | responded | unresponded
  const category = searchParams.get('category') ?? 'all'

  const admin = createAdminClient()
  let query = (admin.from('feedback') as any)
    .select('id, user_id, category, message, page_url, contact_email, created_at, admin_response, response_at, show_response')
    .order('created_at', { ascending: false })

  if (filter === 'responded')   query = query.not('admin_response', 'is', null)
  if (filter === 'unresponded') query = query.is('admin_response', null)
  if (category !== 'all')       query = query.eq('category', category)

  const { data, error } = await query
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
  const caller = await resolveAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const { id, admin_response, show_response } = body ?? {}
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const update: Record<string, any> = { show_response: !!show_response }
  if (admin_response !== undefined) {
    update.admin_response = admin_response?.trim() || null
    update.response_at    = admin_response?.trim() ? new Date().toISOString() : null
    update.responded_by   = admin_response?.trim() ? caller.id : null
  }

  const admin = createAdminClient()
  const { error } = await (admin.from('feedback') as any).update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
