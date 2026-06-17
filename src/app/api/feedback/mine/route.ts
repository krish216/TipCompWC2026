import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Resolve the caller from a bearer token (preferred — always fresh) or cookie session.
async function resolveUser(request: NextRequest): Promise<string | null> {
  const admin = createAdminClient()
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (token) {
    const { data: { user } } = await admin.auth.getUser(token)
    return user?.id ?? null
  }
  const user = await getSessionUser().catch(() => null)
  return user?.id ?? null
}

// GET /api/feedback/mine — the caller's own feedback items + any admin reply,
// so they can see responses to THEIR feedback (not just the public wall) and rate them.
export async function GET(request: NextRequest) {
  const userId = await resolveUser(request)
  if (!userId) return NextResponse.json({ items: [] }, { status: 401, headers: { 'Cache-Control': 'no-store' } })

  const admin = createAdminClient()
  const { data, error } = await (admin.from('feedback') as any)
    .select('id, category, message, created_at, admin_response, response_at, response_rating')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ items: [], error: error.message }, { headers: { 'Cache-Control': 'no-store' } })

  return NextResponse.json({ items: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}

// PATCH /api/feedback/mine — the submitter rates the admin reply to their own item.
// Body: { id, rating: 'up' | 'down' | null }
export async function PATCH(request: NextRequest) {
  const userId = await resolveUser(request)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, rating } = await request.json().catch(() => ({} as any))
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (rating !== null && rating !== 'up' && rating !== 'down')
    return NextResponse.json({ error: 'rating must be up, down, or null' }, { status: 400 })

  const admin = createAdminClient()
  // Only the owner can rate, and only once there's a reply to rate.
  const { data: row } = await (admin.from('feedback') as any)
    .select('user_id, admin_response').eq('id', id).maybeSingle()
  if (!row || (row as any).user_id !== userId)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(row as any).admin_response)
    return NextResponse.json({ error: 'No response to rate yet' }, { status: 400 })

  const { error } = await (admin.from('feedback') as any)
    .update({ response_rating: rating, rated_at: rating ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
