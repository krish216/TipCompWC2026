import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { createServerSupabaseClient } from '@/lib/supabase-server'
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
    display_name, email, country, timezone,
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
    (adminClient.from('comp_admins') as any).upsert({ comp_id: compId, user_id }),
    (adminClient.from('user_comps') as any).upsert(
      { user_id, comp_id: compId },
      { onConflict: 'user_id,comp_id' }
    ),
  ])

  return NextResponse.json({ data: org }, { status: 201 })
}

// PATCH /api/comps/create — update comp settings
export async function PATCH(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const { comp_id, logo_url, min_age, name, requires_payment_fee, entry_fee_amount } = body ?? {}
  if (!comp_id) {
    return NextResponse.json({ error: 'comp_id required' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Verify caller is comp admin, tournament admin, or created the comp
  const [{ data: org }, { data: compAdminRow }, { data: tournAdmin }] = await Promise.all([
    (adminClient.from('comps') as any).select('created_by').eq('id', comp_id).single(),
    (adminClient.from('comp_admins') as any).select('user_id').eq('user_id', user.id).eq('comp_id', comp_id).single(),
    adminClient.from('admin_users').select('user_id').eq('user_id', user.id).single(),
  ])
  if (!org || ((org as any).created_by !== user.id && !compAdminRow && !tournAdmin)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await (adminClient.from('comps') as any)
    .update({
        ...(name      !== undefined ? { name:     name ?? null      } : {}),
        ...(logo_url  !== undefined ? { logo_url }                    : {}),
        ...(min_age              !== undefined ? { min_age:              min_age ?? null              } : {}),
        ...(requires_payment_fee !== undefined ? { requires_payment_fee: requires_payment_fee ?? false } : {}),
        ...(entry_fee_amount     !== undefined ? { entry_fee_amount:     entry_fee_amount ?? null      } : {}),
      }).eq('id', comp_id)

  return NextResponse.json({ success: true })
}

// DELETE /api/comps/create — comp admin permanently deletes their comp
export async function DELETE(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { comp_id } = await request.json().catch(() => ({}))
  if (!comp_id) return NextResponse.json({ error: 'comp_id required' }, { status: 400 })

  const adminClient = createAdminClient()

  const [{ data: compAdminRow }, { data: tournAdmin }] = await Promise.all([
    (adminClient.from('comp_admins') as any).select('user_id').eq('user_id', user.id).eq('comp_id', comp_id).single(),
    adminClient.from('admin_users').select('user_id').eq('user_id', user.id).single(),
  ])
  if (!compAdminRow && !tournAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await (adminClient.from('comps') as any).delete().eq('id', comp_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
