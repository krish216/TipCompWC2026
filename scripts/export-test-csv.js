#!/usr/bin/env node
/**
 * export-test-csv.js — small Resend-ready CSV for the 3 test addresses, with their
 * real greeting name looked up from the DB where the address is a registered user.
 * Output: ../broadcast-contacts-test.csv (gitignored). Usage: node scripts/export-test-csv.js
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
if (!url || !key) { console.error('Missing Supabase env'); process.exit(1) }
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

// Explicit greeting names for the test send (avoids "Hi Tournament," from the admin
// account's display name, and keeps it on-theme).
const TEST_CONTACTS = [
  ['krishnan.mootoosamy@gmail.com', 'Krish'],
  ['paws@petzbff.com.au',          'Neve'],
  ['km216@yahoo.com',              'Krish'],
]
const cell = s => { s = s == null ? '' : String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }

async function main() {
  const rows = TEST_CONTACTS.map(([email, name]) => {
    console.log(`  ${email.padEnd(34)} -> "${name}"`)
    return [email.toLowerCase(), name]
  })
  const csv = 'email,first_name\n' + rows.map(r => r.map(cell).join(',')).join('\n') + '\n'
  const out = join(__dirname, '..', 'broadcast-contacts-test.csv')
  writeFileSync(out, csv)
  console.log(`\nWrote ${rows.length} test contacts -> ${out}`)
}
main().catch(e => { console.error(e); process.exit(1) })
