#!/usr/bin/env node
/**
 * assign-bonus-teams.js — assign a RANDOM bonus (favourite) team to wc2026 users who
 * never picked one, and flag it system-assigned (user_tournaments.favourite_team_auto).
 *
 *   Pool   : tournament_teams (WC2026) minus the eliminated teams below.
 *   Target : users with favourite_team IS NULL who made >=1 group-stage prediction.
 *
 * Read-only DRY RUN by default. Pass --apply to write.
 * Requires migration 130 (favourite_team_auto) to be run first for --apply.
 *
 * Usage: node scripts/assign-bonus-teams.js [--apply]
 */
const { createClient } = require('@supabase/supabase-js')
const { readFileSync } = require('fs')
const { join } = require('path')

const env = {}
try {
  readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  })
} catch {}
const url = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Missing env'); process.exit(1) }
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const APPLY = process.argv.includes('--apply')
const ELIMINATED = ['Turkey', 'Senegal', 'Haiti', 'Tunisia', 'Jordan', 'Panama',
  'Iraq', 'New Zealand', 'Saudi Arabia', 'Uzbekistan']

async function main() {
  const { data: t } = await db.from('tournaments').select('id').eq('slug', 'wc2026').single()
  const tid = t.id

  // Pool: tournament_teams ∩ actual GS participants, minus eliminated.
  const { data: tt } = await db.from('tournament_teams').select('name').eq('tournament_id', tid)
  const { data: gs } = await db.from('fixtures').select('id, home, away').eq('tournament_id', tid).in('round', ['gs1', 'gs2', 'gs3'])
  const participants = new Set(); gs.forEach(f => { participants.add(f.home); participants.add(f.away) })
  const elimSet = new Set(ELIMINATED)
  const pool = tt.map(x => x.name).filter(n => participants.has(n) && !elimSet.has(n)).sort()
  console.log(`Pool: ${pool.length} teams (tournament_teams ∩ participants − ${ELIMINATED.length} eliminated)`)
  console.log(`  ${pool.join(', ')}\n`)

  // Eligible: favourite_team IS NULL + >=1 GS prediction + NOT a mock account.
  const { data: noFav } = await db.from('user_tournaments').select('user_id').eq('tournament_id', tid).is('favourite_team', null)
  const noFavSet = new Set(noFav.map(u => u.user_id))
  const { data: mock } = await db.from('users').select('id').like('email', '%@tribepicks.dev')
  mock.forEach(m => noFavSet.delete(m.id))   // mock seed accounts get nothing
  console.log(`Excluded ${mock.length} mock (@tribepicks.dev) accounts.`)
  const gsIds = gs.map(f => f.id)
  const eligible = new Set()
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from('predictions').select('user_id, id').in('fixture_id', gsIds)
      .order('id', { ascending: true }).range(from, from + 999)
    if (!data || !data.length) break
    data.forEach(p => { if (noFavSet.has(p.user_id)) eligible.add(p.user_id) })
    if (data.length < 1000) break
  }
  const targets = [...eligible]
  console.log(`Eligible: ${noFavSet.size} users w/o bonus team → ${targets.length} with >=1 GS prediction\n`)

  // Random assignment.
  const pick = () => pool[Math.floor(Math.random() * pool.length)]
  const assignments = targets.map(user_id => ({ user_id, tournament_id: tid, favourite_team: pick(), favourite_team_auto: true }))

  // Distribution preview.
  const dist = {}; assignments.forEach(a => { dist[a.favourite_team] = (dist[a.favourite_team] || 0) + 1 })
  console.log('Assignment distribution (random):')
  Object.entries(dist).sort((a, b) => b[1] - a[1]).forEach(([n, c]) => console.log(`  ${n.padEnd(24)} ${c}`))
  console.log('\nSamples:')
  assignments.slice(0, 5).forEach(a => console.log(`  ${a.user_id}  →  ${a.favourite_team}`))

  if (!APPLY) {
    console.log(`\n[DRY RUN] Would assign ${assignments.length} users. Re-run with --apply to write.`)
    return
  }

  console.log(`\n[APPLY] Writing ${assignments.length} assignments…`)
  let done = 0
  for (let i = 0; i < assignments.length; i += 100) {
    const chunk = assignments.slice(i, i + 100)
    const { error } = await db.from('user_tournaments').upsert(chunk, { onConflict: 'user_id,tournament_id' })
    if (error) { console.error('  upsert error:', error.message); process.exit(1) }
    done += chunk.length
    console.log(`  ${done}/${assignments.length}`)
  }
  console.log('✓ Done.')
}
main().catch(e => { console.error(e); process.exit(1) })
