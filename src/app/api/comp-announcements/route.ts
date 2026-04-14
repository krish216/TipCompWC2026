import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/announcements — public org announcements (shown to PUBLIC org members)
export async function GET() {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('org_announcements')
    .select('id, title, body, created_at, organisations(name, logo_url)')
    .eq('published', true)
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: (data ?? []) as any[] })
}

// POST /api/announcements — org admin posts announcement
export async function POST(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { org_id, title, body } = await request.json()
  if (!org_id || !title?.trim() || !body?.trim()) {
    return NextResponse.json({ error: 'org_id, title and body required' }, { status: 400 })
  }

  const { data: isOrgAdmin } = await (adminClient.from('org_admins') as any)
    .select('user_id').eq('user_id', user.id).eq('org_id', org_id).single()
  if (!isOrgAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await (adminClient.from('org_announcements') as any)
    .insert({ org_id, author_id: user.id, title: title.trim(), body: body.trim() })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}

// DELETE /api/announcements?id= — org admin deletes
export async function DELETE(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await (adminClient.from('org_announcements') as any).delete().eq('id', id).eq('author_id', user.id)
  return NextResponse.json({ success: true })
}
