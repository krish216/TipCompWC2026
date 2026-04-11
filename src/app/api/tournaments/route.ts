import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/tournaments — list all tournaments
export async function GET() {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('tournaments')
    .select('id, name, description, slug, status, start_date, end_date, logo_url, created_at')
    .order('start_date', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// POST /api/tournaments — tournament admin creates a tournament
export async function POST(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: isAdmin } = await adminClient
    .from('admin_users').select('user_id').eq('user_id', user.id).single()
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name, description, slug, start_date, end_date } = await request.json()
  if (!name?.trim() || !slug?.trim()) {
    return NextResponse.json({ error: 'name and slug required' }, { status: 400 })
  }

  const { data, error } = await (adminClient.from('tournaments') as any).insert({
    name:        name.trim(),
    description: description?.trim() || null,
    slug:        slug.trim().toLowerCase().replace(/\s+/g, '-'),
    start_date:  start_date || null,
    end_date:    end_date   || null,
    status:      'upcoming',
    created_by:  user.id,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}

// PATCH /api/tournaments — update tournament (status, dates, active)
export async function PATCH(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: isAdmin } = await adminClient
    .from('admin_users').select('user_id').eq('user_id', user.id).single()
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, name, description, status, start_date, end_date, set_active } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const updates: any = {}
  if (name        !== undefined) updates.name        = name
  if (description !== undefined) updates.description = description
  if (status      !== undefined) updates.status      = status
  if (start_date  !== undefined) updates.start_date  = start_date
  if (end_date    !== undefined) updates.end_date    = end_date

  if (Object.keys(updates).length > 0) {
    const { error } = await (adminClient.from('tournaments') as any)
      .update(updates).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Set as active tournament in app_settings
  if (set_active) {
    await (adminClient.from('app_settings') as any)
      .upsert({ key: 'active_tournament_id', value: id })
  }

  return NextResponse.json({ success: true })
}
