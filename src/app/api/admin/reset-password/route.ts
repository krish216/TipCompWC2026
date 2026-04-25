import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// POST /api/admin/reset-password — tournament admin resets any user's password
export async function POST(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()

  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify tournament admin
  const { data: isAdmin } = await adminClient
    .from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { user_id, new_password } = await request.json().catch(() => ({}))
  if (!user_id || !new_password) {
    return NextResponse.json({ error: 'user_id and new_password required' }, { status: 400 })
  }
  if (new_password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  // Look up the target user in public.users to verify they exist
  const { data: target } = await (adminClient.from('users') as any)
    .select('id').eq('id', user_id).maybeSingle()
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Get auth user record to confirm the auth account exists
  const { data: authData } = await adminClient.auth.admin.getUserById(user_id)
  const authUser = authData?.user as { id: string } | null
  if (!authUser?.id) return NextResponse.json({ error: 'Auth user not found' }, { status: 404 })

  // Update password via admin API
  const { error: updateErr } = await adminClient.auth.admin.updateUserById(authUser.id, { password: new_password })
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ success: true, user_id: target.id })
}
