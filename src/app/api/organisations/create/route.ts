import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { z } from 'zod'

const CreateSchema = z.object({
  name:        z.string().min(2).max(80).trim(),
  owner_name:  z.string().optional(),
  owner_phone: z.string().optional(),
  owner_email: z.string().optional(),
  user_id:     z.string().uuid(),   // passed explicitly — session may not be set yet post-signup
})

// POST /api/organisations/create — self-service org creation
// user_id is passed in body because the session cookie may not be set
// immediately after signUp (email confirmation flow)
export async function POST(request: NextRequest) {
  const body   = await request.json().catch(() => null)
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Organisation name and user_id are required' }, { status: 422 })
  }

  const { name, owner_name, owner_phone, owner_email, user_id } = parsed.data
  const adminClient = createAdminClient()

  // Verify user exists
  const { data: userRow } = await adminClient
    .from('users').select('id').eq('id', user_id).single()
  if (!userRow) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Check org name is unique (case-insensitive)
  const { data: existing } = await (adminClient.from('organisations') as any)
    .select('id').ilike('name', name).single()
  if (existing) return NextResponse.json({ error: 'An organisation with this name already exists' }, { status: 409 })

  // Auto-generate slug and 8-char invite code
  const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const slug     = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`
  const code     = (Math.random().toString(36).substring(2, 6) +
                    Math.random().toString(36).substring(2, 6)).toUpperCase()

  const { data: org, error } = await (adminClient.from('organisations') as any)
    .insert({
      name, slug, invite_code: code,
      created_by:     user_id,
      owner_name:     owner_name  || null,
      owner_phone:    owner_phone || null,
      owner_email:    owner_email || null,
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

  // Assign user to org and grant org admin
  await Promise.all([
    (adminClient.from('users') as any).update({ org_id: (org as any).id }).eq('id', user_id),
    (adminClient.from('org_admins') as any).upsert({ org_id: (org as any).id, user_id }),
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

  // Verify caller owns this org
  const { data: org } = await (adminClient.from('organisations') as any)
    .select('created_by').eq('id', org_id).single()
  if (!org || (org as any).created_by !== user_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await (adminClient.from('organisations') as any)
    .update({ logo_url }).eq('id', org_id)

  return NextResponse.json({ success: true })
}
