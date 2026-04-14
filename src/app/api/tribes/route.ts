import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { z } from 'zod'

const CreateTribeSchema = z.object({ name: z.string().min(2).max(50).trim(), description: z.string().max(200).trim().optional(), tournament_id: z.string().uuid().optional() })
const JoinTribeSchema   = z.object({ invite_code: z.string().length(8).toUpperCase() })

// Helper — check if user is org admin
async function getUserOrgInfo(userId: string) {
  const adminClient = createAdminClient()
  const { data: user } = await adminClient
    .from('users').select('comp_id').eq('id', userId).single()
  const compId = (user as any)?.comp_id ?? null

  const { data: compAdmin } = await (adminClient.from('comp_admins') as any)
    .select('comp_id').eq('user_id', userId).single()

  return {
    comp_id:       compId,
    is_org_admin: !!compAdmin,
  }
}

// GET /api/tribes — get current user's tribe + members
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase
    .from('users').select('tribe_id').eq('id', user.id).single()
  if (!(me as any)?.tribe_id) return NextResponse.json({ data: null })

  const tribeId = (me as any).tribe_id

  const { data: tribe, error } = await supabase
    .from('tribes').select('id, name, invite_code, created_at, comp_id, tournament_id').eq('id', tribeId).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: memberRows } = await supabase
    .from('tribe_members').select('user_id, joined_at').eq('tribe_id', tribeId)
  const memberIds = (memberRows ?? []).map((m: any) => m.user_id)

  const { data: userRows } = await supabase
    .from('users').select('id, display_name, avatar_url').in('id', memberIds)
  // Get active tournament from user to scope leaderboard
  const { data: userTournRow } = await supabase
    .from('users').select('active_tournament_id').eq('id', user.id).single()
  const activeTid = (userTournRow as any)?.active_tournament_id ?? null

  let lbQ = supabase
    .from('leaderboard').select('user_id, total_points, exact_count, correct_count').in('user_id', memberIds)
  if (activeTid) lbQ = (lbQ as any).eq('tournament_id', activeTid)
  const { data: lbRows } = await lbQ

  const userMap: Record<string, any> = {}
  ;(userRows ?? []).forEach((u: any) => { userMap[u.id] = u })
  const lbMap: Record<string, any> = {}
  ;(lbRows ?? []).forEach((r: any) => { lbMap[r.user_id] = r })

  ;(tribe as any).tribe_members = (memberRows ?? []).map((tm: any) => {
    const u  = userMap[tm.user_id] ?? {}
    const lb = lbMap[tm.user_id]   ?? {}
    return {
      joined_at: tm.joined_at,
      users: {
        id:            tm.user_id,
        display_name:  u.display_name  ?? 'Unknown',
        avatar_url:    u.avatar_url    ?? null,
        total_points:  lb.total_points  ?? 0,
        exact_count:   lb.exact_count   ?? 0,
        correct_count: lb.correct_count ?? 0,
      },
    }
  })

  return NextResponse.json({ data: tribe })
}

// GET /api/tribes/list — list all tribes in the user's org
export async function HEAD(request: NextRequest) {
  // Used as /api/tribes?list=true
  return NextResponse.json({})
}

// POST /api/tribes — org admin creates a new tribe
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { comp_id, is_org_admin } = await getUserOrgInfo(user.id)
  if (!is_org_admin) {
    return NextResponse.json({ error: 'Only comp admins can create tribes' }, { status: 403 })
  }
  if (!comp_id) {
    return NextResponse.json({ error: 'You must belong to an comp first' }, { status: 400 })
  }

  const body   = await request.json().catch(() => null)
  const parsed = CreateTribeSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid name' }, { status: 422 })

  const adminClient = createAdminClient()

  // Check tribe name is unique within this org (case-insensitive)
  const { data: existingTribe } = await (adminClient.from('tribes') as any)
    .select('id').ilike('name', parsed.data.name).eq('comp_id', comp_id).single()
  if (existingTribe) {
    return NextResponse.json({ error: 'A tribe with this name already exists in your comp' }, { status: 409 })
  }

  // Generate unique invite code
  const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase()

  const { data: tribe, error } = await (adminClient.from('tribes') as any)
    .insert({
      name: parsed.data.name,
      description: parsed.data.description || null,
      created_by: user.id,
      invite_code: inviteCode,
      comp_id,
      tournament_id: parsed.data.tournament_id ?? null,
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: tribe }, { status: 201 })
}

// PATCH /api/tribes — join a tribe by invite code (must be same org)
export async function PATCH(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body   = await request.json().catch(() => null)
  const parsed = JoinTribeSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid invite code' }, { status: 422 })

  const { data: me } = await supabase
    .from('users').select('tribe_id, comp_id').eq('id', user.id).single()
  if ((me as any)?.tribe_id) return NextResponse.json({ error: 'Already in a tribe' }, { status: 409 })

  const userCompId = (me as any)?.comp_id ?? null

  const { data: tribe } = await supabase
    .from('tribes').select('id, name, comp_id').eq('invite_code', parsed.data.invite_code).single()
  if (!tribe) return NextResponse.json({ error: 'Tribe not found — check the invite code' }, { status: 404 })

  // Enforce org membership
  if (userCompId && (tribe as any).comp_id && userCompId !== (tribe as any).comp_id) {
    return NextResponse.json({ error: 'This tribe belongs to a different comp' }, { status: 403 })
  }

  // Enforce max tribe size of 25
  const { count: memberCount } = await supabase
    .from('tribe_members').select('*', { count: 'exact', head: true }).eq('tribe_id', (tribe as any).id)
  if ((memberCount ?? 0) >= 25) {
    return NextResponse.json({ error: 'This tribe is full — maximum 25 members allowed' }, { status: 409 })
  }

  await Promise.all([
    supabase.from('tribe_members').insert({ user_id: user.id, tribe_id: (tribe as any).id }),
    supabase.from('users').update({ tribe_id: (tribe as any).id }).eq('id', user.id),
  ])

  return NextResponse.json({ data: tribe })
}

// DELETE /api/tribes — leave current tribe
export async function DELETE() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase
    .from('users').select('tribe_id').eq('id', user.id).single()
  if (!(me as any)?.tribe_id) return NextResponse.json({ error: 'Not in a tribe' }, { status: 400 })

  await Promise.all([
    supabase.from('tribe_members').delete().match({ user_id: user.id, tribe_id: (me as any).tribe_id }),
    supabase.from('users').update({ tribe_id: null }).eq('id', user.id),
  ])

  return NextResponse.json({ success: true })
}
