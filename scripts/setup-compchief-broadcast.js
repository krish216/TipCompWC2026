#!/usr/bin/env node
/**
 * setup-compchief-broadcast.js — create a DRAFT broadcast template on Resend for
 * the existing "Comp Chief" audience. Does NOT send (no `send: true`). Review and
 * send from the Resend dashboard.
 *
 * Usage: node scripts/setup-compchief-broadcast.js
 */
const { Resend } = require('resend')
const { readFileSync } = require('fs')
const { join } = require('path')
for (const l of readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '') }

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM || 'TribePicks <noreply@mail.tribepicks.com>'
const APP = 'https://www.tribepicks.com'

const subject = 'Keep your comp buzzing through the knockouts 🏆'

// Branded HTML. Resend merge tags: {{{FIRST_NAME|there}}} + required {{{RESEND_UNSUBSCRIBE_URL}}}.
const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#ffffff;color:#111827;">
  <div style="text-align:center;margin-bottom:18px;">
    <img src="https://tribepicks.com/logo.png" alt="TribePicks" height="72" style="display:inline-block;"/>
  </div>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px;"/>

  <p style="font-size:18px;font-weight:900;margin:0 0 6px;">Keep your comp buzzing through the knockouts 🏆</p>
  <p style="font-size:15px;color:#374151;margin:0 0 16px;">Hi {{{FIRST_NAME|there}}},</p>

  <p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 18px;">
    The World Cup knockouts are here — the business end, and the moment casual tippers tend to go quiet.
    A little nudging now keeps your comp lively (and competitive) all the way to the Final. Here's a quick playbook.
  </p>

  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:18px 20px;margin-bottom:20px;">
    <p style="margin:0 0 10px;font-size:14px;"><strong>1. Check your comp's health (2 mins)</strong><br/>
      <span style="color:#374151;">Open <strong>Manage → your comp → Health</strong> to see who's still tipping, who's gone quiet, and your overall tip rate.</span></p>
    <p style="margin:0 0 10px;font-size:14px;"><strong>2. See who hasn't tipped the next round</strong><br/>
      <span style="color:#374151;">The <strong>Tipsters</strong> tab shows who's locked in their knockout picks — and who hasn't yet.</span></p>
    <p style="margin:0 0 10px;font-size:14px;"><strong>3. Give them a nudge</strong><br/>
      <span style="color:#374151;">Tap <strong>⏰ Reminder</strong> to ping everyone who hasn't tipped, or post an <strong>Announcement</strong> to rally the whole comp.</span></p>
    <p style="margin:0;font-size:14px;"><strong>4. Set it and forget it — Auto-Reminders</strong><br/>
      <span style="color:#374151;">Turn on <strong>Auto-Reminders</strong> and TribePicks emails non-tippers automatically before every knockout round, right through to the Final.</span></p>
  </div>

  <p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 22px;">
    <strong>Why it matters now:</strong> knockout matches are where the standings really move. Keeping everyone tipping means the title stays up for grabs and nobody checks out early.
  </p>

  <div style="text-align:center;margin-bottom:24px;">
    <a href="${APP}/comp-admin" style="display:inline-block;padding:13px 30px;background:#16a34a;color:#ffffff;font-weight:700;font-size:15px;border-radius:8px;text-decoration:none;">Open my comp →</a>
  </div>

  <p style="font-size:14px;color:#374151;margin:0 0 24px;">Two minutes today keeps your comp alive for the next three weeks. Good luck — may the best tipster win! 🥇<br/><br/>Cheers,<br/>The TribePicks Team</p>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px;"/>
  <p style="font-size:11px;color:#9ca3af;margin:0;">You're receiving this as a Comp Chief on
    <a href="${APP}" style="color:#6b7280;">TribePicks</a>.
    <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#6b7280;">Unsubscribe</a>.</p>
</body></html>`

;(async () => {
  if (!process.env.RESEND_API_KEY) { console.error('No RESEND_API_KEY'); process.exit(1) }

  const { data: list, error: listErr } = await resend.audiences.list()
  if (listErr) { console.error('audiences.list error:', listErr); process.exit(1) }
  const audiences = list?.data ?? []
  console.log('Audiences:', audiences.map(x => `${x.name} (${x.id})`).join(' | ') || '(none)')
  const aud = audiences.find(x => /comp\s*chief/i.test(x.name || ''))
  if (!aud) { console.error('No audience matching "Comp Chief" — create it first or check the name.'); process.exit(1) }
  console.log(`Using audience: ${aud.name} (${aud.id})`)

  // SDK 3.5.0 has no broadcasts resource → use the REST API. No `send:true` = draft.
  const res = await fetch('https://api.resend.com/broadcasts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audience_id: aud.id,
      from: FROM,
      reply_to: 'tribepicks@gmail.com',
      subject,
      name: 'Comp Chiefs — keep tipping through the knockouts',
      html,
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) { console.error('broadcast create failed:', res.status, JSON.stringify(json)); process.exit(1) }
  console.log(`\n✓ DRAFT broadcast created (NOT sent): ${json.id}`)
  console.log('Review & send it in the Resend dashboard → Broadcasts.')
})().catch(e => { console.error(e); process.exit(1) })
