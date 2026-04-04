import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/round-locks — public, returns all round lock states
export async function GET() {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('round_locks')
    .select('round, is_open, opened_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Return as a map: { gs: true, r32: false, ... }
  const locks: Record<string, boolean> = {}
  ;(data ?? []).forEach((r: any) => { locks[r.round] = r.is_open })
  return NextResponse.json({ data: locks })
}

// POST /api/round-locks — admin only, open or close a round
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminClient = createAdminClient()
  const { data: adminRow } = await adminClient
    .from('admin_users').select('user_id').eq('user_id', user.id).single()
  if (!adminRow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { round, is_open } = await request.json()
  if (!round) return NextResponse.json({ error: 'round required' }, { status: 400 })

  const { error } = await (adminClient.from('round_locks') as any).upsert({
    round,
    is_open,
    opened_at: is_open ? new Date().toISOString() : null,
    opened_by: is_open ? user.id : null,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, round, is_open })
}
