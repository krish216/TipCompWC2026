import { Resend } from 'resend'

// Sweep-organiser emails — payment receipts and results. Follows the established
// per-feature pattern (own Resend client, own FROM, inline-CSS HTML, esc()-escaped
// interpolation, never throws so a mail hiccup can't fail the triggering action) — see
// src/lib/match/entry-confirmation.ts. No shared send wrapper exists in this codebase.

const FROM = process.env.RESEND_FROM ?? 'TribePicks <noreply@mail.tribepicks.com>'
const esc = (s: string) => s.replace(/[<>&]/g, c => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'))

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: 'Cash', bank_transfer: 'Bank transfer', iou: 'IOU',
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:5px 0;font-size:13px;color:#6b7280;white-space:nowrap;">${label}</td>` +
    `<td style="padding:5px 0 5px 14px;font-size:14px;font-weight:700;color:#111827;text-align:right;">${esc(value)}</td></tr>`
}

function wrap(heading: string, bodyHtml: string, footer: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#ffffff;">
  <div style="text-align:center;margin-bottom:20px;">
    <img src="https://tribepicks.com/logo.png" alt="TribePicks" height="80" style="display:inline-block;"/>
  </div>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px;"/>
  <p style="margin:0 0 16px;font-size:18px;font-weight:900;color:#111827;">${heading}</p>
  ${bodyHtml}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px;"/>
  <p style="font-size:11px;color:#9ca3af;margin:0;">${footer}</p>
</body>
</html>`
}

// Sent the moment a ticket-purchase request is confirmed (organiser approval, or
// auto-approve on receipt attach). Never touches money itself — this is just a receipt for
// money the organiser already collected offline.
export async function sendSweepPaymentConfirmation(opts: {
  email: string; name?: string | null
  compName: string; tribeName: string
  tickets: number; amount: number | null; paymentMethod: string
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) return
  try {
    const firstName = (opts.name ?? '').trim().split(' ')[0]
    const greeting = firstName ? `Nice one, ${esc(firstName)} —` : 'Nice one —'
    const rows = [
      row('🏇 Sweep', opts.compName),
      row('🪣 Pool', opts.tribeName),
      row('🎟️ Tickets', String(opts.tickets)),
      opts.amount != null ? row('💰 Amount', `$${opts.amount.toFixed(2)}`) : '',
      row('💳 Payment method', PAYMENT_METHOD_LABEL[opts.paymentMethod] ?? opts.paymentMethod),
      row('📅 Confirmed', new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })),
    ].filter(Boolean).join('')

    const body = `
  <p style="margin:0 0 16px;font-size:15px;color:#374151;">Your ticket purchase is confirmed — you're ready to spin the wheel.</p>
  <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:22px;padding:6px 16px;">
    ${rows}
  </table>
  <div style="text-align:center;margin-bottom:8px;">
    <a href="https://tribepicks.com/sweep" style="display:inline-block;padding:12px 30px;background:#16a34a;color:#ffffff;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;">Go to your sweep →</a>
  </div>`

    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: FROM, to: opts.email, subject: `Payment confirmed — ${opts.compName} 🏇`,
      html: wrap(`${greeting} you're locked in! 🎉`, body,
        'You\'re receiving this because you bought tickets in a TribePicks sweep. TribePicks never handles the money itself — your organiser confirmed this payment directly.'),
    })
    if (error) console.error('[sweep/emails] payment-confirmation send failed:', error)
  } catch (e: any) {
    console.error('[sweep/emails] payment-confirmation error:', e?.message ?? e)
  }
}

// Sent once a buyer has drawn a horse for EVERY ticket they hold in a pool — one email
// listing all their horses, not one per spin. Only their own horses: who drew the rest
// stays hidden in the app until the pool fills.
export async function sendSweepDrawConfirmation(opts: {
  email: string; name?: string | null
  compName: string; tribeName: string; raceName: string | null; raceStartAt: string | null
  horses: { number: number; name: string }[]
  poolFull: boolean
  compId: string
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) return
  try {
    const firstName = (opts.name ?? '').trim().split(' ')[0]
    const many = opts.horses.length > 1
    const horseRows = opts.horses
      .sort((a, b) => a.number - b.number)
      .map(h => `<tr><td style="padding:8px 0;font-size:17px;font-weight:900;color:#111827;">#${h.number} ${esc(h.name)}</td></tr>`)
      .join('')
    // Melbourne time — the race's local time, and what an Aussie sweep is planned around.
    const jump = opts.raceStartAt
      ? new Date(opts.raceStartAt).toLocaleString('en-AU', {
          weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit',
          timeZone: 'Australia/Melbourne', timeZoneName: 'short',
        })
      : null
    const rows = [
      row('🏇 Sweep', opts.compName),
      opts.tribeName ? row('🪣 Pool', opts.tribeName) : '',
      opts.raceName ? row('🏁 Race', opts.raceName) : '',
      jump ? row('⏱️ Jump time', jump) : '',
    ].filter(Boolean).join('')

    const body = `
  <p style="margin:0 0 12px;font-size:15px;color:#374151;">Here ${many ? 'are your horses' : "'s your horse"} — keep this handy for race day.</p>
  <table style="width:100%;border-collapse:collapse;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;margin-bottom:18px;padding:6px 16px;">
    ${horseRows}
  </table>
  <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:18px;padding:6px 16px;">
    ${rows}
  </table>
  <p style="margin:0 0 8px;font-size:14px;color:#374151;">
    ${opts.poolFull
      ? '🎉 Your pool is now full — open the app to see who drew every horse.'
      : "🔒 Who drew the other horses stays hidden until your pool fills — then you'll see the full draw in the app."}
  </p>
  <p style="margin:0 0 22px;font-size:14px;color:#374151;">🏆 Results land in your inbox after the race.</p>
  <div style="text-align:center;margin-bottom:8px;">
    <a href="https://tribepicks.com/tribe?comp_id=${encodeURIComponent(opts.compId)}" style="display:inline-block;padding:12px 30px;background:#16a34a;color:#ffffff;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;">View your sweep →</a>
  </div>`

    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: FROM, to: opts.email,
      subject: many
        ? `Your ${opts.horses.length} horses — ${opts.compName} 🐎`
        : `You drew #${opts.horses[0]?.number} ${opts.horses[0]?.name} — ${opts.compName} 🐎`,
      html: wrap(`${firstName ? `${esc(firstName)}, you're` : "You're"} in the draw! 🐎`, body,
        "You're receiving this because you drew horses in a TribePicks sweep. TribePicks never handles the money itself."),
    })
    if (error) console.error('[sweep/emails] draw-confirmation send failed:', error)
  } catch (e: any) {
    console.error('[sweep/emails] draw-confirmation error:', e?.message ?? e)
  }
}

