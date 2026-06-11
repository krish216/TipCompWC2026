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
const MAP_VERSION = 'teampair-1'     // bump on logic changes to confirm which build served

type Local = { id: number; round: string; home: string; away: string; kickoff_utc: string; venue: string | null; api_fixture_id: number | null }
type ApiFx = { apiId: number; ts: number; date: string; home: string; away: string; venue: string }
type Match = { localId: number; apiId: number | null; round: string; label: string; confidence: 'exact' | 'swapped' | 'time' | 'ambiguous' | 'unmatched' | 'skipped'; note?: string }

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
  // Every team name the provider knows — used to pinpoint a genuinely-missing team.
  const apiTeams = new Set<string>(api.flatMap(x => [canonTeam(x.home), canonTeam(x.away)]))

  for (const f of locals) {
    const label = `${f.home} v ${f.away}`
    const localTs = new Date(f.kickoff_utc).getTime()

    // Warm-up / practice round — hypothetical results, never auto-synced. Don't map
    // (and don't let it consume a real match's API id).
    if (f.round === 'wup') {
      matches.push({ localId: f.id, apiId: null, round: f.round, label, confidence: 'skipped', note: 'warm-up/practice — not mapped' })
      continue
    }

    let m: Match
    if (f.round.startsWith('gs')) {
      // Group stage: each pairing occurs exactly once, so match on the team pair ALONE
      // (ignore date). This is robust to the seed assigning a game to the wrong matchday
      // /date; any such drift is surfaced in the note so the fixture date can be fixed.
      const h = canonTeam(f.home), a = canonTeam(f.away)
      const aligned  = api.find(x => !usedApiIds.has(x.apiId) && canonTeam(x.home) === h && canonTeam(x.away) === a)
      const reversed = aligned ? null : api.find(x => !usedApiIds.has(x.apiId) && canonTeam(x.home) === a && canonTeam(x.away) === h)
      const hit = aligned ?? reversed
      if (hit) {
        const drift = dayOf(hit.date) !== dayOf(f.kickoff_utc)
        const note = [
          reversed ? 'home/away reversed vs API' : null,
          drift ? `⚠ date differs: seed ${dayOf(f.kickoff_utc)} vs actual ${dayOf(hit.date)}` : null,
        ].filter(Boolean).join('; ') || undefined
        m = { localId: f.id, apiId: hit.apiId, round: f.round, label, confidence: reversed ? 'swapped' : 'exact', note }
      } else {
        const missing = [f.home, f.away].filter(t => !apiTeams.has(canonTeam(t)))
        m = { localId: f.id, apiId: null, round: f.round, label, confidence: 'unmatched',
          note: missing.length ? `team not in competition: ${missing.join(', ')}` : 'no team-pair match' }
      }
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

  // ?match=<id> — compare the single-match endpoint (/v4/matches/{id}) against the
  // cached competition-list endpoint for the same match, to see which has the score.
  const matchId = new URL(request.url).searchParams.get('match')
  if (matchId) {
    try {
      const [single, list] = await Promise.all([
        footballDataRaw(`matches/${matchId}`),
        footballDataRaw(`competitions/${FOOTBALL_DATA_COMPETITION}/matches`),
      ])
      const fromList = (list.matches ?? []).find((m: any) => String(m.id) === String(matchId))
      return NextResponse.json({
        match_id: matchId,
        single_endpoint: {
          httpStatus: single.httpStatus,
          status: single.status ?? single.match?.status,
          score:  single.score  ?? single.match?.score,
        },
        list_endpoint: {
          status: fromList?.status ?? null,
          score:  fromList?.score ?? null,
        },
      })
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 502 })
    }
  }

  // ?debug=1 — surface the raw football-data response so we can see coverage (season,
  // match count) and the provider's exact team-name spellings (to tune aliases).
  if (new URL(request.url).searchParams.get('debug') === '1') {
    try {
      const raw = await footballDataRaw(`competitions/${FOOTBALL_DATA_COMPETITION}/matches`)
      const all = (raw.matches ?? []) as any[]
      // Unique team names exactly as football-data spells them — used to tune aliases.
      const teamSet = new Set<string>()
      for (const m of all) {
        if (m.homeTeam?.name) teamSet.add(m.homeTeam.name)
        if (m.awayTeam?.name) teamSet.add(m.awayTeam.name)
      }
      return NextResponse.json({
        debug: true,
        competition: FOOTBALL_DATA_COMPETITION,
        httpStatus: raw.httpStatus,
        message: raw.message ?? raw.error,
        filters: raw.filters,
        resultSet: raw.resultSet,
        count: all.length,
        teams: [...teamSet].sort(),
      })
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 502 })
    }
  }

  // ?status=1 — show football-data's live status + score for each mapped fixture next
  // to ours, so we can see whether a result has actually been published upstream yet.
  if (new URL(request.url).searchParams.get('status') === '1') {
    try {
      const all = await footballDataMatches()
      const byId = new Map<number, any>(all.map((m: any) => [m.id, m]))
      const admin = createAdminClient()
      const { data: locals } = await (admin.from('fixtures') as any)
        .select('id, home, away, kickoff_utc, api_fixture_id, home_score, away_score')
        .not('api_fixture_id', 'is', null)
        .neq('round', 'wup')
        .order('kickoff_utc', { ascending: true })
        .limit(16)
      const ft = (m: any) => m?.score?.fullTime ?? {}
      const rows = (locals ?? []).map((f: any) => {
        const m = byId.get(f.api_fixture_id)
        const s = ft(m)
        const fdHome = s.home ?? s.homeTeam, fdAway = s.away ?? s.awayTeam
        return {
          fixture:     `${f.home} v ${f.away}`,
          kickoff_utc: f.kickoff_utc,
          api_id:      f.api_fixture_id,
          fd_status:   m?.status ?? 'NOT IN FEED',
          fd_score:    (fdHome != null && fdAway != null) ? `${fdHome}-${fdAway}` : null,
          our_result:  f.home_score != null ? `${f.home_score}-${f.away_score}` : 'pending',
          raw_score:   m?.score ?? null,   // exact football-data score object, to diagnose parsing
        }
      })
      return NextResponse.json({ now: new Date().toISOString(), rows })
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 502 })
    }
  }

  try {
    const { matches, apiCount, localCount } = await buildMatches()
    const summary = matches.reduce((acc, m) => { acc[m.confidence] = (acc[m.confidence] ?? 0) + 1; return acc }, {} as Record<string, number>)
    return NextResponse.json(
      { mode: 'preview', version: MAP_VERSION, apiCount, localCount, summary, matches },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    )
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

    const unresolved = matches.filter(m => m.apiId == null && m.confidence !== 'skipped')
    return NextResponse.json({ mode: 'commit', written, unresolved })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 })
  }
}
