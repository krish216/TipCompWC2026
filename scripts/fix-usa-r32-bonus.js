#!/usr/bin/env node
/**
 * fix-usa-r32-bonus.js — canonicalise fixture #107's team names and re-fire the
 * scoring trigger, so the R32 fav-team 2× recomputes for USA / Bosnia bonus pickers
 * (also fixes R32 bracket-challenge scoring, which is name-matched).
 *
 * Why the re-fire: the scoring trigger fires on UPDATE OF home_score/away_score,
 * NOT on team-name changes — so after renaming we write the scores back to their
 * existing values to re-run it (exactly how migration 081 re-scored globally).
 *
 *   node scripts/fix-usa-r32-bonus.js          # DRY RUN — before-state only, no writes
 *   node scripts/fix-usa-r32-bonus.js --apply  # rename + re-fire + after-state
 */
const { createClient } = require('@supabase/supabase-js')
const { readFileSync } = require('fs'); const { join } = require('path')
const APPLY = process.argv.includes('--apply')
for (const l of readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const FID = 107
const RENAMES = [
  { col: 'home', from: 'United States',      to: 'USA' },
  { col: 'away', from: 'Bosnia-Herzegovina', to: 'Bosnia and Herzegovina' },
]

// Print the fixture + how the bonus pickers who tipped it are currently scored.
async function snapshot(label) {
  const { data: fx } = await db.from('fixtures').select('id, home, away, home_score, away_score').eq('id', FID).single()
  console.log(`\n[${label}] fixture #${FID}: ${fx.home} v ${fx.away}  (${fx.home_score}-${fx.away_score})`)

  const { data: ut } = await db.from('user_tournaments')
    .select('user_id, favourite_team, users(first_name, display_name)')
    .in('favourite_team', ['USA', 'Bosnia and Herzegovina'])
  const ids    = (ut || []).map(u => u.user_id)
  const nameOf = new Map((ut || []).map(u => [u.user_id, `${u.users?.first_name || u.users?.display_name || '?'} (${u.favourite_team})`]))

  const { data: preds } = await db.from('predictions')
    .select('user_id, home, away, points_earned, standard_points, bonus_points')
    .eq('fixture_id', FID).in('user_id', ids)
  console.log(`  ${ids.length} bonus pickers · ${(preds || []).length} of them tipped this match`)
  for (const p of (preds || []).slice(0, 10)) {
    console.log(`   ${(nameOf.get(p.user_id) || '?').padEnd(30)} tip ${p.home}-${p.away}  pts_earned=${p.points_earned} (std=${p.standard_points}, bonus=${p.bonus_points})`)
  }
}

;(async () => {
  await snapshot('BEFORE')
  if (!APPLY) { console.log('\n(DRY RUN) re-run with --apply to rename + re-fire the scoring trigger.'); return }

  console.log('\n=== APPLYING ===')
  // 1. canonicalise names (guarded on the old value — idempotent)
  for (const r of RENAMES) {
    const { error } = await db.from('fixtures').update({ [r.col]: r.to }).eq('id', FID).eq(r.col, r.from)
    console.log(`  ${r.col}: '${r.from}' → '${r.to}'  ${error ? 'ERR ' + error.message : 'ok'}`)
  }
  // 2. re-fire the scoring trigger by writing the scores back (fires UPDATE OF home_score/away_score)
  const { data: fx } = await db.from('fixtures').select('home_score, away_score').eq('id', FID).single()
  const { error: rf } = await db.from('fixtures').update({ home_score: fx.home_score, away_score: fx.away_score }).eq('id', FID)
  console.log(`  re-fire scoring trigger (home_score=${fx.home_score}, away_score=${fx.away_score})  ${rf ? 'ERR ' + rf.message : 'ok'}`)

  await snapshot('AFTER')
  console.log('\n✅ Done. USA/Bosnia pickers who tipped #107 correctly should now show higher pts_earned (base doubled).')
})().catch(e => { console.error(e.message); process.exit(1) })
