import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/sponsors/auth'
import { getTournamentBySlug } from '@/lib/content/wc'
import { settleDueStandings } from '@/lib/standings/settle'

export const dynamic = 'force-dynamic'

// POST /api/standings/settle  { tournament: slug } — admin.
// Settles any predictor quarters whose checkpoint is now complete. (Wire into the
// scores cron once EPL is active so it runs automatically.)
export async function POST(request: NextRequest) {
  const { admin, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { tournament } = await request.json().catch(() => ({}))
  const t = tournament ? await getTournamentBySlug(tournament) : null
  if (!t) return NextResponse.json({ error: 'tournament not found' }, { status: 404 })

  const settled = await settleDueStandings(admin, t.id)
  return NextResponse.json({ settled })
}
