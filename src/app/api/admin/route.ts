import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/admin — check if current user is admin
export async function GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ is_admin: false })

  // Use service-role client to bypass RLS on admin_users
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .single()
    return NextResponse.json({ is_admin: !!data })
  } catch {
    return NextResponse.json({ is_admin: false })
  }
}

// POST /api/admin — grant admin to a user by email
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify caller is admin (using service role to bypass RLS)
  const adminClient = createAdminClient()
  const { data: callerAdmin } = await adminClient
    .from('admin_users').select('user_id').eq('user_id', user.id).single()
  if (!callerAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { email } = await request.json()
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  const { data: target } = await adminClient
    .from('users').select('id').eq('email', email).single()
  if (!target) return NextResponse.json({ error: 'User not found — they must register first' }, { status: 404 })

  await adminClient.from('admin_users').upsert({
    user_id:    (target as any).id,
    granted_by: user.id,
  })
  return NextResponse.json({ success: true })
}
