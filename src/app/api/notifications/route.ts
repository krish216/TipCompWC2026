import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/notifications
// Returns the authenticated user's 30 most recent notifications,
// unread first then newest-first. Includes total unread count.
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient()

  const { data, error } = await (supabase.from('notifications') as any)
    .select('id, type, title, body, data, read_at, created_at')
    .eq('user_id', user.id)
    .order('read_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) {
    console.error('[notifications] fetch failed:', error.message)
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }

  const unread_count = (data as any[]).filter((n: any) => !n.read_at).length

  return NextResponse.json({ data, unread_count })
}

// POST /api/notifications/mark-read
// Body: { ids?: string[] }
// If ids is omitted or empty, marks ALL unread notifications as read.
// If ids is provided, marks only those specific notifications as read.
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const ids: string[] | undefined = Array.isArray(body?.ids) && body.ids.length > 0
    ? body.ids
    : undefined

  const admin = createAdminClient()
  const now   = new Date().toISOString()

  let query = (admin.from('notifications') as any)
    .update({ read_at: now })
    .eq('user_id', user.id)
    .is('read_at', null)

  if (ids) query = query.in('id', ids)

  const { error } = await query

  if (error) {
    console.error('[notifications] mark-read failed:', error.message)
    return NextResponse.json({ error: 'Failed to mark notifications as read' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
