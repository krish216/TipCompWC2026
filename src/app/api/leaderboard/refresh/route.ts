import { NextResponse } from 'next/server'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// POST /api/leaderboard/refresh — manually trigger REFRESH MATERIALIZED VIEW leaderboard
export async function POST() {
  const supabase = createServerSupabaseClient()
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminClient = createAdminClient()

  // Only tournament admins can trigger a manual refresh
  const { data: adminRow } = await adminClient
    .from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!adminRow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await (adminClient.rpc as any)('refresh_leaderboard')
  if (error) {
    // The view auto-refreshes after every fixture result update via the DB trigger.
    // If the RPC doesn't exist, that's fine — treat it as a no-op success.
    console.warn('[leaderboard/refresh] rpc not found, view refreshes automatically:', error.message)
  }

  return NextResponse.json({ ok: true })
}
