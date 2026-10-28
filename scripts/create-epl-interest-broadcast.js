#!/usr/bin/env node
/**
 * create-epl-interest-broadcast.js — create (or reuse) a Resend audience for the
 * "still interested, not yet joined" EPL segment, populate it from
 * broadcast-epl-interest.csv (run scripts/export-epl-interest-csv.js first), and
 * load docs/email-templates/broadcast-epl-interest-followup-email.html as a DRAFT broadcast via the
 * REST API. Creates a draft only — never sends. Review / test / schedule in the
 * Resend dashboard afterwards, same as create-broadcast.js.
 *
 *   node scripts/create-epl-interest-broadcast.js
 *
 * Reads RESEND_API_KEY from .env.local.
 */
const { readFileSync, existsSync } = require('fs')
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

const api = (path, opts = {}) => fetch('https://api.resend.com' + path, {
  ...opts,
  headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
}).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }))

const AUDIENCE_NAME = 'EPL Interest Follow-up'
const CSV_PATH      = join(__dirname, '..', 'broadcast-epl-interest.csv')
const HTML_PATH     = join(__dirname, '..', 'docs', 'email-templates', 'broadcast-epl-interest-followup-email.html')

// Minimal CSV parse — fields never contain commas/quotes in our export (email, first_name, response).
function parseCsv(text) {
  const [, ...lines] = text.trim().split('\n')
  return lines.filter(Boolean).map(line => {
    const [email, first_name] = line.split(',')
    return { email, first_name }
  })
}

async function main() {
  if (!existsSync(CSV_PATH)) {
    console.error(`Missing ${CSV_PATH} — run: node scripts/export-epl-interest-csv.js`)
    process.exit(1)
  }
  const contacts = parseCsv(readFileSync(CSV_PATH, 'utf8'))
  console.log(`Loaded ${contacts.length} contacts from CSV`)

  // Find or create the audience.
  const { status: listStatus, body: listBody } = await api('/audiences')
  if (listStatus >= 300) { console.error('audiences.list error:', listBody); process.exit(1) }
  let audience = (listBody.data ?? []).find(a => a.name === AUDIENCE_NAME)
  if (!audience) {
    const { status, body } = await api('/audiences', { method: 'POST', body: JSON.stringify({ name: AUDIENCE_NAME }) })
    if (status >= 300) { console.error('audiences.create error:', body); process.exit(1) }
    audience = body
    console.log(`Created audience "${AUDIENCE_NAME}" (${audience.id})`)
  } else {
    console.log(`Reusing existing audience "${AUDIENCE_NAME}" (${audience.id})`)
  }

  // Upsert each contact into the audience.
  let added = 0, failed = 0
  for (const c of contacts) {
    const { status, body } = await api(`/audiences/${audience.id}/contacts`, {
      method: 'POST',
      body: JSON.stringify({ email: c.email, first_name: c.first_name || undefined, unsubscribed: false }),
    })
    if (status >= 300) { failed++; console.error(`  contact failed (${c.email}):`, body?.message ?? body) }
    else added++
  }
  console.log(`Contacts upserted: ${added}, failed: ${failed}`)

  // Draft broadcast — never sent from here.
  const html = readFileSync(HTML_PATH, 'utf8')
  const { status, body } = await api('/broadcasts', {
    method: 'POST',
    body: JSON.stringify({
      name: 'EPL interest follow-up — join now',
      audience_id: audience.id,
      from: 'TribePicks <noreply@mail.tribepicks.com>',
      reply_to: 'noreply@mail.tribepicks.com',
      subject: 'The Premier League predictor is live ⚽',
      html,
    }),
  })
  if (status >= 300) { console.error('broadcast create failed:', body); process.exit(1) }
  console.log(`\n✅ DRAFT broadcast created (NOT sent): ${body.id}`)
  console.log('   Open Resend → Broadcasts to preview, send a test, then schedule/send.')
}
main().catch(e => { console.error(e); process.exit(1) })
