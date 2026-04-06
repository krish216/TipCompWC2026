import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { z } from 'zod'

const CreateSchema = z.object({
  name:        z.string().min(2).max(80).trim(),
  owner_name:  z.string().optional(),
  owner_phone: z.string().optional(),
  owner_email: z.string().email().optional().or(z.literal('')),
})

// POST /api/organisations/create — self-service org creation (any authenticated user)
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body   = await request.json().catch(() => null)
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Organisation name is required' }, { status: 422 })

  const { name, owner_name, owner_phone, owner_email } = parsed.data

  // Auto-generate unique slug and 8-char invite code
  const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const slug     = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`
  const code     = Math.random().toString(36).substring(2, 6).toUpperCase() +
                   Math.random().toString(36).substring(2, 6).toUpperCase()

  const adminClient = createAdminClient()
  const { data: org, error } = await (adminClient.from('organisations') as any)
    .insert({
      name,
      slug,
      invite_code:    code,
      created_by:     user.id,
      owner_name:     owner_name  || null,
      owner_phone:    owner_phone || null,
      owner_email:    owner_email || null,
      is_self_created: true,
      approved:       true,   // auto-approved; tournament admin can review
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: org }, { status: 201 })
}

// PATCH /api/organisations/create — update logo URL after upload
export async function PATCH(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { org_id, logo_url } = await request.json()
  if (!org_id || !logo_url) return NextResponse.json({ error: 'org_id and logo_url required' }, { status: 400 })

  const adminClient = createAdminClient()
  const { error } = await (adminClient.from('organisations') as any)
    .update({ logo_url })
    .eq('id', org_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
