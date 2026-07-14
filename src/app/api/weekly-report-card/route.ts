import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Whether to show the homepage "weekly report" card for the current user in a
// given tribe. Shows only when: the admin toggle is ON, the user is a member of
// the tribe, and the tribe has >= MIN_TRIBE_MEMBERS. Returns the ISO-week key so
// the client can dismiss it per-week.

const MIN_TRIBE_MEMBERS = 4

function mondayOf(d: Date): string {
  const day  = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff))
  return m.toISOString().slice(0, 10)
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ show: false })

  const tribeId = new URL(request.url).searchParams.get('tribe_id')
  if (!tribeId) return NextResponse.json({ show: false })

  const admin = createAdminClient()

  const { data: flag } = await (admin.from('app_settings') as any)
    .select('value').eq('key', 'weekly_report_card').maybeSingle()
  if ((flag as any)?.value !== 'on') return NextResponse.json({ show: false })

  // Membership (mirrors /api/chat check) — via tribe_members (users.tribe_id was dropped in 044).
  const supabase = createServerSupabaseClient()
  const { data: tmRow } = await supabase.from('tribe_members')
    .select('tribe_id').eq('user_id', user.id).eq('tribe_id', tribeId).maybeSingle()
  if (!(tmRow as any)?.tribe_id) return NextResponse.json({ show: false })

  const { count } = await (admin.from('tribe_members') as any)
    .select('user_id', { count: 'exact', head: true }).eq('tribe_id', tribeId)
  if ((count ?? 0) < MIN_TRIBE_MEMBERS) return NextResponse.json({ show: false })

  return NextResponse.json({ show: true, week: mondayOf(new Date()) })
}
