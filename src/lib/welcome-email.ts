import { createAdminClient } from '@/lib/supabase'
import { Resend } from 'resend'
import { DEFAULT_WELCOME_SUBJECT, DEFAULT_WELCOME_BODY } from '@/lib/welcome-email-defaults'

export { DEFAULT_WELCOME_SUBJECT, DEFAULT_WELCOME_BODY }

const FROM = process.env.RESEND_FROM ?? 'TribePicks <noreply@mail.tribepicks.com>'

// Called after a user is added to user_tournaments (enrol endpoint).
// Sends the welcome email once per user; no-ops silently if already sent or
// if the email service is not configured.
export async function sendWelcomeIfNeeded(userId: string, tournamentId: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) return

  const admin = createAdminClient()
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.tribepicks.com').replace(/\/$/, '')

  // Check profile and sent flag in one query
  const { data: profile, error: profileError } = await admin
    .from('users')
    .select('email, display_name, welcome_email_sent')
    .eq('id', userId)
    .single()

  if (profileError) {
    console.error('[welcome-email] profile fetch failed:', profileError.message)
    return
  }
  if (!profile || (profile as any).welcome_email_sent) return

  let subject = DEFAULT_WELCOME_SUBJECT
  let body    = DEFAULT_WELCOME_BODY

  const { data: tpl, error: tplError } = await (admin.from('tournament_email_templates') as any)
    .select('subject, body')
    .eq('tournament_id', tournamentId)
    .eq('template_key', 'welcome')
    .maybeSingle()
  if (tplError) console.error('[welcome-email] template fetch failed:', tplError.message)
  else if (tpl) { subject = tpl.subject; body = tpl.body; console.log('[welcome-email] using custom template') }
  else console.warn('[welcome-email] no custom template saved for this tournament — using default')

  // Apply merge tags
  const firstName = ((profile as any).display_name ?? 'there').split(' ')[0]
  subject = subject.replace(/\{\{first_name\}\}/g, firstName)
  body    = body.replace(/\{\{first_name\}\}/g, firstName)

  // Generate a custom UUID token for email verification.
  // Stored in the users table with a 72-hour expiry and used as a query param
  // on /api/auth/verify-email — bypasses Supabase magic links entirely, which
  // used hash-based redirects that couldn't be handled server-side.
  let verifyUrl: string | undefined
  try {
    const token    = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
    const { error: tokenError } = await (admin.from('users') as any)
      .update({ email_verify_token: token, email_verify_token_expires_at: expiresAt })
      .eq('id', userId)
    if (tokenError) {
      console.warn('[welcome-email] token store failed:', tokenError.message)
    } else {
      verifyUrl = `${appUrl}/api/auth/verify-email?token=${token}`
      console.log('[welcome-email] verification token generated')
    }
  } catch (e: any) {
    console.warn('[welcome-email] token generation failed:', e?.message ?? e)
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from:    FROM,
    to:      (profile as any).email,
    subject,
    html:    buildHtml(body, verifyUrl),
  })

  if (error) {
    console.error('[welcome-email] send failed:', error)
    return
  }

  // Mark sent so subsequent enrolments don't resend
  await (admin.from('users') as any).update({ welcome_email_sent: true }).eq('id', userId)
}

const linkify = (text: string) =>
  text.replace(/https?:\/\/[^\s<>"']+/g, url =>
    `<a href="${url}" style="color:#16a34a;text-decoration:underline;">${url}</a>`)

function buildHtml(body: string, verifyUrl?: string): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.tribepicks.com').replace(/\/$/, '')
  const lines  = body
    .split('\n')
    .map(l => `<p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#374151;">${l ? linkify(l) : '&nbsp;'}</p>`)
    .join('')

  const verifyBlock = verifyUrl ? `
  <div style="margin-bottom:24px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;text-align:center;">
    <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#166534;">Step 1 — Verify your email address</p>
    <p style="margin:0 0 16px;font-size:13px;color:#4b7c5a;line-height:1.5;">Click the button below to confirm your email and unlock all features.</p>
    <a href="${verifyUrl}" style="display:inline-block;padding:11px 28px;background:#16a34a;color:#ffffff;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;">Verify my email →</a>
    <p style="margin:12px 0 0;font-size:11px;color:#6b7280;">Button not working? <a href="${verifyUrl}" style="color:#6b7280;">Copy this link</a> &nbsp;·&nbsp; Link expires in 72 hours.</p>
  </div>` : ''

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#ffffff;">
  <div style="text-align:center;margin-bottom:24px;">
    <img src="https://tribepicks.com/logo.png" alt="TribePicks" height="96" style="display:inline-block;"/>
  </div>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px;"/>
  ${verifyBlock}
  ${lines}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px;"/>
  <p style="font-size:11px;color:#9ca3af;margin:0;">
    You're receiving this because you registered at
    <a href="${appUrl}" style="color:#6b7280;">TribePicks</a>.
    &nbsp;·&nbsp;
    <a href="${appUrl}/settings" style="color:#9ca3af;">Manage notifications</a>
  </p>
</body>
</html>`
}
