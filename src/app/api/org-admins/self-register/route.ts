import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// POST /api/org-admins/self-register
// Assigns a user to an org using the org's invite code.
// Regular join: assigns org membership only (no org admin role).
// The invite code is proof of authorisation to join.
export async function POST(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { org_id, invite_code } = await request.json()
  if (!org_id || !invite_code) {
    return NextResponse.json({ error: 'org_id and invite_code required' }, { status: 400 })
  }

  // Verify the invite code matches the org
  const { data: org } = await supabase
    .from('organisations')
    .select('id, invite_code, name')
    .eq('id', org_id)
    .eq('invite_code', invite_code.toUpperCase())
    .neq('slug', 'public')
    .single()

  if (!org) return NextResponse.json({ error: 'Invalid organisation code' }, { status: 403 })

  // Assign user to org as an ordinary member — no org admin role granted
  await (adminClient.from('users') as any)
    .update({ org_id }).eq('id', user.id)

  return NextResponse.json({ success: true, org_name: (org as any).name })
}
