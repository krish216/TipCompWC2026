#!/usr/bin/env node
/**
 * export-epl-codesign-csv.js — Resend-ready contact CSV (email, first_name) for the EPL
 * co-design invite: users who responded POSITIVELY (yes/maybe) to the EPL interest capture
 * and are NOT already in the EPL Co-Design comp. Excludes mock/blank/duplicate emails, and
 * anyone unsubscribed in the existing "Whole of WC2026" Resend audience.
 *
 * Re-runnable "going forward": each run picks up newly-positive responders who haven't joined.
 *
 * Output: ../broadcast-epl-codesign.csv  (gitignored — PII, do NOT commit)
 * Usage:  node scripts/export-epl-codesign-csv.js
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
const resendKey = env.RESEND_API_KEY
if (!url || !key) { console.error('Missing Supabase env'); process.exit(1) }
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const COMP_ID = 'de1fa2da-26c7-4709-baaa-7916701a74f7'          // EPL Co-Design comp
const WC_AUDIENCE = '84110bd9-fc0e-453b-ae01-0b08c0e361a0'      // Whole of WC2026 (for unsub list)
const cell = s => { s = s == null ? '' : String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }

async function main() {
  // 1. Positive EPL-interest responders (yes/maybe).
  const { data: interest, error: iErr } = await db.from('epl_interest')
    .select('user_id, response').in('response', ['yes', 'maybe'])
  if (iErr) { console.error('epl_interest query error:', iErr.message); process.exit(1) }
  const positive = new Set((interest ?? []).map(r => r.user_id))
  console.log(`Positive EPL responders (yes/maybe): ${positive.size}`)

  // 2. Exclude anyone already in the co-design comp.
  const { data: members } = await db.from('user_comps').select('user_id').eq('comp_id', COMP_ID)
  const already = new Set((members ?? []).map(m => m.user_id))
  console.log(`Already in co-design comp: ${already.size}`)

  // 3. Emails already unsubscribed (best-effort) — never re-email an opt-out.
  const unsub = new Set()
  if (resendKey) {
    try {
      const r = await fetch(`https://api.resend.com/audiences/${WC_AUDIENCE}/contacts`, { headers: { Authorization: `Bearer ${resendKey}` } })
      const b = await r.json().catch(() => ({}))
      ;(b.data ?? []).forEach(c => { if (c.unsubscribed && c.email) unsub.add(c.email.toLowerCase()) })
    } catch { /* proceed without suppression if Resend is unreachable */ }
  }
  console.log(`Suppressed (unsubscribed): ${unsub.size}`)

  // 4. Resolve emails + first names for the target users.
  const targetIds = [...positive].filter(id => !already.has(id))
  const rows = []
  const seen = new Set()
  let skippedUnsub = 0, skippedBad = 0
  for (let i = 0; i < targetIds.length; i += 500) {
    const { data, error } = await db.from('users')
      .select('id, email, first_name, display_name').in('id', targetIds.slice(i, i + 500))
    if (error) { console.error('users query error:', error.message); process.exit(1) }
    for (const u of data ?? []) {
      const email = (u.email || '').trim().toLowerCase()
      if (!email || !email.includes('@') || email.endsWith('@tribepicks.dev')) { skippedBad++; continue }
      if (seen.has(email)) continue
      if (unsub.has(email)) { skippedUnsub++; continue }
      seen.add(email)
      const name = ((u.first_name || '').trim() || (u.display_name || '').trim()).split(/\s+/)[0]
      rows.push(`${cell(email)},${cell(name)}`)
    }
  }

  const out = join(__dirname, '..', 'broadcast-epl-codesign.csv')
  writeFileSync(out, 'email,first_name\n' + rows.join('\n') + '\n')
  console.log(`Skipped — bad/mock: ${skippedBad}, unsubscribed: ${skippedUnsub}`)
  console.log(`Wrote ${rows.length} contacts → ${out}`)
}
main().catch(e => { console.error(e); process.exit(1) })
