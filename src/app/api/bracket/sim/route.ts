import { NextRequest, NextResponse } from 'next/server'
import { getPrimaryTournament } from '@/lib/content/wc'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'
import { SCORED_SLOTS } from '@/lib/bracket-scoring'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const SIM_MODE_KEY = 'bracket_sim_mode'

async function requireAdmin(admin: any) {
  const user = await getSessionUser()
  if (!user) return { ok: false as const, status: 401 }
  const { data } = await admin.from('admin_users').select('user_id').eq('user_id', user.id).single()
  if (!data) return { ok: false as const, status: 403 }
  return { ok: true as const, user }
}

async function activeTournamentId(admin: any): Promise<string | null> {
  const data = await getPrimaryTournament(admin)
  return (data as any)?.id ?? null
}

// All bracket picks for the tournament, paged past PostgREST's 1000 cap.
async function allPicks(admin: any, tid: string): Promise<any[]> {
  let from = 0
  const rows: any[] = []
  for (;;) {
    const { data } = await admin.from('bracket_picks').select('slot_key, team_name').eq('tournament_id', tid).range(from, from + 999)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  return rows
}

export async function GET() {
  const admin = createAdminClient()
  const gate = await requireAdmin(admin)
  if (!gate.ok) return NextResponse.json({ error: 'Forbidden' }, { status: gate.status })

  const tid = await activeTournamentId(admin)
  if (!tid) return NextResponse.json({ sim_mode: false, winners: {}, teams: [] })

  const { data: mode } = await (admin.from('app_settings') as any).select('value').eq('key', SIM_MODE_KEY).maybeSingle()
  const { data: sim }  = await (admin.from('bracket_sim_results') as any).select('slot_key, team_name').eq('tournament_id', tid)
  const winners: Record<string, string> = {}
  ;((sim ?? []) as any[]).forEach(r => { if (r.team_name) winners[r.slot_key] = r.team_name })

  // Team pool for the dropdowns = distinct teams users actually picked in knockout slots.
  const scored = new Set(SCORED_SLOTS.map(s => s.slot))
  const picks = await allPicks(admin, tid)
  const teams = Array.from(new Set(picks.filter(p => scored.has(p.slot_key) && p.team_name).map(p => p.team_name as string))).sort()

  return NextResponse.json({ sim_mode: (mode as any)?.value === 'on', winners, teams })
}

export async function POST(request: NextRequest) {
  const admin = createAdminClient()
  const gate = await requireAdmin(admin)
  if (!gate.ok) return NextResponse.json({ error: 'Forbidden' }, { status: gate.status })

  const tid = await activeTournamentId(admin)
  if (!tid) return NextResponse.json({ error: 'No active tournament' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const action = body.action as 'save' | 'auto' | 'clear'
  const now = new Date().toISOString()

  if (action === 'clear') {
    await (admin.from('bracket_sim_results') as any).delete().eq('tournament_id', tid)
    await (admin.from('app_settings') as any).upsert({ key: SIM_MODE_KEY, value: 'off', updated_at: now })
    return NextResponse.json({ ok: true })
  }

  if (action === 'auto') {
    // Per slot, pick the most-commonly-predicted team (guarantees a realistic,
    // score-producing simulation relative to the entrants).
    const picks = await allPicks(admin, tid)
    const tally: Record<string, Record<string, number>> = {}
    for (const p of picks) {
      if (!p.team_name) continue
      ;(tally[p.slot_key] ??= {})[p.team_name] = (tally[p.slot_key][p.team_name] ?? 0) + 1
    }
    const rows = SCORED_SLOTS.map(s => {
      const counts = tally[s.slot] ?? {}
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
      return { tournament_id: tid, slot_key: s.slot, team_name: top, updated_at: now }
    }).filter(r => r.team_name)
    if (rows.length) await (admin.from('bracket_sim_results') as any).upsert(rows)
    return NextResponse.json({ ok: true, filled: rows.length })
  }

  // action === 'save': persist sim_mode + the supplied winners.
  const winners = (body.winners ?? {}) as Record<string, string>
  const scored = new Set(SCORED_SLOTS.map(s => s.slot))
  const rows = Object.entries(winners)
    .filter(([slot, team]) => scored.has(slot) && team)
    .map(([slot, team]) => ({ tournament_id: tid, slot_key: slot, team_name: team, updated_at: now }))
  // Replace the set: clear then insert what was provided.
  await (admin.from('bracket_sim_results') as any).delete().eq('tournament_id', tid)
  if (rows.length) await (admin.from('bracket_sim_results') as any).insert(rows)
  await (admin.from('app_settings') as any).upsert({ key: SIM_MODE_KEY, value: body.sim_mode ? 'on' : 'off', updated_at: now })

  return NextResponse.json({ ok: true })
}