// Sent when the organiser rejects a ticket request — previously this happened silently, and
// the buyer only found out by noticing the status on their request row.
export async function sendSweepRequestRejected(opts: {
  email: string; name?: string | null
  compName: string; tickets: number; paymentMethod: string
  notes?: string | null; organiserName?: string | null
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) return
  try {
    const firstName = (opts.name ?? '').trim().split(' ')[0]
    const who = opts.organiserName ? esc(opts.organiserName) : 'Your organiser'
    const rows = [
      row('🏇 Sweep', opts.compName),
      row('🎟️ Tickets', String(opts.tickets)),
      row('💳 Payment method', PAYMENT_METHOD_LABEL[opts.paymentMethod] ?? opts.paymentMethod),
    ].join('')

    const body = `
  <p style="margin:0 0 16px;font-size:15px;color:#374151;">${who} couldn't approve this ticket request, so no tickets were added.</p>
  <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:16px;padding:6px 16px;">
    ${rows}
  </table>
  ${opts.notes ? `<p style="margin:0 0 16px;font-size:14px;color:#374151;"><strong>Their note:</strong> ${esc(opts.notes)}</p>` : ''}
  <p style="margin:0 0 22px;font-size:14px;color:#374151;">If you think this is a mistake, check with them — you can send a new request from your sweep.</p>
  <div style="text-align:center;margin-bottom:8px;">
    <a href="https://tribepicks.com/sweep" style="display:inline-block;padding:12px 30px;background:#16a34a;color:#ffffff;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;">Go to your sweep →</a>
  </div>`

    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: FROM, to: opts.email, subject: `Ticket request not approved — ${opts.compName}`,
      html: wrap(firstName ? `Hi ${esc(firstName)} —` : 'Hi —', body,
        'You\'re receiving this because you requested tickets in a TribePicks sweep. TribePicks never handles the money itself.'),
    })
    if (error) console.error('[sweep/emails] request-rejected send failed:', error)
  } catch (e: any) {
    console.error('[sweep/emails] request-rejected error:', e?.message ?? e)
  }
}

export type PodiumEntry = {
  place: number
  horse: { number: number; name: string } | null
  winner: { display_name: string } | null
}

// Sent once a tribe's three placegetters are all recorded (see tribes.sweep_results_sent_at
// for the idempotency guard — callers must only call this once per tribe).
export async function sendSweepResultsReady(opts: {
  email: string; name?: string | null
  compName: string; tribeName: string
  podium: PodiumEntry[]
  myHorses: { number: number; name: string }[]
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) return
  try {
    const firstName = (opts.name ?? '').trim().split(' ')[0]
    const greeting = firstName ? `Hey ${esc(firstName)} —` : 'Hey —'
    const place = (p: number) => (p === 1 ? '🥇' : p === 2 ? '🥈' : '🥉')
    const podiumRows = opts.podium.map(p => row(
      `${place(p.place)} Place ${p.place}`,
      p.horse ? `#${p.horse.number} ${p.horse.name}${p.winner ? ` — ${p.winner.display_name}` : ' (nobody in this pool)'}` : 'Result not in',
    )).join('')
    const mine = opts.myHorses.length
      ? `<p style="margin:0 0 16px;font-size:15px;color:#374151;">Your horse${opts.myHorses.length === 1 ? '' : 's'}: <strong>${opts.myHorses.map(h => `#${h.number} ${esc(h.name)}`).join(', ')}</strong></p>`
      : ''

    const body = `
  <p style="margin:0 0 12px;font-size:15px;color:#374151;">The results are in for <strong>${esc(opts.compName)}</strong> — ${esc(opts.tribeName)}.</p>
  ${mine}
  <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:22px;padding:6px 16px;">
    ${podiumRows}
  </table>
  <div style="text-align:center;margin-bottom:8px;">
    <a href="https://tribepicks.com/sweep" style="display:inline-block;padding:12px 30px;background:#16a34a;color:#ffffff;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;">See the full pool →</a>
  </div>`

    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: FROM, to: opts.email, subject: `Results are in — ${opts.compName} 🏆`,
      html: wrap(`${greeting} the race is run! 🏁`, body,
        'You\'re receiving this because you\'re in a TribePicks sweep pool that just got its results.'),
    })
    if (error) console.error('[sweep/emails] results send failed:', error)
  } catch (e: any) {
    console.error('[sweep/emails] results error:', e?.message ?? e)
  }
}
