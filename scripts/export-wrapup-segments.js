#!/usr/bin/env node
/**
 * export-wrapup-segments.js — split WC2026 tippers into two Resend-ready CSVs by how far
 * they tipped, for the personalised wrap-up survey emails:
 *
 *   Finishers — reached the knockouts (tipped any knockout round: r32/r16/qf/sf/tp/f)
 *   Drifters  — tipped ≥1 real fixture but only in the group stage (eased off before the knockouts)
 *
 * The cut is configurable:  --cut knockouts   (default: finisher = tipped any knockout round)
 *                           --cut final       (finisher = tipped the final only, round 'f')
 *
 * Excludes @tribepicks.dev mock accounts, blank/duplicate emails, and the 'wup' warm-up
 * round (not a real competition round). Outputs (both gitignored — contain PII):
 *   ../wrapup-finishers.csv   ../wrapup-drifters.csv
 *
 * Usage:  node scripts/export-wrapup-segments.js [--cut final|knockouts]
 */
const { createClient } = require('@supabase/supabase-js')
const { readFileSync, writeFileSync } = require('fs')
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
if (!url || !key) { console.error('Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)'); process.exit(1) }
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const args = process.argv.slice(2)
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const CUT = getArg('--cut', 'knockouts')   // 'knockouts' | 'final'
const KNOCKOUT_ROUNDS = new Set(['r32', 'r16', 'qf', 'sf', 'tp', 'f'])   // WC final's round code is 'f'

const cell = s => { s = s == null ? '' : String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }

async function main() {
  const { data: wc, error: wcErr } = await db.from('tournaments').select('id').eq('slug', 'wc2026').single()
  if (wcErr || !wc?.id) { console.error('wc2026 tournament not found:', wcErr?.message); process.exit(1) }
  const wcId = wc.id

  // fixture_id → round, for WC2026 (excluding the warm-up round).
  const roundByFixture = new Map()
  {
    const { data, error } = await db.from('fixtures').select('id, round').eq('tournament_id', wcId)
    if (error) { console.error('fixtures query error:', error.message); process.exit(1) }
    for (const f of data ?? []) if (f.round !== 'wup') roundByFixture.set(f.id, f.round)
  }

  // Is this user a "finisher" under the chosen cut?
  const isFinisherRound = round =>
    CUT === 'final' ? round === 'f' : KNOCKOUT_ROUNDS.has(round)

  // Per user: did they tip any real fixture, and did they reach the finisher threshold?
  const tippedReal = new Set()      // made ≥1 non-wup prediction
  const finishers  = new Set()      // reached the finisher threshold
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('predictions').select('user_id, fixture_id')
      .eq('tournament_id', wcId).order('user_id', { ascending: true }).range(from, from + 999)
    if (error) { console.error('predictions query error:', error.message); process.exit(1) }
    if (!data || !data.length) break
    for (const p of data) {
      const round = roundByFixture.get(p.fixture_id)
      if (!round) continue                 // wup or unknown fixture → not a real comp pick
      tippedReal.add(p.user_id)
      if (isFinisherRound(round)) finishers.add(p.user_id)
    }
    if (data.length < 1000) break
  }
  console.log(`Real WC tippers: ${tippedReal.size}  ·  Finishers (${CUT}): ${finishers.size}  ·  Drifters: ${tippedReal.size - finishers.size}`)

  // Resolve to email + first name, one row per unique address, in the right segment.
  const seen = new Set()
  const fin = [], dri = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('users').select('id, email, first_name, display_name')
      .order('email', { ascending: true }).range(from, from + 999)
    if (error) { console.error('users query error:', error.message); process.exit(1) }
    if (!data || !data.length) break
    for (const u of data) {
      const email = (u.email || '').trim().toLowerCase()
      if (!email || !email.includes('@')) continue
      if (email.endsWith('@tribepicks.dev')) continue
      if (seen.has(email)) continue
      if (!tippedReal.has(u.id)) continue           // never made a real WC pick → not in either survey
      seen.add(email)
      const name = ((u.first_name || '').trim() || (u.display_name || '').trim()).split(/\s+/)[0]
      ;(finishers.has(u.id) ? fin : dri).push([email, name])
    }
    if (data.length < 1000) break
  }

  const write = (rows, file) => {
    const csv = 'email,first_name\n' + rows.map(r => r.map(cell).join(',')).join('\n') + '\n'
    const out = join(__dirname, '..', file)
    writeFileSync(out, csv)
    console.log(`Wrote ${rows.length} → ${out}`)
  }
  write(fin, 'wrapup-finishers.csv')
  write(dri, 'wrapup-drifters.csv')
  console.log(`\nCut: finisher = ${CUT === 'knockouts' ? 'tipped any knockout round' : 'tipped the final'}. Re-run with --cut ${CUT === 'knockouts' ? 'final' : 'knockouts'} to change.`)
}
main().catch(e => { console.error(e); process.exit(1) })
