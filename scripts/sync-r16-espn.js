#!/usr/bin/env node
/**
 * sync-r16-espn.js — backfill espn_event_id on R16 fixtures (matched to ESPN by
 * kickoff) so the knockout cron self-populates teams, and fill the already-resolved
 * teams now. Never touches a fixture that has a score.
 *   node scripts/sync-r16-espn.js          # DRY RUN
 *   node scripts/sync-r16-espn.js --apply  # write
 */
const { createClient } = require('@supabase/supabase-js')
const { readFileSync } = require('fs'); const { join } = require('path'); const https = require('https')
const APPLY = process.argv.includes('--apply')
for (const l of readFileSync(join(__dirname,'..','.env.local'),'utf8').split('\n')) { const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&!process.env[m[1]]) process.env[m[1]]=m[2].replace(/^["']|["']$/g,'') }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const get = u => new Promise((res,rej)=>{https.get(u,r=>{let s='';r.on('data',d=>s+=d);r.on('end',()=>res(JSON.parse(s)))}).on('error',rej)})
const isReal = dn => dn && !/winner|runner|place|^\s*[12][A-L]\s*$/i.test(dn)

;(async()=>{
  const j = await get('https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260704-20260707&limit=100')
  const espn = {}
  for (const e of (j.events||[])) {
    if (!/round-of-16/i.test(e.competitions?.[0]?.notes?.[0]?.headline||e.season?.slug||'')) {}
    const c = e.competitions?.[0]; if(!c) continue
    const h = (c.competitors||[]).find(x=>x.homeAway==='home'), a=(c.competitors||[]).find(x=>x.homeAway==='away')
    if(!h||!a) continue
    espn[new Date(e.date).getTime()] = { eid:String(e.id), home:h.team?.displayName||'', away:a.team?.displayName||'', name:e.name }
  }
  const { data: t } = await db.from('tournaments').select('id').eq('is_active',true).maybeSingle()
  const { data: fx } = await db.from('fixtures').select('id, bracket_slot, home, away, kickoff_utc, home_score').eq('tournament_id',t.id).eq('round','r16').order('kickoff_utc')

  const plan=[]
  for (const f of fx||[]) {
    const e = espn[new Date(f.kickoff_utc).getTime()]
    if (!e) { console.log(`${f.bracket_slot} #${f.id}: ⚠️ no ESPN R16 event at ${f.kickoff_utc}`); continue }
    const upd = { id:f.id, slot:f.bracket_slot, eid:e.eid, hadScore: f.home_score!=null }
    upd.newHome = isReal(e.home) ? e.home : f.home
    upd.newAway = isReal(e.away) ? e.away : f.away
    upd.curHome=f.home; upd.curAway=f.away
    plan.push(upd)
  }
  console.log(`\n=== R16 ESPN sync plan (${plan.length}/8) ===`)
  for (const p of plan) {
    const hChg = p.newHome!==p.curHome, aChg=p.newAway!==p.curAway
    console.log(`${p.slot} #${p.id}  eid ${p.eid}  ${p.hadScore?'(HAS SCORE — skip)':''}`)
    console.log(`   home: ${p.curHome}${hChg?`  →  ${p.newHome}`:'  (unchanged)'}`)
    console.log(`   away: ${p.curAway}${aChg?`  →  ${p.newAway}`:'  (unchanged)'}`)
  }
  if(!APPLY){ console.log('\n(DRY RUN) re-run with --apply to write.'); return }
  let ok=0
  for (const p of plan) {
    const { error } = await db.from('fixtures').update({ espn_event_id:p.eid, home:p.newHome, away:p.newAway }).eq('id',p.id).is('home_score',null)
    if(error) console.log(`  ERR #${p.id}: ${error.message}`); else ok++
  }
  console.log(`\n✅ updated ${ok}/${plan.length} R16 fixtures (espn_event_id + resolved teams)`)
})().catch(e=>{console.error(e.message);process.exit(1)})
