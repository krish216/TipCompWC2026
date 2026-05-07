import { createAdminClient } from '@/lib/supabase'
import { Resend } from 'resend'
import { DEFAULT_WELCOME_SUBJECT, DEFAULT_WELCOME_BODY } from '@/lib/welcome-email-defaults'

export { DEFAULT_WELCOME_SUBJECT, DEFAULT_WELCOME_BODY }

const FROM = process.env.RESEND_FROM ?? 'TribePicks <noreply@mail.tribepicks.com>'

// Called from the auth callback after a successful session exchange.
// Sends the welcome email once per user; no-ops silently if already sent or
// if the email service is not configured.
export async function sendWelcomeIfNeeded(userId: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) return

  const admin = createAdminClient()

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

  // Look up the active tournament to find a custom template
  const { data: setting, error: settingError } = await (admin.from('app_settings') as any)
    .select('value')
    .eq('key', 'active_tournament_id')
    .single()

  if (settingError) console.error('[welcome-email] app_settings lookup failed:', settingError.message)
  else console.log('[welcome-email] active_tournament_id:', setting?.value ?? 'not set')

  let subject = DEFAULT_WELCOME_SUBJECT
  let body    = DEFAULT_WELCOME_BODY

  if (setting?.value) {
    const { data: tpl, error: tplError } = await (admin.from('tournament_email_templates') as any)
      .select('subject, body')
      .eq('tournament_id', setting.value)
      .eq('template_key', 'welcome')
      .maybeSingle()
    if (tplError) console.error('[welcome-email] template fetch failed:', tplError.message)
    else if (tpl) { subject = tpl.subject; body = tpl.body; console.log('[welcome-email] using custom template') }
    else console.warn('[welcome-email] no custom template saved for this tournament — using default')
  }

  // Apply merge tags
  const firstName = ((profile as any).display_name ?? 'there').split(' ')[0]
  subject = subject.replace(/\{\{first_name\}\}/g, firstName)
  body    = body.replace(/\{\{first_name\}\}/g, firstName)

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from:    FROM,
    to:      (profile as any).email,
    subject,
    html:    buildHtml(body),
  })

  if (error) {
    console.error('[welcome-email] send failed:', error)
    return
  }

  // Mark sent so subsequent logins don't resend
  await (admin.from('users') as any).update({ welcome_email_sent: true }).eq('id', userId)
}

function buildHtml(body: string): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.tribepicks.com').replace(/\/$/, '')
  const lines  = body
    .split('\n')
    .map(l => `<p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#374151;">${l || '&nbsp;'}</p>`)
    .join('')
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#ffffff;">
  <div style="margin-bottom:20px;">
    <p style="margin:0;font-size:20px;font-weight:900;color:#065f46;letter-spacing:-0.5px;">TribePicks</p>
    <p style="margin:3px 0 0;font-size:12px;color:#6b7280;">Welcome aboard 🏆</p>
  </div>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px;"/>
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
