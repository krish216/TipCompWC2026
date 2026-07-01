import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Debrief rounds in play order (earliest → latest). The group stage is a single
// combined debrief ('gs' over gs1+gs2+gs3), matching the chat auto-poster; the
// knockout rounds each get their own. Keep this in step with round-debrief-auto.ts.
const ORDER: { code: string; rounds: string[]; label: string }[] = [
  { code: 'gs',    rounds: ['gs1', 'gs2', 'gs3'], label: 'Group Stage' },
  { code: 'r32',   rounds: ['r32'],   label: 'Round of 32' },
  { code: 'r16',   rounds: ['r16'],   label: 'Round of 16' },
  { code: 'qf',    rounds: ['qf'],    label: 'Quarter-finals' },
  { code: 'sf',    rounds: ['sf'],    label: 'Semi-finals' },
  { code: 'tp',    rounds: ['tp'],    label: 'Third-place Playoff' },
  { code: 'final', rounds: ['final'], label: 'Final' },
]
const byCode = (code: string) => ORDER.find(o => o.code === code)

// GET /api/round-debrief-card?tribe_id={id}[&round=r16]
// Light gate for the leaderboard/predict card. With no round param it auto-resolves
// the MOST RECENT fully-scored debrief round for the tribe's tournament, so the card
// advances through the tournament in lockstep with the chat announcement. Pass an
// explicit round to pin the card to one round.
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const tribeId    = url.searchParams.get('tribe_id')
    const roundParam = url.searchParams.get('round')
    if (!tribeId) return NextResponse.json({ show: false })

    const admin = createAdminClient()
    const { data: tribe } = await (admin.from('tribes') as any).select('tournament_id').eq('id', tribeId).maybeSingle()
    const tournId = (tribe as any)?.tournament_id
    if (!tournId) return NextResponse.json({ show: false })

    const { data: fx } = await (admin.from('fixtures') as any)
      .select('round, home_score').eq('tournament_id', tournId)
    const fixtures = (fx ?? []) as { round: string; home_score: number | null }[]
    const isComplete = (rounds: string[]) => {
      const inSet = fixtures.filter(f => rounds.includes(f.round))
      return inSet.length > 0 && inSet.every(f => f.home_score != null)
    }

    // Pin to an explicit round if asked, otherwise the latest fully-scored one.
    let current: { code: string; rounds: string[]; label: string } | undefined
    if (roundParam) {
      const entry = byCode(roundParam) ?? { code: roundParam, rounds: [roundParam], label: 'Round' }
      if (isComplete(entry.rounds)) current = entry
    } else {
      for (let i = ORDER.length - 1; i >= 0; i--) {
        if (isComplete(ORDER[i].rounds)) { current = ORDER[i]; break }
      }
    }
    if (!current) return NextResponse.json({ show: false })

    // Prefer a configured round name (knockouts only); fall back to the built-in label.
    let roundName = current.label
    if (current.code !== 'gs') {
      const { data: tr } = await (admin.from('tournament_rounds') as any)
        .select('round_name').eq('tournament_id', tournId).eq('round_code', current.code).maybeSingle()
      if ((tr as any)?.round_name) roundName = (tr as any).round_name
    }

    return NextResponse.json({ show: true, round_code: current.code, round_name: roundName })
  } catch {
    return NextResponse.json({ show: false })
  }
}
