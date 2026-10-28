import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Locks every sweep tribe whose tournament's race_start_at is within 30 minutes, so "no more
// new picks/joins/requests" actually takes effect ahead of the jump even if the organiser
// never clicks the manual lock toggle. Reuses sweep_locked_at — there's no need for the UI to
// distinguish an auto-lock from a manual one, both just mean "locked". CRON_SECRET-authed,
// scheduled via Supabase pg_cron — see supabase/saved-migrations/sweep-auto-lock-pg_cron.sql.
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: tourns } = await (admin.from('tournaments') as any)
    .select('id')
    .eq('format', 'sweep')
    .not('race_start_at', 'is', null)
    .lte('race_start_at', new Date(Date.now() + 30 * 60 * 1000).toISOString())
  const tournIds = ((tourns ?? []) as any[]).map(t => t.id)
  if (!tournIds.length) return NextResponse.json({ locked: 0, reason: 'no tournament within 30 minutes of race_start_at' })

  const { data: locked, error } = await (admin.from('tribes') as any)
    .update({ sweep_locked_at: new Date().toISOString() })
    .in('tournament_id', tournIds)
    .is('sweep_locked_at', null)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ locked: (locked ?? []).length })
}
