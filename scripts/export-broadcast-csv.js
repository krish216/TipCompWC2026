#!/usr/bin/env node
/**
 * export-broadcast-csv.js — write a Resend-ready contact CSV (email, first_name) for
 * all real users, excluding @tribepicks.dev mock accounts and blank/duplicate emails.
 *
 * Output: ../broadcast-contacts.csv  (gitignored — contains PII, do NOT commit)
 * Usage:  node scripts/export-broadcast-csv.js
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
  // Scope strictly to the WC2026 tournament — only users who tipped the World Cup get this
  // broadcast (excludes e.g. EPL warm-up-only tippers).
  const { data: wc, error: wcErr } = await db.from('tournaments').select('id').eq('slug', 'wc2026').single()
  if (wcErr || !wc?.id) { console.error('wc2026 tournament not found:', wcErr?.message); process.exit(1) }
  const wcId = wc.id

  // Users who have made at least one WC2026 prediction — only these get the broadcast.
  const predictors = new Set()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('predictions').select('user_id')
      .eq('tournament_id', wcId)
      .order('user_id', { ascending: true }).range(from, from + 999)
    if (error) { console.error('predictions query error:', error.message); process.exit(1) }
    if (!data || !data.length) break
    data.forEach(p => predictors.add(p.user_id))
    if (data.length < 1000) break
  }
  console.log(`Users with >=1 WC2026 prediction: ${predictors.size}`)

  const seen = new Set()
  const rows = []
  let fromFirst = 0, fromDisplay = 0, skippedNoPred = 0
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('users').select('id, email, first_name, display_name')
      .order('email', { ascending: true }).range(from, from + 999)
    if (error) { console.error('Query error:', error.message); process.exit(1) }
    if (!data || !data.length) break
    for (const u of data) {
      const email = (u.email || '').trim().toLowerCase()
      if (!email || !email.includes('@')) continue
      if (email.endsWith('@tribepicks.dev')) continue   // mock/seed accounts
      if (seen.has(email)) continue
      if (!predictors.has(u.id)) { skippedNoPred++; continue }   // exclude never-tipped accounts
      seen.add(email)
      // Greeting name: real first name if set, else the public display name, else blank.
      const fn = (u.first_name || '').trim()
      const dn = (u.display_name || '').trim()
      // First word only so a "Hi {name}," greeting reads naturally even when the
      // source is a full display name (e.g. "Rowan Dhillon" -> "Rowan").
      const name = (fn || dn).split(/\s+/)[0]
      if (fn) fromFirst++; else if (dn) fromDisplay++
      rows.push([email, name])
    }
    if (data.length < 1000) break
  }
  console.log(`Excluded ${skippedNoPred} users with no predictions.`)
  console.log(`Name source — first_name: ${fromFirst}, display_name fallback: ${fromDisplay}, blank: ${rows.length - fromFirst - fromDisplay}`)
  const csv = 'email,first_name\n' + rows.map(r => r.map(cell).join(',')).join('\n') + '\n'
  const out = join(__dirname, '..', 'broadcast-contacts.csv')
  writeFileSync(out, csv)
  console.log(`Wrote ${rows.length} contacts → ${out}`)
}
main().catch(e => { console.error(e); process.exit(1) })
