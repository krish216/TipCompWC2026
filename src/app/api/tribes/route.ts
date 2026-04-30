import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { z } from 'zod'

const CreateTribeSchema = z.object({ name: z.string().min(2).max(50).trim(), description: z.string().max(200).trim().nullish(), tournament_id: z.string().uuid().optional() })
const JoinTribeSchema   = z.object({ invite_code: z.string().length(8).toUpperCase() })

// GET /api/tribes?comp_id= — get current user's tribe for the given comp
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const compId = new URL(request.url).searchParams.get('comp_id')

  // Get tribe from tribe_members scoped to the selected comp
  let tribeId: string | null = null
  const adminClientLookup = createAdminClient()
  if (compId) {
    // Two-step lookup — avoids unreliable embedded-resource filter syntax
    const { data: memberRows } = await (adminClientLookup.from('tribe_members') as any)
      .select('tribe_id').eq('user_id', user.id)
    const tribeIds = (memberRows ?? []).map((r: any) => r.tribe_id).filter(Boolean)
    if (tribeIds.length > 0) {
      const { data: tribeRows } = await (adminClientLookup.from('tribes') as any)
        .select('id').eq('comp_id', compId).in('id', tribeIds).limit(1)
      tribeId = (tribeRows?.[0] as any)?.id ?? null
    }
  } else {
    // Fallback: first tribe membership (admin client to bypass RLS)
    const { data: membership } = await (adminClientLookup.from('tribe_members') as any)
      .select('tribe_id').eq('user_id', user.id).limit(1).maybeSingle()
    tribeId = (membership as any)?.tribe_id ?? null
  }

  if (!tribeId) return NextResponse.json({ data: null })

  // Use adminClient for tribe/member reads — RLS only allows users to see their own rows
  const adminClientGet = createAdminClient()

  const { data: tribe, error } = await (adminClientGet.from('tribes') as any)
    .select('id, name, invite_code, created_at, comp_id, tournament_id').eq('id', tribeId).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch ALL members of this tribe (bypasses RLS which would only return current user's row)
  const { data: memberRows } = await (adminClientGet.from('tribe_members') as any)
    .select('user_id, joined_at').eq('tribe_id', tribeId)
  const memberIds = (memberRows ?? []).map((m: any) => m.user_id)

  const [userResult, activeTidResult] = await Promise.all([
    memberIds.length > 0
      ? (adminClientGet.from('users') as any).select('id, display_name, avatar_url').in('id', memberIds)
      : Promise.resolve({ data: [] }),
    supabase.from('user_preferences').select('tournament_id').eq('user_id', user.id).maybeSingle(),
  ])
  const userRows = (userResult as any)?.data ?? []

  let activeTid = (activeTidResult.data as any)?.tournament_id ?? null
  if (!activeTid) {
    const { data: setting } = await (adminClientGet.from('app_settings') as any)
      .select('value').eq('key', 'active_tournament_id').single()
    activeTid = (setting as any)?.value ?? null
  }

  let lbRows: any[] | null = null
  if (memberIds.length > 0) {
    let lbQ = (adminClientGet.from('leaderboard') as any)
      .select('user_id, total_points, bonus_count, correct_count').in('user_id', memberIds)
    if (activeTid) lbQ = lbQ.eq('tournament_id', activeTid)
    const { data } = await lbQ
    lbRows = data
  }

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
        bonus_count:   lb.bonus_count ?? 0,
        correct_count: lb.correct_count ?? 0,
      },
    }
  })

  return NextResponse.json({ data: tribe })
}

// GET /api/tribes/list — list all tribes in the user's org
export async function HEAD(_request: NextRequest) {
  return NextResponse.json({})
}

