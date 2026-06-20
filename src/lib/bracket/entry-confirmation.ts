import { Resend } from 'resend'
import { resolveActiveCampaign } from '@/lib/sponsors/resolver'

// Branded "You're entered" confirmation for a bracket challenge. Fires once, on a
// guest/member's FIRST successful entry into a given challenge (never on edits).
// Best-effort and self-contained: never throws, no-ops if email isn't configured —
// callers fire-and-forget so a mail hiccup can't fail an entry.

const FROM = process.env.RESEND_FROM ?? 'TribePicks <noreply@mail.tribepicks.com>'

const fmtDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    })
  } catch { return '' }
}

export async function sendEntryConfirmation(
  admin: any,
  opts: {
    email: string
    name?: string | null
    challenge: { id: string; slug: string; name: string }
    closesAt?: string | null
    origin: string
  },
): Promise<void> {
  if (!process.env.RESEND_API_KEY) return
  try {
    const cfg = await resolveActiveCampaign(admin, { challengeType: 'bracket', challengeId: opts.challenge.id })
    const sponsor   = cfg.enabled ? cfg.sponsor_name : ''
    const prize     = cfg.enabled ? cfg.prize : ''
    const firstName = (opts.name ?? '').trim().split(' ')[0]
    const leaderUrl = `${opts.origin.replace(/\/$/, '')}/bracket/leaderboard/${opts.challenge.slug}`
    const closes    = opts.closesAt ? fmtDate(opts.closesAt) : ''

    const subject = `You're in 🏆 ${opts.challenge.name}`
    const resend  = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: FROM, to: opts.email, subject,
      html: buildHtml({ firstName, challengeName: opts.challenge.name, sponsor, prize, closes, leaderUrl }),
    })
    if (error) console.error('[entry-confirmation] send failed:', error)
  } catch (e: any) {
    console.error('[entry-confirmation] error:', e?.message ?? e)
  }
}

function buildHtml(v: {
  firstName: string; challengeName: string; sponsor: string; prize: string; closes: string; leaderUrl: string
}): string {
  const greeting = v.firstName ? `Nice one, ${v.firstName} —` : 'Nice one —'
  const prizeLine = v.prize
    ? `<p style="margin:0 0 6px;font-size:15px;color:#374151;">You're in the draw to win <strong style="color:#065f46;">${v.prize}</strong>${v.sponsor ? ` from <strong>${v.sponsor}</strong>` : ''}.</p>`
    : (v.sponsor ? `<p style="margin:0 0 6px;font-size:15px;color:#374151;">You're in the draw, proudly sponsored by <strong>${v.sponsor}</strong>.</p>` : '')
  const closesLine = v.closes
    ? `<p style="margin:0;font-size:13px;color:#6b7280;">Entries lock <strong>${v.closes}</strong> — your picks are saved until then, so you can still tweak your bracket.</p>`
    : `<p style="margin:0;font-size:13px;color:#6b7280;">Your picks are saved — you can still tweak your bracket until the knockouts kick off.</p>`

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#ffffff;">
  <div style="text-align:center;margin-bottom:20px;">
    <img src="https://tribepicks.com/logo.png" alt="TribePicks" height="80" style="display:inline-block;"/>
  </div>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px;"/>
  <p style="margin:0 0 6px;font-size:18px;font-weight:900;color:#111827;">${greeting} you're entered! 🎉</p>
  <p style="margin:0 0 16px;font-size:15px;color:#374151;">Your bracket is locked into the <strong>${v.challengeName}</strong>.</p>
  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:18px 20px;margin-bottom:20px;">
    ${prizeLine}
    ${closesLine}
  </div>
  <div style="text-align:center;margin-bottom:24px;">
    <a href="${v.leaderUrl}" style="display:inline-block;padding:12px 30px;background:#16a34a;color:#ffffff;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;">View the leaderboard →</a>
  </div>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px;"/>
  <p style="font-size:11px;color:#9ca3af;margin:0;">You're receiving this because you entered a challenge at
    <a href="https://www.tribepicks.com" style="color:#6b7280;">TribePicks</a>. Good luck! 🍀</p>
</body>
</html>`
}
