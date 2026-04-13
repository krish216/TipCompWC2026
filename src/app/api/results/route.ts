import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { z } from 'zod'

const ResultSchema = z.object({
  fixture_id: z.number().int().positive(),
  home:       z.number().int().min(0).max(30),
  away:       z.number().int().min(0).max(30),
  pen_winner: z.string().nullable().optional(),
})

// Helper — checks admin_users table via service role (bypasses RLS)
async function isAdmin(userId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userId)
    .single()
  return !!data
}

// GET /api/results — public: all confirmed results
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { searchParams } = new URL(request.url)
  const round = searchParams.get('round')

  let query = supabase
    .from('fixtures')
    .select('id, round, grp, home, away, kickoff_utc, venue, home_score, away_score, result_set_at')
    .not('home_score', 'is', null)
    .order('kickoff_utc')

  if (round) query = query.eq('round', round)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST /api/results — admin: enter or update a match result
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check admin_users table (service role — bypasses RLS)
  if (!await isAdmin(user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const parsed = ResultSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  }

  const { fixture_id, home, away, pen_winner } = parsed.data
  const admin = createAdminClient()

  const { data, error } = await (admin
    .from('fixtures') as any)
    .update({
      home_score:    home,
      away_score:    away,
      pen_winner:    pen_winner ?? null,
      result_set_at: new Date().toISOString(),
      result_set_by: user.id,
    })
    .eq('id', fixture_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // DB trigger scores all predictions automatically — just return the count
  const { count } = await admin
    .from('predictions')
    .select('id', { count: 'exact', head: true })
    .eq('fixture_id', fixture_id)
    .not('points_earned', 'is', null)

  // Auto-settle challenges for this fixture (non-blocking)
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    fetch(`${appUrl}/api/org-challenges/settle`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': request.headers.get('cookie') ?? '' },
      body:    JSON.stringify({ fixture_id }),
    }).catch(() => {})
  } catch { /* ignore */ }

  return NextResponse.json({ data, predictions_scored: count ?? 0 })
}

// DELETE /api/results?fixture_id=X — admin: clear a result
export async function DELETE(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!await isAdmin(user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const fixture_id = parseInt(searchParams.get('fixture_id') ?? '')
  if (isNaN(fixture_id)) return NextResponse.json({ error: 'fixture_id required' }, { status: 400 })

  const admin = createAdminClient()

  await (admin
    .from('fixtures') as any)
    .update({ home_score: null, away_score: null, result_set_at: null, result_set_by: null })
    .eq('id', fixture_id)

  await (admin
    .from('predictions') as any)
    .update({ points_earned: null })
    .eq('fixture_id', fixture_id)

  return NextResponse.json({ success: true })
}
