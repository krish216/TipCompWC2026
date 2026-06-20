import { Resend } from 'resend'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { resolveActiveCampaign } from '@/lib/sponsors/resolver'

// Branded guest-bracket login email. Replaces Supabase's generic "Sign in to
// TribePicks" magic-link mail — which gave a bracket entrant zero context — with
// a single on-brand email that BOTH confirms their entry and carries the
// account-claim / sign-in link. We mint the magic link ourselves via the admin
// API (generateLink) and deliver it through Resend so we control the wording.
//
// Robust by design: if link-minting or Resend fails for any reason, we fall back
// to Supabase's own signInWithOtp so the user is never left without a way in.

const FROM = process.env.RESEND_FROM ?? 'TribePicks <noreply@mail.tribepicks.com>'

const fmtDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    })
  } catch { return '' }
}

function otpFallback(email: string, redirectTo: string) {
  const anon = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  return anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo } })
}

// existing=false → "you're entered, claim your account"; existing=true → "we found
// your account, sign in to finish entering". Returns true when our branded email
// was sent; false if we fell back to the generic OTP mail.
export async function sendBracketClaimEmail(
  admin: any,
  opts: {
    email: string
    name?: string | null
    challenge: { id: string; slug: string; name: string }
    closesAt?: string | null
    origin: string
    next: string
    existing: boolean
  },
): Promise<boolean> {
  const redirectTo = `${opts.origin.replace(/\/$/, '')}${opts.next}`

  if (!process.env.RESEND_API_KEY) {
    await otpFallback(opts.email, redirectTo).catch(() => {})
    return false
  }

  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink', email: opts.email, options: { redirectTo },
    })
    const actionLink = (data as any)?.properties?.action_link
    if (error || !actionLink) throw error ?? new Error('no action_link')

    const cfg       = await resolveActiveCampaign(admin, { challengeType: 'bracket', challengeId: opts.challenge.id })
    const sponsor   = cfg.enabled ? cfg.sponsor_name : ''
    const prize     = cfg.enabled ? cfg.prize : ''
    const firstName = (opts.name ?? '').trim().split(' ')[0]
    const closes    = opts.closesAt ? fmtDate(opts.closesAt) : ''

    const subject = opts.existing
      ? `Finish entering — ${opts.challenge.name}`
      : `You're in 🏆 ${opts.challenge.name}`

    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error: mailErr } = await resend.emails.send({
      from: FROM, to: opts.email, subject,
      html: buildHtml({
        firstName, existing: opts.existing, challengeName: opts.challenge.name,
        sponsor, prize, closes, actionLink, leaderUrl: `${opts.origin.replace(/\/$/, '')}/bracket/leaderboard/${opts.challenge.slug}`,
      }),
    })
    if (mailErr) throw mailErr
    return true
  } catch (e: any) {
    console.error('[guest-claim-email] falling back to OTP:', e?.message ?? e)
    await otpFallback(opts.email, redirectTo).catch(() => {})
    return false
  }
}

function buildHtml(v: {
  firstName: string; existing: boolean; challengeName: string
  sponsor: string; prize: string; closes: string; actionLink: string; leaderUrl: string
}): string {
  const greeting = v.firstName ? `${v.firstName},` : 'Hi,'
  const headline = v.existing
    ? `You're nearly in the ${v.challengeName}`
    : `You're entered in the ${v.challengeName}! 🎉`
  const intro = v.existing
    ? `You already have a TribePicks account, so we didn't create a new one. Sign in below to confirm your entry — your bracket is saved and waiting.`
    : `Your bracket is locked in. Click below to claim your free account so you can track your score all tournament long — no password needed.`

  const prizeLine = v.prize
    ? `<p style="margin:0 0 6px;font-size:15px;color:#374151;">You're in the draw to win <strong style="color:#065f46;">${v.prize}</strong>${v.sponsor ? ` from <strong>${v.sponsor}</strong>` : ''}.</p>`
    : (v.sponsor ? `<p style="margin:0 0 6px;font-size:15px;color:#374151;">Proudly sponsored by <strong>${v.sponsor}</strong>.</p>` : '')
  const closesLine = v.closes
    ? `<p style="margin:0;font-size:13px;color:#6b7280;">Entries lock <strong>${v.closes}</strong> — you can still tweak your bracket until then.</p>`
    : `<p style="margin:0;font-size:13px;color:#6b7280;">You can still tweak your bracket until the knockouts kick off.</p>`
  const detailBlock = (prizeLine || v.closes)
    ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:18px 20px;margin-bottom:22px;">${prizeLine}${closesLine}</div>`
    : ''

  const cta = v.existing ? 'Sign in & confirm my entry →' : 'Claim my account →'

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#ffffff;">
  <div style="text-align:center;margin-bottom:20px;">
    <img src="https://tribepicks.com/logo.png" alt="TribePicks" height="80" style="display:inline-block;"/>
  </div>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px;"/>
  <p style="margin:0 0 6px;font-size:14px;color:#374151;">${greeting}</p>
  <p style="margin:0 0 12px;font-size:18px;font-weight:900;color:#111827;">${headline}</p>
  <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#374151;">${intro}</p>
  ${detailBlock}
  <div style="text-align:center;margin-bottom:14px;">
    <a href="${v.actionLink}" style="display:inline-block;padding:13px 32px;background:#16a34a;color:#ffffff;font-weight:700;font-size:15px;border-radius:8px;text-decoration:none;">${cta}</a>
  </div>
  <p style="text-align:center;margin:0 0 22px;font-size:12px;color:#9ca3af;">Or <a href="${v.leaderUrl}" style="color:#6b7280;">view the leaderboard</a>.</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px;"/>
  <p style="font-size:11px;color:#9ca3af;margin:0;">You're receiving this because you entered the ${v.challengeName} at
    <a href="https://www.tribepicks.com" style="color:#6b7280;">TribePicks</a>. Good luck! 🍀</p>
</body>
</html>`
}
