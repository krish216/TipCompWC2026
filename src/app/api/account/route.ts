import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// DELETE /api/account — permanently delete the calling user's account
// Cascade order: tribe_members → predictions → org_admins → users → auth.users
export async function DELETE() {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const uid = user.id

  // 1. Remove from any tribe
  await (adminClient.from('tribe_members') as any).delete().eq('user_id', uid)

  // 2. Delete predictions
  await adminClient.from('predictions').delete().eq('user_id', uid)

  // 3. Remove org admin role
  await (adminClient.from('org_admins') as any).delete().eq('user_id', uid)

  // 4. Nullify orgs created_by reference
  await (adminClient.from('organisations') as any)
    .update({ created_by: null }).eq('created_by', uid)

  // 5. Delete public user row (triggers cascade on remaining FKs)
  await (adminClient.from('users') as any).delete().eq('id', uid)

  // 6. Delete auth user — must be last
  const { error } = await adminClient.auth.admin.deleteUser(uid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
