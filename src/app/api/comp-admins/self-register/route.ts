import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// POST /api/comp-admins/self-register
// Assigns a user to an org using the org's invite code.
// Regular join: assigns org membership only (no org admin role).
// The invite code is proof of authorisation to join.
export async function POST(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const user = await getSessionUser()
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
    .maybeSingle()

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

  // Enrol in user_comps (multi-comp membership table)
  await (adminClient.from('user_comps') as any).upsert(
    { user_id: user.id, comp_id },
    { onConflict: 'user_id,comp_id' }
  )

  // Clean up any invitation row for this user's email — no longer needed
  if (user.email) {
    await (adminClient.from('comp_invitations') as any)
      .delete()
      .eq('comp_id', comp_id)
      .ilike('email', user.email)
  }

  // Auto-enrol in the comp's default tribe (if set and user not already in a tribe in this comp)
  const { data: defaultTribe } = await (adminClient.from('tribes') as any)
    .select('id').eq('comp_id', comp_id).eq('is_default', true).maybeSingle()
  if (defaultTribe?.id) {
    const { data: compTribes } = await (adminClient.from('tribes') as any).select('id').eq('comp_id', comp_id)
    const compTribeIds = (compTribes ?? []).map((t: any) => t.id)
    if (compTribeIds.length > 0) {
      const { count: alreadyInTribe } = await (adminClient.from('tribe_members') as any)
        .select('*', { count: 'exact', head: true }).eq('user_id', user.id).in('tribe_id', compTribeIds)
      if (!alreadyInTribe) {
        await (adminClient.from('tribe_members') as any)
          .upsert({ user_id: user.id, tribe_id: defaultTribe.id }, { onConflict: 'user_id,tribe_id', ignoreDuplicates: true })
      }
    }
  }

  return NextResponse.json({ success: true, comp_name: (org as any).name })
}
