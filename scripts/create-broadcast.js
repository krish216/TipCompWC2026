#!/usr/bin/env node
/**
 * create-broadcast.js — load docs/broadcast-round3-email.html into Resend as a DRAFT
 * broadcast via the REST API (no SDK dependency; the installed resend@3.5.0 predates
 * broadcasts). Creates a draft only — never sends. Review / test / schedule in the
 * Resend dashboard afterwards.
 *
 *   List audiences + ids:  node scripts/create-broadcast.js --list
 *   Create the draft:      node scripts/create-broadcast.js --audience <id> [--subject "..."]
 *
 * Reads RESEND_API_KEY from .env.local.
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
const getArg = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined }
const api = (path, opts = {}) => fetch('https://api.resend.com' + path, {
  ...opts,
  headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
}).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }))

async function main() {
  if (args.includes('--list')) {
    const { status, body } = await api('/audiences')
    if (status >= 300) { console.error('Error:', body); process.exit(1) }
    console.log('Audiences:')
    ;(body.data ?? []).forEach(a => console.log(`  ${a.id}   ${a.name}`))
    return
  }

  const audienceId = getArg('--audience')
  if (!audienceId) {
    console.error('Usage:\n  node scripts/create-broadcast.js --list\n  node scripts/create-broadcast.js --audience <id> [--subject "..."]')
    process.exit(1)
  }
  const subject  = getArg('--subject') || 'The group stage was just the warm-up 🌍'
  const htmlFile = getArg('--html')    || 'docs/broadcast-round3-email.html'
  const name     = getArg('--name')    || 'TribePicks — Round 3 / knockouts'
  const html = readFileSync(join(__dirname, '..', ...htmlFile.split('/')), 'utf8')

  const { status, body } = await api('/broadcasts', {
    method: 'POST',
    body: JSON.stringify({
      name,
      audience_id: audienceId,
      from: 'TribePicks <noreply@mail.tribepicks.com>',
      reply_to: 'noreply@mail.tribepicks.com',
      subject,
      html,
    }),
  })
  if (status >= 300) { console.error('Error:', body); process.exit(1) }
  console.log(`✅ Draft broadcast created: ${body.id}`)
  console.log('   Open Resend → Broadcasts to preview, send a test, then schedule/send.')
}
main().catch(e => { console.error(e); process.exit(1) })
