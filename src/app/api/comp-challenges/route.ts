import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/comp-challenges?comp_id=  — get all challenges for an org
// GET /api/comp-challenges?fixture_id= — get challenge for a specific fixture (any org)
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { searchParams } = new URL(request.url)
  const compId     = searchParams.get('comp_id')
  const fixtureId = searchParams.get('fixture_id')

  if (fixtureId) {
    // Return challenges across all orgs for a given fixture (used on predict page)
    const { data, error } = await supabase
      .from('comp_challenges')
      .select('id, comp_id, fixture_id, prize, sponsor, challenge_date, settled, comps(name, logo_url)')
      .eq('fixture_id', parseInt(fixtureId))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: (data ?? []) as any[] })
  }

  if (!compId) return NextResponse.json({ error: 'comp_id or fixture_id required' }, { status: 400 })

  const { data, error } = await supabase
    .from('comp_challenges')
    .select(`
      id, fixture_id, prize, sponsor, challenge_date, settled,
      fixtures(id, home, away, kickoff_utc, round),
      challenge_winners(user_id, prediction, settled_at, users(display_name))
    `)
    .eq('comp_id', compId)
    .order('challenge_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: (data ?? []) as any[] })
}

// POST /api/comp-challenges — create a challenge (org admin only)
export async function POST(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { comp_id, fixture_id, prize, sponsor } = await request.json()
  if (!comp_id || !fixture_id || !prize?.trim()) {
    return NextResponse.json({ error: 'comp_id, fixture_id and prize required' }, { status: 400 })
  }

  // Verify org admin
  const { data: isCompAdmin } = await (adminClient.from('comp_admins') as any)
    .select('user_id').eq('user_id', user.id).eq('comp_id', comp_id).single()
  if (!isCompAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Get fixture kickoff date to derive challenge_date
  const { data: fixture } = await supabase
    .from('fixtures').select('kickoff_utc, home_score').eq('id', fixture_id).single()
  if (!fixture) return NextResponse.json({ error: 'Fixture not found' }, { status: 404 })
  if ((fixture as any).home_score !== null) {
    return NextResponse.json({ error: 'Cannot create a challenge for a match that has already been played' }, { status: 400 })
  }

  const challengeDate = (fixture as any).kickoff_utc.slice(0, 10) // YYYY-MM-DD

  const { data, error } = await (adminClient.from('comp_challenges') as any)
    .insert({
      comp_id, fixture_id, prize: prize.trim(),
      sponsor:        sponsor?.trim() || null,
      challenge_date: challengeDate,
      created_by:     user.id,
    })
    .select().single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A challenge already exists for this date in your comp' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data }, { status: 201 })
}

// DELETE /api/comp-challenges?id= — delete unsettled challenge
export async function DELETE(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Only delete if not settled
  const { data: ch } = await (adminClient.from('comp_challenges') as any)
    .select('comp_id, settled').eq('id', id).single()
  if (!ch) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if ((ch as any).settled) return NextResponse.json({ error: 'Cannot delete a settled challenge' }, { status: 400 })

  await (adminClient.from('comp_challenges') as any).delete().eq('id', id)
  return NextResponse.json({ success: true })
}
