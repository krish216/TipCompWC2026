import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { z } from 'zod'

const CreateTribeSchema = z.object({ name: z.string().min(2).max(50).trim(), description: z.string().max(200).trim().optional(), tournament_id: z.string().uuid().optional() })
const JoinTribeSchema   = z.object({ invite_code: z.string().length(8).toUpperCase() })

// Helper — check if user is a comp admin (for any comp)
async function getUserOrgInfo(userId: string) {
  const adminClient = createAdminClient()
  const { data: compAdmin } = await (adminClient.from('comp_admins') as any)
    .select('comp_id').eq('user_id', userId).limit(1).single()
  return {
    comp_id:      (compAdmin as any)?.comp_id ?? null,
    is_org_admin: !!compAdmin,
  }
}

// GET /api/tribes?comp_id= — get current user's tribe for the given comp
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const compId = new URL(request.url).searchParams.get('comp_id')

  // Get tribe from tribe_members scoped to the selected comp
  let tribeId: string | null = null
  if (compId) {
    // Find the tribe the user is in that belongs to this comp
    const adminClient = createAdminClient()
    const { data: rows } = await (adminClient.from('tribe_members') as any)
      .select('tribe_id, tribes!inner(comp_id)')
      .eq('user_id', user.id)
      .eq('tribes.comp_id', compId)
      .limit(1)
    tribeId = (rows?.[0] as any)?.tribe_id ?? null
  } else {
    // Fallback: first tribe membership
    const { data: membership } = await supabase
      .from('tribe_members').select('tribe_id').eq('user_id', user.id).limit(1).single()
    tribeId = (membership as any)?.tribe_id ?? null
  }

  if (!tribeId) return NextResponse.json({ data: null })

  const { data: tribe, error } = await supabase
    .from('tribes').select('id, name, invite_code, created_at, comp_id, tournament_id').eq('id', tribeId).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: memberRows } = await supabase
    .from('tribe_members').select('user_id, joined_at').eq('tribe_id', tribeId)
  const memberIds = (memberRows ?? []).map((m: any) => m.user_id)

  const { data: userRows } = await supabase
    .from('users').select('id, display_name, avatar_url').in('id', memberIds)
  // Get active tournament from user_preferences, then app_settings
  const { data: userPrefs } = await supabase
    .from('user_preferences').select('tournament_id').eq('user_id', user.id).single()
  let activeTid = (userPrefs as any)?.tournament_id ?? null
  if (!activeTid) {
    const { data: setting } = await supabase
      .from('app_settings').select('value').eq('key', 'active_tournament_id').single()
    activeTid = (setting as any)?.value ?? null
  }

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

// POST /api/tribes — comp admin creates a new tribe
export async function POST(request: NextRequest) {
  const supabase   = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body   = await request.json().catch(() => null)
  const parsed = CreateTribeSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid name' }, { status: 422 })

  // comp_id must come from the request — the client knows which comp is being managed
  const comp_id = (body as any)?.comp_id ?? null
  if (!comp_id) return NextResponse.json({ error: 'comp_id required' }, { status: 400 })

  // Verify caller is an admin for THIS specific comp (use admin client to bypass RLS)
  const { data: adminRows } = await (adminClient.from('comp_admins') as any)
    .select('comp_id').eq('user_id', user.id).eq('comp_id', comp_id)
  if (!adminRows?.length) {
    return NextResponse.json({ error: 'Only comp admins can create tribes' }, { status: 403 })
  }

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

  const { data: tribe } = await (adminClient.from('tribes') as any)
    .select('id, name, comp_id').eq('invite_code', parsed.data.invite_code).single()
  if (!tribe) return NextResponse.json({ error: 'Tribe not found — check the invite code' }, { status: 404 })

  // Verify user belongs to this comp (via user_comps — source of truth)
  if ((tribe as any).comp_id) {
    const { data: compMembership } = await (adminClient.from('user_comps') as any)
      .select('comp_id').eq('user_id', user.id).eq('comp_id', (tribe as any).comp_id).single()
    if (!compMembership) {
      return NextResponse.json({ error: 'You must join the comp before joining this tribe' }, { status: 403 })
    }
  }

  // Check not already in this specific tribe
  const { data: alreadyIn } = await (adminClient.from('tribe_members') as any)
    .select('tribe_id').eq('user_id', user.id).eq('tribe_id', (tribe as any).id).single()
  if (alreadyIn) return NextResponse.json({ error: 'Already in this tribe' }, { status: 409 })

  // Enforce max tribe size of 25
  const { count: memberCount } = await supabase
    .from('tribe_members').select('*', { count: 'exact', head: true }).eq('tribe_id', (tribe as any).id)
  if ((memberCount ?? 0) >= 25) {
    return NextResponse.json({ error: 'This tribe is full — maximum 25 members allowed' }, { status: 409 })
  }

  await Promise.all([
    supabase.from('tribe_members').insert({ user_id: user.id, tribe_id: (tribe as any).id }),
  ])

  return NextResponse.json({ data: tribe })
}

// DELETE /api/tribes — leave current tribe
export async function DELETE() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get tribe from tribe_members
  const { data: tmbr } = await supabase
    .from('tribe_members').select('tribe_id').eq('user_id', user.id).limit(1).single()
  if (!(tmbr as any)?.tribe_id) return NextResponse.json({ error: 'Not in a tribe' }, { status: 400 })

  await supabase.from('tribe_members').delete().match({ user_id: user.id, tribe_id: (tmbr as any).tribe_id })

  return NextResponse.json({ success: true })
}
