#!/usr/bin/env node
/**
 * sync-knockout-espn.js — map a knockout round's fixtures to their ESPN event ids
 * (matched by kickoff) so the cron self-populates them, and fill any teams ESPN has
 * already resolved. Never touches a fixture that has a score. Names normalised to
 * our canonical spellings.
 *
 *   node scripts/sync-knockout-espn.js <round>          # DRY RUN  (round: r16|qf|sf|tp|f)
 *   node scripts/sync-knockout-espn.js <round> --apply  # write
 */
const { createClient } = require('@supabase/supabase-js')
const { readFileSync } = require('fs'); const { join } = require('path'); const https = require('https')
const ROUND = process.argv[2]
const APPLY = process.argv.includes('--apply')
if (!ROUND) { console.error('usage: node scripts/sync-knockout-espn.js <round> [--apply]'); process.exit(1) }
for (const l of readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const get = u => new Promise((res, rej) => { https.get(u, r => { let s = ''; r.on('data', d => s += d); r.on('end', () => res(JSON.parse(s))) }).on('error', rej) })

// ESPN spelling → our canonical name.
const CANON = { 'United States': 'USA', 'Bosnia-Herzegovina': 'Bosnia and Herzegovina', 'Cape Verde': 'Cabo Verde', 'Congo DR': 'DR Congo', 'Türkiye': 'Turkey', 'Turkiye': 'Turkey' }
const canon = n => CANON[(n || '').trim()] || (n || '').trim()
// A resolved team name has no digits and none of ESPN's structural placeholder words
// ('Round of 16 1 Winner', 'Semifinal 1 Loser', '2A', 'Group B Runner-up', …).
const isReal = n => n && !/\d/.test(n) && !/\b(winner|loser|runner|place|final|semifinal|quarterfinal|group)\b/i.test(n)
const yyyymmdd = d => d.toISOString().slice(0, 10).replace(/-/g, '')
const DAY = 86_400_000

;(async () => {
  const { data: t } = await db.from('tournaments').select('id').eq('is_active', true).maybeSingle()
  const { data: fx } = await db.from('fixtures').select('id, bracket_slot, home, away, kickoff_utc, home_score').eq('tournament_id', t.id).eq('round', ROUND).order('kickoff_utc')
  if (!fx?.length) { console.error(`No ${ROUND} fixtures found`); process.exit(1) }

  const times = fx.map(f => new Date(f.kickoff_utc).getTime())
  const dates = `${yyyymmdd(new Date(Math.min(...times) - DAY))}-${yyyymmdd(new Date(Math.max(...times) + DAY))}`
  const j = await get(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${dates}&limit=200`)
  const espn = {}
  for (const e of (j.events || [])) {
    const c = e.competitions?.[0]; if (!c) continue
    const h = (c.competitors || []).find(x => x.homeAway === 'home'), a = (c.competitors || []).find(x => x.homeAway === 'away')
    if (!h || !a) continue
    espn[new Date(e.date).getTime()] = { eid: String(e.id), home: canon(h.team?.displayName || ''), away: canon(a.team?.displayName || '') }
  }

  const plan = []
  for (const f of fx) {
    const e = espn[new Date(f.kickoff_utc).getTime()]
    if (!e) { console.log(`${f.bracket_slot} #${f.id}: ⚠️ no ESPN ${ROUND} event at ${f.kickoff_utc}`); continue }
    plan.push({ id: f.id, slot: f.bracket_slot, eid: e.eid, curHome: f.home, curAway: f.away, hadScore: f.home_score != null,
      newHome: isReal(e.home) ? e.home : f.home, newAway: isReal(e.away) ? e.away : f.away })
  }
  console.log(`\n=== ${ROUND.toUpperCase()} ESPN sync plan (${plan.length}/${fx.length}) ===`)
  for (const p of plan) {
    console.log(`${p.slot} #${p.id}  eid ${p.eid}${p.hadScore ? '  (HAS SCORE — skip)' : ''}`)
    console.log(`   home: ${p.curHome}${p.newHome !== p.curHome ? `  →  ${p.newHome}` : '  (unchanged)'}`)
    console.log(`   away: ${p.curAway}${p.newAway !== p.curAway ? `  →  ${p.newAway}` : '  (unchanged)'}`)
  }
  if (!APPLY) { console.log('\n(DRY RUN) re-run with --apply to write.'); return }
  let ok = 0
  for (const p of plan) {
    const { error } = await db.from('fixtures').update({ espn_event_id: p.eid, home: p.newHome, away: p.newAway }).eq('id', p.id).is('home_score', null)
    if (error) console.log(`  ERR #${p.id}: ${error.message}`); else ok++
  }
  console.log(`\n✅ updated ${ok}/${plan.length} ${ROUND} fixtures (espn_event_id + resolved teams)`)
})().catch(e => { console.error(e.message); process.exit(1) })
