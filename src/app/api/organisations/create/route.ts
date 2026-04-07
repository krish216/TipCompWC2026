import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { z } from 'zod'

const CreateSchema = z.object({
  name:        z.string().min(2).max(80).trim(),
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

// POST /api/organisations/create — self-service org creation
// Uses admin client throughout — no session required.
// user_id is passed explicitly because the browser session is not yet
// established when this is called immediately after signUp.
export async function POST(request: NextRequest) {
  const body   = await request.json().catch(() => null)
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Organisation name and user_id are required' }, { status: 422 })
  }

  const {
    name, owner_name, owner_phone, owner_email, user_id,
    display_name, email, country, timezone, favourite_team,
  } = parsed.data

  const adminClient = createAdminClient()

  // Upsert user row using admin client — handles the case where the
  // Supabase trigger hasn't fired yet or the browser session isn't active
  if (email || display_name) {
    const { data: publicOrg } = await (adminClient.from('organisations') as any)
      .select('id').eq('slug', 'public').single()
    const publicOrgId = (publicOrg as any)?.id ?? null

    await (adminClient.from('users') as any).upsert({
      id:             user_id,
      email:          email          ?? '',
      display_name:   display_name  ?? email?.split('@')[0] ?? 'Player',
      favourite_team: favourite_team || null,
      country:        country        || null,
      timezone:       timezone       || 'UTC',
      org_id:         publicOrgId,   // will be updated below after org is created
    }, { onConflict: 'id', ignoreDuplicates: false })
  }

  // Check org name is unique (case-insensitive)
  const { data: existing } = await (adminClient.from('organisations') as any)
    .select('id').ilike('name', name).single()
  if (existing) {
    return NextResponse.json({ error: 'An organisation with this name already exists' }, { status: 409 })
  }

  // Auto-generate slug and 8-char invite code
  const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const slug     = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`
  const code     = (Math.random().toString(36).substring(2, 6) +
                    Math.random().toString(36).substring(2, 6)).toUpperCase()

  const { data: org, error } = await (adminClient.from('organisations') as any)
    .insert({
      name, slug,
      invite_code:     code,
      created_by:      user_id,
      owner_name:      owner_name  || null,
      owner_phone:     owner_phone || null,
      owner_email:     owner_email || null,
      is_self_created: true,
      approved:        true,
    })
    .select().single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'An organisation with this name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const orgId = (org as any).id

  // Assign user to new org and grant org admin — all via admin client
  await Promise.all([
    (adminClient.from('users') as any).update({ org_id: orgId }).eq('id', user_id),
    (adminClient.from('org_admins') as any).upsert({ org_id: orgId, user_id }),
  ])

  return NextResponse.json({ data: org }, { status: 201 })
}

// PATCH /api/organisations/create — update logo URL after upload
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const { org_id, logo_url, user_id } = body ?? {}
  if (!org_id || !logo_url || !user_id) {
    return NextResponse.json({ error: 'org_id, logo_url and user_id required' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Verify caller created this org
  const { data: org } = await (adminClient.from('organisations') as any)
    .select('created_by').eq('id', org_id).single()
  if (!org || (org as any).created_by !== user_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await (adminClient.from('organisations') as any)
    .update({ logo_url }).eq('id', org_id)

  return NextResponse.json({ success: true })
}
