import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'
import { getTournamentBySlug, getTeamsAndFixtures } from '@/lib/content/wc'

export const dynamic = 'force-dynamic'

// POST /api/standings/submit
// Body: { tournament: slug, quarter, top_teams: string[], bottom_teams: string[] }
// Saves the signed-in user's Top-N/Bottom-N pick for a quarter, while it's still open.
export async function POST(request: NextRequest) {
  const user = await getSessionUser().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Sign in to enter' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { tournament, quarter, top_teams, bottom_teams } = body ?? {}
  if (!tournament || !quarter || !Array.isArray(top_teams) || !Array.isArray(bottom_teams)) {
    return NextResponse.json({ error: 'tournament, quarter, top_teams, bottom_teams required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const t = await getTournamentBySlug(tournament)
  if (!t) return NextResponse.json({ error: 'tournament not found' }, { status: 404 })

  // Predictions are gated on the tournament's enrollment window — the flagship stays
  // inert (visible but not enterable) until enrollment opens.
  const { data: tRow } = await (admin.from('tournaments') as any).select('enrollment_open').eq('id', t.id).maybeSingle()
  if (tRow && tRow.enrollment_open === false) return NextResponse.json({ error: 'This challenge isn’t open yet.' }, { status: 400 })

  const { data: q } = await (admin.from('standings_quarters') as any)
    .select('*').eq('tournament_id', t.id).eq('quarter', quarter).maybeSingle()
  if (!q) return NextResponse.json({ error: 'quarter not found' }, { status: 404 })
  if (Date.now() >= new Date(q.locks_at).getTime()) return NextResponse.json({ error: 'This quarter is locked.' }, { status: 400 })

  // Exact bucket sizes, valid + distinct teams, no team in both buckets.
  if (top_teams.length !== q.top_n)       return NextResponse.json({ error: `Pick exactly ${q.top_n} for the top.` }, { status: 400 })
  if (bottom_teams.length !== q.bottom_n) return NextResponse.json({ error: `Pick exactly ${q.bottom_n} for the bottom.` }, { status: 400 })
  const { teams } = await getTeamsAndFixtures(t.id)
  const names = new Set(teams.map(tm => tm.name))
  const all = [...top_teams, ...bottom_teams]
  if (all.some(n => !names.has(n)))       return NextResponse.json({ error: 'Unknown team in selection.' }, { status: 400 })
  if (new Set(all).size !== all.length)   return NextResponse.json({ error: 'A team can only be picked once.' }, { status: 400 })

  const { error } = await (admin.from('standings_predictions') as any).upsert({
    tournament_id: t.id, user_id: user.id, quarter,
    top_teams, bottom_teams, updated_at: new Date().toISOString(),
  }, { onConflict: 'tournament_id,user_id,quarter' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
