#!/usr/bin/env node
/**
 * bracket-schedule-sync.js — map ESPN R32 events to our bracket slots by STRUCTURE
 * (not kickoff order), and sync teams/date/venue per slot. Also backfills
 * bracket_slot on all knockout fixtures (from their seed labels) for the scoring fix.
 *
 *   node scripts/bracket-schedule-sync.js          # DRY RUN (no writes) — 16-slot before/after
 *   node scripts/bracket-schedule-sync.js --apply  # write
 */
const { createClient } = require('@supabase/supabase-js')
const { readFileSync } = require('fs')
const https = require('https')
const APPLY = process.argv.includes('--apply')

const env = {}
readFileSync(require('path').join(__dirname, '..', '.env.local'), 'utf8').split('\n').forEach(l => {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
})
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const get = u => new Promise((res, rej) => { https.get(u, r => { let s = ''; r.on('data', d => s += d); r.on('end', () => res(JSON.parse(s))) }).on('error', rej) })

// Canonical bracket structure (mirrors src/app/bracket/page.tsx R32_MATCHES).
const R32 = [
  ['r32:1', '1E', 'T1'], ['r32:2', '1I', 'T2'], ['r32:3', '2A', '2B'], ['r32:4', '1F', '2C'],
  ['r32:5', '2K', '2L'], ['r32:6', '1H', '2J'], ['r32:7', '1D', 'T3'], ['r32:8', '1G', 'T4'],
  ['r32:9', '1C', '2F'], ['r32:10', '2E', '2I'], ['r32:11', '1A', 'T5'], ['r32:12', '1L', 'T6'],
  ['r32:13', '1J', '2H'], ['r32:14', '2D', '2G'], ['r32:15', '1B', 'T7'], ['r32:16', '1K', 'T8'],
]
const THIRD = { T1:'ABCDF', T2:'CDFGH', T3:'BEFIJ', T4:'AEHIJ', T5:'CEFHI', T6:'EHIJK', T7:'EFGIJ', T8:'DEIJL' }
const descToSlot = {}; R32.forEach(([k,h,a]) => { descToSlot[h]=k; descToSlot[a]=k })

// One ESPN competitor → a slot descriptor ('1E'/'2A'/'T3') or a resolved real team.
function descOf(c) {
  const abbr = c.team?.abbreviation || '', dn = c.team?.displayName || ''
  if (/^[12][A-L]$/.test(abbr)) return { desc: abbr }
  if (/third place/i.test(dn)) {
    const mm = dn.match(/Group\s+([A-L/]+)/i)
    if (mm) { const g = mm[1].split('/').map(s=>s.trim()).filter(Boolean).sort().join('')
      for (const [t, set] of Object.entries(THIRD)) if (set.split('').sort().join('') === g) return { desc: t } }
    return { desc: '3RD?' }
  }
  return { team: dn }   // resolved real team
}

async function main() {
  const j = await get('https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260628-20260705&limit=300')
  const r32events = (j.events||[]).filter(e => /Place|Winner/i.test(e.name||'') && !/Round of 32/i.test(e.name||''))

  // Map each ESPN event → our slot (via the descriptor side).
  const plan = {}   // slot -> { utc, venue, home, away, eid }
  const unmapped = []
  for (const e of r32events) {
    const c = e.competitions[0]; const a = c.venue?.address
    const cs = c.competitors
    const home = cs.find(x=>x.homeAway==='home'), away = cs.find(x=>x.homeAway==='away')
    const dh = descOf(home), da = descOf(away)
    const slot = (dh.desc && descToSlot[dh.desc]) || (da.desc && descToSlot[da.desc]) || null
    if (!slot) { unmapped.push(e.name); continue }
    plan[slot] = {
      utc: new Date(e.date).toISOString(),
      venue: `${c.venue?.fullName||'TBD'}, ${a?.city||''}`,
      home: dh.team || home.team?.displayName, away: da.team || away.team?.displayName,
      eid: String(e.id),
    }
  }

  const { data: t } = await db.from('tournaments').select('id').eq('is_active', true).maybeSingle()
  const { data: fx } = await db.from('fixtures').select('id, home, away, kickoff_utc, venue, bracket_slot, home_score')
    .eq('tournament_id', t.id).eq('round', 'r32')
  // Index our fixtures by slot from their seed label ("TBD R32-1" → r32:1).
  const fixBySlot = {}
  for (const f of fx) { const m = String(f.home).match(/R32-(\d+)/); if (m) fixBySlot[`r32:${(parseInt(m[1])+1)/2}`] = f }

  console.log(`ESPN R32 events: ${r32events.length} | mapped slots: ${Object.keys(plan).length} | unmapped: ${unmapped.length}`)
  if (unmapped.length) console.log('  unmapped (both sides resolved — needs standings):', unmapped)
  console.log(`\n=== R32 slot mapping (before → after) ===`)
  let mappedToFixture = 0
  for (let n=1; n<=16; n++) {
    const slot = `r32:${n}`; const p = plan[slot]; const f = fixBySlot[slot]
    if (!p) { console.log(`${slot}: ⚠️ no ESPN match mapped`); continue }
    if (!f) { console.log(`${slot}: ⚠️ no fixture found for slot`); continue }
    mappedToFixture++
    console.log(`${slot}:  ${f.home} v ${f.away}  →  ${p.home} v ${p.away}`)
    console.log(`        ${f.kickoff_utc.slice(0,16)}Z → ${p.utc.slice(0,16)}Z | ${p.venue} | eid ${p.eid}`)
  }

  if (!APPLY) { console.log(`\n(DRY RUN) ${mappedToFixture}/16 slots ready. Re-run with --apply to write.`); return }
  if (mappedToFixture !== 16) { console.log(`\n!! only ${mappedToFixture}/16 slots mapped — ABORT (fix mapping before applying)`); return }

  console.log('\n=== APPLYING ===')
  // 1) Backfill bracket_slot on ALL knockout fixtures from their labels (for scoring).
  const ROUND_RE = { r16:/R16-(\d+)/, qf:/QF-(\d+)/, sf:/SF-(\d+)/, tp:/3rd-(\d+)/, f:/F(\d+)/ }
  for (const [round, re] of Object.entries(ROUND_RE)) {
    const { data: rfx } = await db.from('fixtures').select('id, home').eq('tournament_id', t.id).eq('round', round)
    for (const f of rfx||[]) { const m = String(f.home).match(re); if (!m) continue
      const slot = round==='tp' ? 'tp' : round==='f' ? 'final' : `${round}:${(parseInt(m[1])+1)/2}`
      await db.from('fixtures').update({ bracket_slot: slot }).eq('id', f.id) }
  }
  // 2) R32: set slot + ESPN teams/date/venue/event id (never clobber a played fixture).
  let ok = 0
  for (let n=1; n<=16; n++) {
    const slot = `r32:${n}`; const p = plan[slot]; const f = fixBySlot[slot]
    const { error } = await db.from('fixtures').update({
      bracket_slot: slot, espn_event_id: p.eid, home: p.home, away: p.away, kickoff_utc: p.utc, venue: p.venue,
    }).eq('id', f.id).is('home_score', null)
    if (error) console.log(`  ERR ${slot}:`, error.message); else ok++
  }
  console.log(`updated ${ok}/16 R32 fixtures + backfilled knockout bracket_slot`)
}
main().catch(e => { console.error(e); process.exit(1) })
