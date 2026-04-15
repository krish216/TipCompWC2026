import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// POST /api/comp-admins/self-register
// Assigns a user to an org using the org's invite code.
// Regular join: assigns org membership only (no org admin role).
// The invite code is proof of authorisation to join.
export async function POST(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { comp_id, invite_code } = await request.json()
  if (!comp_id || !invite_code) {
    return NextResponse.json({ error: 'comp_id and invite_code required' }, { status: 400 })
  }

  // Verify the invite code matches the org
  const { data: org } = await supabase
    .from('comps')
    .select('id, invite_code, name, email_domain')
    .eq('id', comp_id)
    .eq('invite_code', invite_code.toUpperCase())
    .neq('slug', 'public')
    .single()

  if (!org) return NextResponse.json({ error: 'Invalid comp code' }, { status: 403 })

  // Check email domain restriction if set
  const orgEmailDomain = (org as any).email_domain ?? null
  if (orgEmailDomain) {
    const userEmail  = user.email ?? ''
    const userDomain = userEmail.split('@')[1]?.toLowerCase() ?? ''
    if (userDomain !== orgEmailDomain.toLowerCase()) {
      return NextResponse.json({
        error: `This comp is restricted to ${orgEmailDomain} email addresses. Your email (${userEmail}) does not match.`
      }, { status: 403 })
    }
  }

  // Assign user to org as an ordinary member — no org admin role granted
  await (adminClient.from('users') as any)
    .update({ comp_id }).eq('id', user.id)

  // Enrol in user_comps (multi-comp membership table)
  await supabase.from('user_comps' as any).upsert(
    { user_id: user.id, comp_id },
    { onConflict: 'user_id,comp_id' }
  )

  return NextResponse.json({ success: true, comp_name: (org as any).name })
}
