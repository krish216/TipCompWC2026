// Knockout schedule sync. The one-time mapping (scripts/bracket-schedule-sync.js)
// pinned each knockout fixture to its bracket_slot AND its ESPN event id. This keeps
// them fresh: for every knockout fixture that carries an espn_event_id and has no
// result yet, pull that ESPN event and refresh teams / kickoff / venue. Idempotent
// (event-id keyed, no re-mapping), and never touches a fixture that already has a
// score. Runs on the 5-min results cron so teams self-populate as groups/rounds resolve.

import { espnScoreboard } from '@/lib/match-results'
import { canonicalTeamName } from '@/lib/team-flags'

const yyyymmdd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '')
const DAY = 86_400_000

function espnFields(ev: any): { home: string; away: string; utc: string; venue: string } | null {
  const c = ev?.competitions?.[0]; if (!c) return null
  const home = (c.competitors ?? []).find((x: any) => x.homeAway === 'home')
  const away = (c.competitors ?? []).find((x: any) => x.homeAway === 'away')
  if (!home || !away) return null
  const a = c.venue?.address
  return {
    // Normalise ESPN names to our canonical spellings (e.g. 'United States' → 'USA',
    // 'Bosnia-Herzegovina' → 'Bosnia and Herzegovina') so knockout fixtures match
    // bonus/bracket picks. Non-team placeholders (e.g. 'Round of 32 11 Winner') pass through.
    home: canonicalTeamName(home.team?.displayName ?? ''),
    away: canonicalTeamName(away.team?.displayName ?? ''),
    utc:  new Date(ev.date).toISOString(),
    venue: `${c.venue?.fullName ?? 'TBD'}, ${a?.city ?? ''}`.replace(/, $/, ''),
  }
}

export async function refreshKnockoutSchedule(admin: any): Promise<{ updated: number; checked: number }> {
  const { data: t } = await admin.from('tournaments').select('id').eq('is_active', true).maybeSingle()
  const tid = (t as any)?.id
  if (!tid) return { updated: 0, checked: 0 }

  // Knockout fixtures we can refresh: mapped to an ESPN event, not yet played.
  const { data: fx } = await (admin.from('fixtures') as any)
    .select('id, home, away, kickoff_utc, venue, espn_event_id')
    .eq('tournament_id', tid)
    .not('espn_event_id', 'is', null)
    .is('home_score', null)
  const fixtures = (fx ?? []) as any[]
  if (!fixtures.length) return { updated: 0, checked: 0 }

  // One ESPN call spanning the mapped fixtures' kickoffs (± a day for ESPN's local dates).
  const times = fixtures.map(f => new Date(f.kickoff_utc).getTime()).filter(n => !Number.isNaN(n))
  const lo = times.length ? Math.min(...times) : Date.now()
  const hi = times.length ? Math.max(...times) : Date.now()
  const dates = `${yyyymmdd(new Date(lo - DAY))}-${yyyymmdd(new Date(hi + DAY))}`

  const byId = new Map<string, ReturnType<typeof espnFields>>()
  for (const ev of await espnScoreboard(dates)) {
    const f = espnFields(ev); if (f) byId.set(String(ev.id), f)
  }

  let updated = 0
  for (const f of fixtures) {
    const e = byId.get(String(f.espn_event_id))
    if (!e || !e.home || !e.away) continue
    const changed = e.home !== f.home || e.away !== f.away ||
      new Date(e.utc).getTime() !== new Date(f.kickoff_utc).getTime() || e.venue !== f.venue
    if (!changed) continue
    const { error } = await (admin.from('fixtures') as any)
      .update({ home: e.home, away: e.away, kickoff_utc: e.utc, venue: e.venue })
      .eq('id', f.id)
      .is('home_score', null)   // re-guard: never clobber a result that landed mid-run
    if (!error) updated++
  }
  return { updated, checked: fixtures.length }
}
