import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { footballDataMatches, footballDataRaw, FOOTBALL_DATA_COMPETITION, canonTeam } from '@/lib/match-results'

export const dynamic = 'force-dynamic'

// One-time mapping of local fixtures → football-data.org match ids (stored in
// fixtures.api_fixture_id).
//   GET  /api/admin/map-fixtures           → dry-run preview (matched / unmatched)
//   GET  /api/admin/map-fixtures?debug=1   → raw provider response (diagnose coverage)
//   POST /api/admin/map-fixtures           → commit ids for confident matches
// Admin-only. Group-stage games match on team aliases + date; knockouts (still
// "TBD" by name) match on exact kickoff time (venue as tiebreak).

const TIME_TOLERANCE_MS = 5 * 60_000 // knockout timestamp match tolerance

type Local = { id: number; round: string; home: string; away: string; kickoff_utc: string; venue: string | null; api_fixture_id: number | null }
type ApiFx = { apiId: number; ts: number; date: string; home: string; away: string; venue: string }
type Match = { localId: number; apiId: number | null; round: string; label: string; confidence: 'exact' | 'swapped' | 'time' | 'ambiguous' | 'unmatched'; note?: string }

async function requireAdmin() {
  const user = await getSessionUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }
  const admin = createAdminClient()
  const { data } = await admin.from('admin_users').select('user_id').eq('user_id', user.id).single()
  if (!data) return { error: 'Forbidden', status: 403 as const }
  return { admin }
}

const dayOf = (iso: string) => new Date(iso).toISOString().slice(0, 10)

async function buildMatches() {
  const admin = createAdminClient()
  const { data: localRows } = await (admin.from('fixtures') as any)
    .select('id, round, home, away, kickoff_utc, venue, api_fixture_id, tournament_id')
    .order('kickoff_utc', { ascending: true })
  const locals = (localRows ?? []) as Local[]

  const rawApi = await footballDataMatches()
  const api: ApiFx[] = rawApi.map((r: any) => ({
    apiId: r.id,
    ts: new Date(r.utcDate).getTime(),
    date: r.utcDate,
    home: r.homeTeam?.name ?? '',
    away: r.awayTeam?.name ?? '',
    venue: r.venue ?? '',
  })).filter((r: ApiFx) => r.apiId != null)

  const usedApiIds = new Set<number>()
  const matches: Match[] = []

  for (const f of locals) {
    const label = `${f.home} v ${f.away}`
    const localTs = new Date(f.kickoff_utc).getTime()

    let m: Match
    if (f.round === 'gs') {
      // Group stage: real team names — match on aliases + same calendar day.
      const h = canonTeam(f.home), a = canonTeam(f.away), d = dayOf(f.kickoff_utc)
      const exact = api.find(x => !usedApiIds.has(x.apiId) && dayOf(x.date) === d && canonTeam(x.home) === h && canonTeam(x.away) === a)
      const swap  = exact ? null : api.find(x => !usedApiIds.has(x.apiId) && dayOf(x.date) === d && canonTeam(x.home) === a && canonTeam(x.away) === h)
      if (exact)      m = { localId: f.id, apiId: exact.apiId, round: f.round, label, confidence: 'exact' }
      else if (swap)  m = { localId: f.id, apiId: swap.apiId,  round: f.round, label, confidence: 'swapped', note: 'home/away reversed vs API' }
      else            m = { localId: f.id, apiId: null, round: f.round, label, confidence: 'unmatched', note: 'no name+date match' }
    } else {
      // Knockouts: teams are placeholders — match on exact kickoff time.
      const near = api.filter(x => !usedApiIds.has(x.apiId) && Math.abs(x.ts - localTs) <= TIME_TOLERANCE_MS)
      if (near.length === 1) {
        m = { localId: f.id, apiId: near[0].apiId, round: f.round, label, confidence: 'time', note: 'matched by kickoff time' }
      } else if (near.length > 1) {
        const v = (f.venue ?? '').toLowerCase()
        const byVenue = near.filter(x => v && x.venue.toLowerCase().includes(v.split(',')[0].trim()))
        m = byVenue.length === 1
          ? { localId: f.id, apiId: byVenue[0].apiId, round: f.round, label, confidence: 'time', note: 'matched by time + venue' }
          : { localId: f.id, apiId: null, round: f.round, label, confidence: 'ambiguous', note: `${near.length} fixtures at this time` }
      } else {
        m = { localId: f.id, apiId: null, round: f.round, label, confidence: 'unmatched', note: 'no fixture at this kickoff time' }
      }
    }

    if (m.apiId != null) usedApiIds.add(m.apiId)
    matches.push(m)
  }

  return { matches, apiCount: api.length, localCount: locals.length }
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  // ?debug=1 — surface the raw football-data response so we can see coverage (season,
  // match count) and the provider's exact team-name spellings (to tune aliases).
  if (new URL(request.url).searchParams.get('debug') === '1') {
    try {
      const raw = await footballDataRaw(`competitions/${FOOTBALL_DATA_COMPETITION}/matches`)
      return NextResponse.json({
        debug: true,
        competition: FOOTBALL_DATA_COMPETITION,
        httpStatus: raw.httpStatus,
        message: raw.message ?? raw.error,
        filters: raw.filters,
        resultSet: raw.resultSet,
        count: raw.matches?.length ?? 0,
        sample: (raw.matches ?? []).slice(0, 3).map((m: any) => ({
          id: m.id, utcDate: m.utcDate, status: m.status, stage: m.stage, group: m.group,
          home: m.homeTeam?.name, away: m.awayTeam?.name,
        })),
      })
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 502 })
    }
  }

  try {
    const { matches, apiCount, localCount } = await buildMatches()
    const summary = matches.reduce((acc, m) => { acc[m.confidence] = (acc[m.confidence] ?? 0) + 1; return acc }, {} as Record<string, number>)
    return NextResponse.json({ mode: 'preview', apiCount, localCount, summary, matches })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 })
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  // ?force=1 re-maps fixtures that already have an api_fixture_id.
  const force = new URL(request.url).searchParams.get('force') === '1'

  try {
    const { matches } = await buildMatches()
    const admin = createAdminClient()

    // Only commit confident matches; leave ambiguous/unmatched for manual handling.
    const committable = matches.filter(m => m.apiId != null && m.confidence !== 'ambiguous')

    let written = 0
    for (const m of committable) {
      let q = (admin.from('fixtures') as any)
        .update({ api_fixture_id: m.apiId })
        .eq('id', m.localId)
      if (!force) q = q.is('api_fixture_id', null)
      const { error } = await q
      if (!error) written++
    }

    const unresolved = matches.filter(m => m.apiId == null)
    return NextResponse.json({ mode: 'commit', written, unresolved })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 })
  }
}
