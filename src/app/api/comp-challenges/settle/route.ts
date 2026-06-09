import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { settleChallengesForFixture } from '@/lib/match-results'

// POST /api/comp-challenges/settle — settle challenges for a fixture after result is entered
// Called automatically from the results API, or manually by tournament admin.
// The core settlement logic is shared with the auto-sync cron via match-results.ts.
export async function POST(request: NextRequest) {
  const adminClient = createAdminClient()
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Allow tournament admin or org admin
  const { data: isAdmin } = await adminClient
    .from('admin_users').select('user_id').eq('user_id', user.id).single()
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { fixture_id } = await request.json()
  if (!fixture_id) return NextResponse.json({ error: 'fixture_id required' }, { status: 400 })

  // Guard: fixture must have a result before we settle.
  const { data: fixture } = await adminClient
    .from('fixtures').select('id, home_score').eq('id', fixture_id).single()
  if (!fixture || (fixture as any).home_score === null) {
    return NextResponse.json({ error: 'Fixture has no result yet' }, { status: 400 })
  }

  const { settled, winners } = await settleChallengesForFixture(adminClient, fixture_id)
  return NextResponse.json({ settled, winners })
}