// POST /api/tribes — comp admin creates a new tribe
export async function POST(request: NextRequest) {
  const supabase   = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const user = await getSessionUser()
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
  const supabase     = createServerSupabaseClient()
  const adminClient  = createAdminClient()
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)

  // Set-default path: body has { tribe_id, set_default: true } (no invite_code)
  if (body?.set_default === true) {
    const tribeId = body?.tribe_id as string | undefined
    if (!tribeId) return NextResponse.json({ error: 'tribe_id required' }, { status: 400 })
    const { data: tribe } = await (adminClient.from('tribes') as any)
      .select('id, comp_id').eq('id', tribeId).single()
    if (!tribe) return NextResponse.json({ error: 'Tribe not found' }, { status: 404 })
    const [{ data: ca }, { data: ta }] = await Promise.all([
      (adminClient.from('comp_admins') as any).select('comp_id').eq('user_id', user.id).eq('comp_id', (tribe as any).comp_id).single(),
      adminClient.from('admin_users').select('user_id').eq('user_id', user.id).single(),
    ])
    if (!ca && !ta) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    await (adminClient.from('tribes') as any).update({ is_default: false }).eq('comp_id', (tribe as any).comp_id).eq('is_default', true)
    await (adminClient.from('tribes') as any).update({ is_default: true }).eq('id', tribeId)
    return NextResponse.json({ success: true })
  }

  // Join-by-invite-code path
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

  // Check not already in this specific tribe — idempotent: return 200 if already a member
  const { data: alreadyIn } = await (adminClient.from('tribe_members') as any)
    .select('tribe_id').eq('user_id', user.id).eq('tribe_id', (tribe as any).id).single()
  if (alreadyIn) return NextResponse.json({ data: tribe })

  // Enforce max tribe size of 25
  const { count: memberCount } = await supabase
    .from('tribe_members').select('*', { count: 'exact', head: true }).eq('tribe_id', (tribe as any).id)
  if ((memberCount ?? 0) >= 25) {
    return NextResponse.json({ error: 'This tribe is full — maximum 25 members allowed' }, { status: 409 })
  }

  await Promise.all([
    (supabase.from('tribe_members') as any).insert({ user_id: user.id, tribe_id: (tribe as any).id }),
  ])

  return NextResponse.json({ data: tribe })
}

// If body contains tribe_id → admin deletes the whole tribe
// If query param comp_id → user leaves their tribe in that comp
export async function DELETE(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Admin tribe deletion: DELETE /api/tribes with body { tribe_id }
  const contentType = request.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const body    = await request.json().catch(() => null)
    const tribeId = body?.tribe_id as string | undefined
    if (tribeId) {
      // Verify tribe exists and caller is comp admin for it
      const { data: tribe } = await (adminClient.from('tribes') as any)
        .select('id, comp_id').eq('id', tribeId).single()
      if (!tribe) return NextResponse.json({ error: 'Tribe not found' }, { status: 404 })

      const { data: adminRow } = await (adminClient.from('comp_admins') as any)
        .select('comp_id').eq('user_id', user.id).eq('comp_id', (tribe as any).comp_id).single()
      if (!adminRow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

      // Remove all members first, then delete the tribe
      await (adminClient.from('tribe_members') as any).delete().eq('tribe_id', tribeId)
      const { error } = await (adminClient.from('tribes') as any).delete().eq('id', tribeId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }
  }

  // comp_id scopes which tribe to leave (a user can be in one tribe per comp)
  const compId = new URL(request.url).searchParams.get('comp_id')

  let tribeId: string | null = null
  if (compId) {
    const { data: memberRows } = await (adminClient.from('tribe_members') as any)
      .select('tribe_id').eq('user_id', user.id)
    const tribeIds = (memberRows ?? []).map((r: any) => r.tribe_id).filter(Boolean)
    if (tribeIds.length > 0) {
      const { data: tribeRows } = await (adminClient.from('tribes') as any)
        .select('id').eq('comp_id', compId).in('id', tribeIds).limit(1)
      tribeId = (tribeRows?.[0] as any)?.id ?? null
    }
  } else {
    const { data: tmbr } = await (adminClient.from('tribe_members') as any)
      .select('tribe_id').eq('user_id', user.id).limit(1).maybeSingle()
    tribeId = (tmbr as any)?.tribe_id ?? null
  }
  if (!tribeId) return NextResponse.json({ error: 'Not in a tribe' }, { status: 400 })

  await (adminClient.from('tribe_members') as any).delete().match({ user_id: user.id, tribe_id: tribeId })

  return NextResponse.json({ success: true })
}
