import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { z } from 'zod'

const CreateOrgSchema = z.object({
  name: z.string().min(2).max(80).trim(),
  slug: z.string().min(2).max(40).trim().toLowerCase().regex(/^[a-z0-9-]+$/),
})

// GET /api/organisations — list all orgs (for registration dropdown)
export async function GET() {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('organisations')
    .select('id, name, slug, invite_code')
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// POST /api/organisations — create a new org (tournament admin only)
export async function POST(request: NextRequest) {
  const supabase   = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Only tournament admins can create organisations
  const { data: isTournamentAdmin } = await adminClient
    .from('admin_users').select('user_id').eq('user_id', user.id).single()
  if (!isTournamentAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body   = await request.json().catch(() => null)
  const parsed = CreateOrgSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })

  const { name, slug } = parsed.data

  const { data: org, error } = await (adminClient.from('organisations') as any).insert({
    name, slug, created_by: user.id,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Make the creator an org admin
  await (adminClient.from('org_admins') as any).insert({
    org_id: (org as any).id, user_id: user.id,
  })

  return NextResponse.json({ data: org }, { status: 201 })
}
