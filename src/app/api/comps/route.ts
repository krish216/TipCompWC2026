import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { z } from 'zod'

const CreateOrgSchema = z.object({
  name: z.string().min(2).max(80).trim(),
})

// GET /api/comps?code=XXXX            — look up org by invite code
// GET /api/comps?tournament_id=XXX    — list orgs for a tournament (any authenticated user)
// GET /api/comps                      — list all orgs (tournament admin only)
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { searchParams } = new URL(request.url)
  const code          = searchParams.get('code')?.trim().toUpperCase()
  const tournament_id = searchParams.get('tournament_id')

  if (code) {
    const { data, error } = await supabase
      .from('comps')
      .select('id, name, slug, invite_code, logo_url, tournament_id')
      .eq('invite_code', code)
      .neq('slug', 'public')
      .single()
    if (error || !data) return NextResponse.json({ error: 'Invalid comp code' }, { status: 404 })
    return NextResponse.json({ data })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (tournament_id) {
    // Any authenticated user can list orgs for a specific tournament
    // (used on tribe page to let players join/create an org for their active tournament)
    const { data, error } = await supabase
      .from('comps')
      .select('id, name, slug, invite_code, logo_url, tournament_id, app_name')
      .eq('tournament_id', tournament_id)
      .neq('slug', 'public')
      .order('name')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data ?? [] })
  }

  // Full list — tournament admin only
  const adminClient = createAdminClient()
  const { data: isAdmin } = await adminClient
    .from('admin_users').select('user_id').eq('user_id', user.id).single()
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabase
    .from('comps')
    .select('id, name, slug, invite_code, tournament_id')
    .neq('slug', 'public')
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// POST /api/comps — create a new org (tournament admin only)
export async function POST(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: isAdmin } = await adminClient
    .from('admin_users').select('user_id').eq('user_id', user.id).single()
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body   = await request.json().catch(() => null)
  const parsed = CreateOrgSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Comp name required' }, { status: 422 })

  const { name } = parsed.data
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const inviteCode = Math.random().toString(36).substring(2, 6).toUpperCase() +
                     Math.random().toString(36).substring(2, 6).toUpperCase()

  const { data: org, error } = await (adminClient.from('comps') as any)
    .insert({ name, slug, invite_code: inviteCode, created_by: user.id })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: org }, { status: 201 })
}
