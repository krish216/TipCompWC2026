import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/comp-prizes?comp_id= — get prizes for an org
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const compId = new URL(request.url).searchParams.get('comp_id')
  if (!compId) return NextResponse.json({ error: 'comp_id required' }, { status: 400 })

  const { data, error } = await supabase
    .from('comp_prizes').select('*').eq('comp_id', compId).order('place')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// POST /api/comp-prizes — org admin sets prizes
export async function POST(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { comp_id, place, description, sponsor } = await request.json()
  if (!comp_id || !place || !description?.trim()) {
    return NextResponse.json({ error: 'comp_id, place and description required' }, { status: 400 })
  }

  const { data: isCompAdmin } = await (adminClient.from('comp_admins') as any)
    .select('user_id').eq('user_id', user.id).eq('comp_id', comp_id).single()
  if (!isCompAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await (adminClient.from('comp_prizes') as any)
    .upsert({ comp_id, place, description: description.trim(), sponsor: sponsor?.trim() || null },
            { onConflict: 'comp_id,place' })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}

// DELETE /api/comp-prizes?comp_id=&place=
export async function DELETE(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const comp_id = searchParams.get('comp_id')
  const place  = searchParams.get('place')
  if (!comp_id || !place) return NextResponse.json({ error: 'comp_id and place required' }, { status: 400 })

  await (adminClient.from('comp_prizes') as any).delete().eq('comp_id', comp_id).eq('place', parseInt(place))
  return NextResponse.json({ success: true })
}
