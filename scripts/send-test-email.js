#!/usr/bin/env node
/**
 * send-test-email.js — send ONE broadcast HTML file to a single address as a test, via
 * Resend's transactional /emails endpoint. Broadcast merge tags ({{{FIRST_NAME|x}}},
 * {{{RESEND_UNSUBSCRIBE_URL}}}) aren't substituted by that endpoint, so we fill sensible
 * test values here so the preview reads correctly.
 *
 *   node scripts/send-test-email.js --html docs/broadcast-founding-wrapup-email.html \
 *          --to you@example.com --subject "…" --name "Krish"
 *
 * Reads RESEND_API_KEY from .env.local. Sends immediately — test recipient only.
 */
const { readFileSync } = require('fs')
const { join } = require('path')

const env = {}
try {
  readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  })
} catch {}
const apiKey = env.RESEND_API_KEY || process.env.RESEND_API_KEY
if (!apiKey) { console.error('Missing RESEND_API_KEY in .env.local'); process.exit(1) }

const args = process.argv.slice(2)
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }

const to       = getArg('--to')
const htmlFile  = getArg('--html', 'docs/broadcast-founding-wrapup-email.html')
const subject   = getArg('--subject', 'You’re a Founding Tipster ⭐')
const firstName = getArg('--name', 'there')
if (!to) { console.error('Usage: node scripts/send-test-email.js --to <email> [--html <file>] [--subject "..."] [--name "First"]'); process.exit(1) }

let html = readFileSync(join(__dirname, '..', ...htmlFile.split('/')), 'utf8')
// Substitute broadcast merge tags for a realistic test preview.
html = html
  .replace(/\{\{\{FIRST_NAME\|[^}]*\}\}\}/g, firstName)
  .replace(/\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/g, 'https://tribepicks.com/settings')

fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    from: 'TribePicks <noreply@mail.tribepicks.com>',
    to: [to],
    reply_to: 'noreply@mail.tribepicks.com',
    subject: `[TEST] ${subject}`,
    html,
  }),
}).then(async r => {
  const body = await r.json().catch(() => ({}))
  if (r.status >= 300) { console.error('Error:', r.status, body); process.exit(1) }
  console.log(`✅ Test sent to ${to} — id ${body.id}`)
  console.log(`   File: ${htmlFile}  ·  Subject: [TEST] ${subject}`)
}).catch(e => { console.error(e); process.exit(1) })
