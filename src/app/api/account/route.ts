import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// DELETE /api/account — permanently delete the calling user's account
export async function DELETE() {
  const adminClient = createAdminClient()

  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const uid = user.id

  // Steps that have ON DELETE CASCADE and are pre-deleted only to avoid
  // trigger-side-effects (leaderboard refresh, etc.)
  await (adminClient.from('tribe_members') as any).delete().eq('user_id', uid)
  await (adminClient.from('predictions')   as any).delete().eq('user_id', uid)
  await (adminClient.from('comp_admins')   as any).delete().eq('user_id', uid)

  // Nullify created_by / recorded_by references that have no ON DELETE CASCADE.
  // Without these, DELETE FROM users fails with a FK violation (silently, since
  // we were not checking errors) and then deleteUser also fails → 500.
  await (adminClient.from('comps') as any)
    .update({ created_by: null }).eq('created_by', uid)
  await (adminClient.from('comp_payments') as any)
    .update({ recorded_by: null }).eq('recorded_by', uid)

  // Owned rows with cascade or explicit delete
  await (adminClient.from('user_comps')        as any).delete().eq('user_id', uid)
  await (adminClient.from('user_tournaments')  as any).delete().eq('user_id', uid)
  await (adminClient.from('comp_invitations')  as any).delete().eq('invited_by', uid)
  await (adminClient.from('comp_invitations')  as any).delete().eq('user_id', uid)

  // Delete the public user row — cascades to notification_prefs, user_preferences,
  // chat_messages (all defined with ON DELETE CASCADE)
  const { error: userDeleteError } = await (adminClient.from('users') as any)
    .delete().eq('id', uid)
  if (userDeleteError) {
    return NextResponse.json(
      { error: `Failed to remove user record: ${userDeleteError.message}` },
      { status: 500 }
    )
  }

  // Finally remove the auth identity — must be last
  const { error: authError } = await adminClient.auth.admin.deleteUser(uid)
  if (authError) {
    return NextResponse.json(
      { error: `Account data removed but auth deletion failed: ${authError.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
