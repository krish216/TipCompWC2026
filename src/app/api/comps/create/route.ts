import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { z } from 'zod'

const CreateSchema = z.object({
  name:        z.string().min(2).max(80).trim(),
  tournament_id: z.string().uuid().optional(),
  owner_name:  z.string().optional(),
  owner_phone: z.string().optional(),
  owner_email: z.string().optional(),
  user_id:     z.string().uuid(),
  // Optional user profile fields — upserted if user row doesn't exist yet
  display_name:   z.string().optional(),
  email:          z.string().email().optional(),
  country:        z.string().optional(),
  timezone:       z.string().optional(),
  favourite_team: z.string().optional(),
})

// POST /api/comps/create — self-service org creation
// Uses admin client throughout — no session required.
// user_id is passed explicitly because the browser session is not yet
// established when this is called immediately after signUp.
export async function POST(request: NextRequest) {
  const body   = await request.json().catch(() => null)
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Comp name and user_id are required' }, { status: 422 })
  }

  const {
    name, owner_name, owner_phone, owner_email, user_id,
    display_name, email, country, timezone, favourite_team,
  } = parsed.data

  const adminClient = createAdminClient()

  // Step 1: check org name is unique before doing anything
  const { data: existing } = await (adminClient.from('comps') as any)
    .select('id').ilike('name', name).single()
  if (existing) {
    return NextResponse.json({ error: 'An comp with this name already exists' }, { status: 409 })
  }

  // Step 2: upsert user row FIRST and wait for it to fully commit
  // This must happen before the org insert because of the FK constraint
  const { data: publicOrg } = await (adminClient.from('comps') as any)
    .select('id').eq('slug', 'public').single()
  const publicOrgId = (publicOrg as any)?.id ?? null

  const { error: userError } = await (adminClient.from('users') as any).upsert({
    id:             user_id,
    email:          email          ?? '',
    display_name:   display_name  ?? email?.split('@')[0] ?? 'Player',
    favourite_team: favourite_team || null,
    country:        country        || null,
    timezone:       timezone       || 'UTC',
    comp_id:         publicOrgId,
  }, { onConflict: 'id', ignoreDuplicates: false })

  if (userError) {
    console.error('[org/create] user upsert error:', userError)
    // Continue anyway — user may already exist from the trigger
  }

  // Step 3: create the org — user row is now guaranteed to exist
  const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const slug     = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`
  const code     = (Math.random().toString(36).substring(2, 6) +
                    Math.random().toString(36).substring(2, 6)).toUpperCase()

  const { data: org, error } = await (adminClient.from('comps') as any)
    .insert({
      name, slug,
      invite_code:     code,
      created_by:      user_id,
      owner_name:      owner_name  || null,
      owner_phone:     owner_phone || null,
      owner_email:     owner_email || null,
      is_self_created: true,
      approved:        true,
      tournament_id:   parsed.data.tournament_id ?? null,
    })
    .select().single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'An comp with this name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const compId = (org as any).id

  // Step 4: assign user to new comp, enrol in user_comps, and grant comp admin
  await Promise.all([
    (adminClient.from('users') as any).update({ comp_id: compId }).eq('id', user_id),
    (adminClient.from('comp_admins') as any).upsert({ comp_id: compId, user_id }),
    (adminClient.from('user_comps') as any).upsert(
      { user_id, comp_id: compId },
      { onConflict: 'user_id,comp_id' }
    ),
  ])

  return NextResponse.json({ data: org }, { status: 201 })
}

// PATCH /api/comps/create — update logo URL after upload
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const { comp_id, logo_url, user_id, min_age, name } = body ?? {}
  if (!comp_id || !user_id) {
    return NextResponse.json({ error: 'comp_id and user_id required' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Verify caller is org admin or created the org
  const { data: org } = await (adminClient.from('comps') as any)
    .select('created_by').eq('id', comp_id).single()
  const { data: compAdminRow } = await (adminClient.from('comp_admins') as any)
    .select('user_id').eq('user_id', user_id).eq('comp_id', comp_id).single()
  if (!org || ((org as any).created_by !== user_id && !compAdminRow)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await (adminClient.from('comps') as any)
    .update({
        ...(name      !== undefined ? { name:     name ?? null      } : {}),
        ...(logo_url  !== undefined ? { logo_url }                    : {}),
        ...(min_age   !== undefined ? { min_age:  min_age ?? null   } : {}),
      }).eq('id', comp_id)

  return NextResponse.json({ success: true })
}
