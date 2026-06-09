import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { apiFootballFixtures, apiFootballRaw, canonTeam } from '@/lib/match-results'

export const dynamic = 'force-dynamic'

// One-time mapping of local fixtures → API-Football fixture ids.
//   GET  /api/admin/map-fixtures   → dry-run preview (matched / unmatched), writes nothing
//   POST /api/admin/map-fixtures   → commit api_fixture_id for confident matches
// Admin-only. Group-stage games match on team aliases + date; knockouts (still
// "TBD" by name) match on exact kickoff time (venue as tiebreak).

const LEAGUE_ID = Number(process.env.API_FOOTBALL_LEAGUE_ID ?? 1)   // 1 = World Cup
const SEASON    = Number(process.env.API_FOOTBALL_SEASON ?? 2026)
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

  const rawApi = await apiFootballFixtures(`league=${LEAGUE_ID}&season=${SEASON}`)
  const api: ApiFx[] = rawApi.map((r: any) => ({
    apiId: r.fixture?.id,
    ts: r.fixture?.timestamp ? r.fixture.timestamp * 1000 : new Date(r.fixture?.date).getTime(),
    date: r.fixture?.date,
    home: r.teams?.home?.name ?? '',
    away: r.teams?.away?.name ?? '',
    venue: r.fixture?.venue?.name ?? '',
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

  // ?debug=1 — surface the raw API-Football response + account/plan status so we can
  // see *why* a query returns no fixtures (e.g. season not on the free plan).
  if (new URL(request.url).searchParams.get('debug') === '1') {
    try {
      const [fx, status] = await Promise.all([
        apiFootballRaw('fixtures', `league=${LEAGUE_ID}&season=${SEASON}`),
        apiFootballRaw('status'),
      ])
      return NextResponse.json({
        debug: true,
        query: { league: LEAGUE_ID, season: SEASON },
        fixtures: { httpStatus: fx.httpStatus, results: fx.results, errors: fx.errors, paging: fx.paging, sample: (fx.response ?? []).slice(0, 1) },
        account: { httpStatus: status.httpStatus, errors: status.errors, response: status.response },
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
