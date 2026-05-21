import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// GET /api/tournament-announcements?tournament_id=xxx
// Public — returns the most recent active announcements for a tournament.
export async function GET(request: NextRequest) {
  const tournamentId = request.nextUrl.searchParams.get('tournament_id')
  if (!tournamentId) return NextResponse.json({ error: 'tournament_id required' }, { status: 400 })

  const adminClient = createAdminClient()
  const { data, error } = await (adminClient.from('tournament_announcements') as any)
    .select('id, title, body, created_at')
    .eq('tournament_id', tournamentId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// POST /api/tournament-announcements — tournament admin creates an announcement
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminClient = createAdminClient()

  // Verify tournament admin
  const { data: isAdmin } = await adminClient
    .from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { tournament_id, title, body } = await request.json().catch(() => ({}))
  if (!tournament_id || !title?.trim()) {
    return NextResponse.json({ error: 'tournament_id and title are required' }, { status: 422 })
  }

  const { data, error } = await (adminClient.from('tournament_announcements') as any)
    .insert({ tournament_id, title: title.trim(), body: body?.trim() || null, created_by: user.id })
    .select('id, title, body, created_at').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}

// DELETE /api/tournament-announcements?id=xxx — tournament admin removes an announcement
export async function DELETE(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const adminClient = createAdminClient()

  const { data: isAdmin } = await adminClient
    .from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await (adminClient.from('tournament_announcements') as any)
    .delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
