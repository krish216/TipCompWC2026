import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/org-prizes?org_id= — get prizes for an org
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const orgId = new URL(request.url).searchParams.get('org_id')
  if (!orgId) return NextResponse.json({ error: 'org_id required' }, { status: 400 })

  const { data, error } = await supabase
    .from('org_prizes').select('*').eq('org_id', orgId).order('place')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// POST /api/org-prizes — org admin sets prizes
export async function POST(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { org_id, place, description, sponsor } = await request.json()
  if (!org_id || !place || !description?.trim()) {
    return NextResponse.json({ error: 'org_id, place and description required' }, { status: 400 })
  }

  const { data: isOrgAdmin } = await (adminClient.from('org_admins') as any)
    .select('user_id').eq('user_id', user.id).eq('org_id', org_id).single()
  if (!isOrgAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await (adminClient.from('org_prizes') as any)
    .upsert({ org_id, place, description: description.trim(), sponsor: sponsor?.trim() || null },
            { onConflict: 'org_id,place' })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}

// DELETE /api/org-prizes?org_id=&place=
export async function DELETE(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const org_id = searchParams.get('org_id')
  const place  = searchParams.get('place')
  if (!org_id || !place) return NextResponse.json({ error: 'org_id and place required' }, { status: 400 })

  await (adminClient.from('org_prizes') as any).delete().eq('org_id', org_id).eq('place', parseInt(place))
  return NextResponse.json({ success: true })
}
