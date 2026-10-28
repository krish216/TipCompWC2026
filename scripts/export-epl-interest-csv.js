#!/usr/bin/env node
/**
 * export-epl-interest-csv.js — write a Resend-ready contact CSV (email, first_name)
 * for everyone who said 'yes' or 'maybe' on the EPL interest poll (epl_interest,
 * any channel: chief email / tipster email / in-app) and hasn't enrolled in the EPL
 * tournament yet (no user_tournaments row for epl-2026-27) — so we only nudge people
 * who are still on the fence, not ones who already joined.
 *
 * Output: ../broadcast-epl-interest.csv  (gitignored — contains PII, do NOT commit)
 * Usage:  node scripts/export-epl-interest-csv.js
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

const cell = s => { s = s == null ? '' : String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }

async function main() {
  const { data: epl, error: eplErr } = await db.from('tournaments').select('id').eq('slug', 'epl-2026-27').single()
  if (eplErr || !epl?.id) { console.error('epl-2026-27 tournament not found:', eplErr?.message); process.exit(1) }
  const eplId = epl.id

  const { data: interest, error: intErr } = await db.from('epl_interest')
    .select('user_id, response').in('response', ['yes', 'maybe'])
  if (intErr) { console.error('epl_interest query error:', intErr.message); process.exit(1) }
  console.log(`Yes/maybe respondents: ${interest.length}`)

  const { data: enrolled, error: enrErr } = await db.from('user_tournaments')
    .select('user_id').eq('tournament_id', eplId)
  if (enrErr) { console.error('user_tournaments query error:', enrErr.message); process.exit(1) }
  const alreadyIn = new Set((enrolled ?? []).map(r => r.user_id))

  const targets = interest.filter(r => !alreadyIn.has(r.user_id))
  console.log(`Already enrolled in EPL (excluded): ${interest.length - targets.length}`)
  console.log(`Target respondents: ${targets.length}`)

  const targetIds = new Set(targets.map(r => r.user_id))
  const responseByUser = Object.fromEntries(targets.map(r => [r.user_id, r.response]))

  const { data: users, error: usersErr } = await db.from('users')
    .select('id, email, first_name, display_name').in('id', Array.from(targetIds))
  if (usersErr) { console.error('users query error:', usersErr.message); process.exit(1) }

  const seen = new Set()
  const rows = []
  let skippedNoEmail = 0
  for (const u of users ?? []) {
    const email = (u.email || '').trim().toLowerCase()
    if (!email || !email.includes('@')) { skippedNoEmail++; continue }
    if (email.endsWith('@tribepicks.dev')) continue   // mock/seed accounts
    if (seen.has(email)) continue
    seen.add(email)
    const fn = (u.first_name || '').trim()
    const dn = (u.display_name || '').trim()
    const name = (fn || dn).split(/\s+/)[0] || ''
    rows.push([email, name, responseByUser[u.id]])
  }
  console.log(`Skipped (no email): ${skippedNoEmail}`)
  const csv = 'email,first_name,response\n' + rows.map(r => r.map(cell).join(',')).join('\n') + '\n'
  const out = join(__dirname, '..', 'broadcast-epl-interest.csv')
  writeFileSync(out, csv)
  console.log(`Wrote ${rows.length} contacts → ${out}`)
}
main().catch(e => { console.error(e); process.exit(1) })
