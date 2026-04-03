import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { z } from 'zod'

const CreateTribeSchema = z.object({
  name: z.string().min(2).max(50).trim(),
})
const JoinTribeSchema = z.object({
  invite_code: z.string().length(8).toUpperCase(),
})

// GET /api/tribes — get current user's tribe + members
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase
    .from('users')
    .select('tribe_id')
    .eq('id', user.id)
    .single()

  if (!me?.tribe_id) return NextResponse.json({ data: null })

  const { data: tribe, error } = await supabase
    .from('tribes')
    .select(`
      id, name, invite_code, created_at,
      tribe_members(
        joined_at,
        users!inner(id, display_name, avatar_url)
      )
    `)
    .eq('id', me.tribe_id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: tribe })
}

// POST /api/tribes — create a new tribe
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = CreateTribeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid tribe name' }, { status: 422 })
  }

  // Check user isn't already in a tribe
  const { data: me } = await supabase
    .from('users')
    .select('tribe_id')
    .eq('id', user.id)
    .single()

  if (me?.tribe_id) {
    return NextResponse.json({ error: 'You are already in a tribe. Leave first.' }, { status: 409 })
  }

  // Create tribe
  const { data: tribe, error: tribeErr } = await supabase
    .from('tribes')
    .insert({ name: parsed.data.name, created_by: user.id })
    .select()
    .single()

  if (tribeErr) return NextResponse.json({ error: tribeErr.message }, { status: 500 })

  // Add creator as member and update user.tribe_id
  await Promise.all([
    supabase.from('tribe_members').insert({ user_id: user.id, tribe_id: tribe.id }),
    supabase.from('users').update({ tribe_id: tribe.id }).eq('id', user.id),
  ])

  return NextResponse.json({ data: tribe }, { status: 201 })
}

// PATCH /api/tribes — join by invite code
export async function PATCH(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = JoinTribeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid invite code' }, { status: 422 })
  }

  // Check user isn't already in a tribe
  const { data: me } = await supabase.from('users').select('tribe_id').eq('id', user.id).single()
  if (me?.tribe_id) {
    return NextResponse.json({ error: 'Leave your current tribe before joining another.' }, { status: 409 })
  }

  // Find tribe by code
  const { data: tribe, error: tribeErr } = await supabase
    .from('tribes')
    .select('id, name')
    .eq('invite_code', parsed.data.invite_code)
    .single()

  if (tribeErr || !tribe) {
    return NextResponse.json({ error: 'Tribe not found — check the invite code.' }, { status: 404 })
  }

  // Check member limit (20)
  const { count } = await supabase
    .from('tribe_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('tribe_id', tribe.id)

  if ((count ?? 0) >= 20) {
    return NextResponse.json({ error: 'This tribe is full (max 20 members).' }, { status: 409 })
  }

  await Promise.all([
    supabase.from('tribe_members').insert({ user_id: user.id, tribe_id: tribe.id }),
    supabase.from('users').update({ tribe_id: tribe.id }).eq('id', user.id),
  ])

  return NextResponse.json({ data: tribe })
}

// DELETE /api/tribes — leave current tribe
export async function DELETE(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('tribe_id').eq('id', user.id).single()
  if (!me?.tribe_id) return NextResponse.json({ error: 'Not in a tribe.' }, { status: 409 })

  await Promise.all([
    supabase.from('tribe_members').delete().match({ user_id: user.id, tribe_id: me.tribe_id }),
    supabase.from('users').update({ tribe_id: null }).eq('id', user.id),
  ])

  return NextResponse.json({ success: true })
}
