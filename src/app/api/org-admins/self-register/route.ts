import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// POST /api/org-admins/self-register
// Called after registration when a user signs up with a valid org code.
// Grants org admin and assigns org — no external admin approval needed
// because the invite code IS the proof of authorisation.
export async function POST(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { org_id, invite_code } = await request.json()
  if (!org_id || !invite_code) return NextResponse.json({ error: 'org_id and invite_code required' }, { status: 400 })

  // Verify the invite code matches the org — prevents spoofing
  const { data: org } = await supabase
    .from('organisations')
    .select('id, invite_code')
    .eq('id', org_id)
    .eq('invite_code', invite_code.toUpperCase())
    .neq('slug', 'public')
    .single()

  if (!org) return NextResponse.json({ error: 'Invalid code' }, { status: 403 })

  // Assign to org and grant org admin
  await Promise.all([
    (adminClient.from('users') as any).update({ org_id }).eq('id', user.id),
    (adminClient.from('org_admins') as any).upsert({ org_id, user_id: user.id }),
  ])

  return NextResponse.json({ success: true })
}
