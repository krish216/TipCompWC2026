import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// POST /api/org-challenges/settle — settle challenges for a fixture after result is entered
// Called automatically from the results API, or manually by tournament admin
export async function POST(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Allow tournament admin or org admin
  const { data: isAdmin } = await adminClient
    .from('admin_users').select('user_id').eq('user_id', user.id).single()
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { fixture_id } = await request.json()
  if (!fixture_id) return NextResponse.json({ error: 'fixture_id required' }, { status: 400 })

  // Get the fixture result
  const { data: fixture } = await supabase
    .from('fixtures').select('id, home, away, home_score, away_score').eq('id', fixture_id).single()
  if (!fixture || (fixture as any).home_score === null) {
    return NextResponse.json({ error: 'Fixture has no result yet' }, { status: 400 })
  }

  const { home_score, away_score } = fixture as any

  // Find unsettled challenges for this fixture
  const { data: challenges } = await (adminClient.from('org_challenges') as any)
    .select('id, org_id').eq('fixture_id', fixture_id).eq('settled', false)

  if (!challenges?.length) return NextResponse.json({ settled: 0, winners: 0 })

  let totalWinners = 0

  for (const challenge of challenges as any[]) {
    // Find org members who predicted the exact score
    const { data: orgMembers } = await adminClient
      .from('users').select('id').eq('org_id', challenge.org_id)
    const memberIds = (orgMembers ?? []).map((m: any) => m.id)

    if (memberIds.length === 0) continue

    const { data: exactPreds } = await adminClient
      .from('predictions')
      .select('user_id, home, away')
      .eq('fixture_id', fixture_id)
      .eq('home', home_score)
      .eq('away', away_score)
      .in('user_id', memberIds)

    // Insert winners
    for (const pred of exactPreds ?? []) {
      await (adminClient.from('challenge_winners') as any)
        .upsert({
          challenge_id: challenge.id,
          user_id:      (pred as any).user_id,
          prediction:   `${(pred as any).home}–${(pred as any).away}`,
        })
      totalWinners++
    }

    // Mark challenge as settled
    await (adminClient.from('org_challenges') as any)
      .update({ settled: true }).eq('id', challenge.id)
  }

  return NextResponse.json({ settled: challenges.length, winners: totalWinners })
}
