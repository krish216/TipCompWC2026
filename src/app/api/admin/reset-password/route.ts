import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// POST /api/admin/reset-password
// Tournament admin only — reset a user's password by email
export async function POST(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Must be tournament admin
  const { data: isAdmin } = await adminClient
    .from('admin_users').select('user_id').eq('user_id', user.id).single()
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { email, new_password } = await request.json().catch(() => ({}))
  if (!email?.trim()) return NextResponse.json({ error: 'Email required' }, { status: 400 })
  if (!new_password || new_password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  // Look up user by email using direct DB query (more reliable than listUsers pagination)
  const { data: authUser, error: lookupErr } = await adminClient
    .from('users')
    .select('id')
    .eq('email', email.trim().toLowerCase())
    .single()

  if (lookupErr || !authUser) {
    // Fallback: try auth.users directly via admin API
    const { data: { users }, error: listErr } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 })
    const target = users.find((u: any) => u.email?.toLowerCase() === email.trim().toLowerCase())
    if (!target) return NextResponse.json({ error: `No account found for ${email.trim()}` }, { status: 404 })

    const { error: updateErr } = await adminClient.auth.admin.updateUserById(target.id, { password: new_password })
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
    return NextResponse.json({ success: true, user_id: target.id })
  }

  // Update password via admin API using the user id from public.users
  const { error: updateErr } = await adminClient.auth.admin.updateUserById(authUser.id, { password: new_password })
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ success: true, user_id: target.id })
}
