import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { refreshAllChallengeRanks } from '@/lib/challenge-rank'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET /api/cron/challenge-ranks — nightly recompute of stored challenge finishing ranks.
// Reuses the live leaderboard scoring (see lib/challenge-rank.ts). Bearer-auth with CRON_SECRET,
// mirroring the weekly-report / score-sync crons. Scheduled via
// supabase/saved-migrations/challenge-ranks-pg_cron.sql.
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const summary = await refreshAllChallengeRanks(createAdminClient())
  return NextResponse.json({ ok: true, ...summary })
}
