#!/usr/bin/env node
/**
 * backfill-user-tournaments.js
 *
 * One-off fix: enrol guest accounts that were created WITHOUT a user_tournaments
 * row (the old fire-and-forget enrol fetch in guest-enter could be dropped by the
 * serverless runtime). Idempotent — safe to re-run. Mirrors the real enrol logic:
 * since the tournament is under way (bonus picker locked) it auto-allocates a still
 * alive Round-of-32 team, and never clobbers an existing favourite_team.
 *
 * Usage: node scripts/backfill-user-tournaments.js
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (read from .env.local).
 */
const { createClient } = require('@supabase/supabase-js')
const { readFileSync } = require('fs')
const { join } = require('path')

// Minimal .env.local loader (no dotenv dependency).
function loadEnv() {
  try {
    const txt = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* env may already be exported */ }
}
loadEnv()

const USER_IDS = [
  'eb56dbaf-d860-4a9b-a6d9-49461cd1b99b',
  '4ed0bb48-652d-4552-a6d5-1889149d587d',
]

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const admin = createClient(url, key)

// Alive pool = real teams (in tournament_teams) drawn into the R32 fixtures.
async function aliveTeamPool(tournamentId) {
  const [{ data: r32 }, { data: roster }] = await Promise.all([
    admin.from('fixtures').select('home, away').eq('tournament_id', tournamentId).eq('round', 'r32'),
    admin.from('tournament_teams').select('name').eq('tournament_id', tournamentId),
  ])
  const real = new Set((roster ?? []).map(t => t.name))
  const pool = new Set()
  for (const f of r32 ?? []) {
    if (real.has(f.home)) pool.add(f.home)
    if (real.has(f.away)) pool.add(f.away)
  }
  return [...pool]
}

async function main() {
  const { data: tourn } = await admin.from('tournaments').select('id, name').eq('is_active', true).maybeSingle()
  if (!tourn) { console.error('No active tournament'); process.exit(1) }
  console.log(`Active tournament: ${tourn.name} (${tourn.id})`)

  const pool = await aliveTeamPool(tourn.id)
  console.log(`Alive R32 pool: ${pool.length} teams${pool.length ? ` — e.g. ${pool.slice(0, 5).join(', ')}…` : ''}`)

  for (const userId of USER_IDS) {
    const { data: u } = await admin.from('users').select('id, email').eq('id', userId).maybeSingle()
    if (!u) { console.warn(`  ⚠ user ${userId} not found — skipping`); continue }

    const { data: existing } = await admin.from('user_tournaments')
      .select('favourite_team').eq('user_id', userId).eq('tournament_id', tourn.id).maybeSingle()

    const row = { user_id: userId, tournament_id: tourn.id }
    if (existing?.favourite_team) {
      console.log(`  ${u.email}: already has favourite_team=${existing.favourite_team} (kept)`)
    } else if (pool.length) {
      row.favourite_team = pool[Math.floor(Math.random() * pool.length)]
      row.favourite_team_auto = true
      console.log(`  ${u.email}: allocating alive team → ${row.favourite_team}`)
    } else {
      console.log(`  ${u.email}: no alive teams to allocate (enrolling without a bonus team)`)
    }

    const { error } = await admin.from('user_tournaments')
      .upsert(row, { onConflict: 'user_id,tournament_id', ignoreDuplicates: false })
    if (error) console.error(`  ✗ ${u.email}: ${error.message}`)
    else console.log(`  ✓ ${u.email}: enrolled`)
  }
  console.log('Done.')
}

main().catch(e => { console.error(e); process.exit(1) })
