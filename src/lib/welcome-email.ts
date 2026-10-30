import { createAdminClient } from '@/lib/supabase'
import { Resend } from 'resend'
import { DEFAULT_WELCOME_SUBJECT, DEFAULT_WELCOME_BODY } from '@/lib/welcome-email-defaults'

export { DEFAULT_WELCOME_SUBJECT, DEFAULT_WELCOME_BODY }

const FROM = process.env.RESEND_FROM ?? 'TribePicks <noreply@mail.tribepicks.com>'

// A tournament's welcome — its rules — sent once per enrolment (user_tournaments.welcome_sent_at,
// migration 204), not once per platform sign-up: someone in EPL who later joins the World Cup
// gets the World Cup's welcome too. Only tournaments with a welcome written in admin
// (tournament_email_templates, 'welcome') send one; with none written, nothing goes out rather
// than another tournament's text — that's how sweep sign-ups were once welcomed to the World
// Cup. Sweeps have their own emails (lib/sweep/emails.ts). No-ops silently if already sent or
// if the email service is not configured.
export async function sendWelcomeIfNeeded(userId: string, tournamentId: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) return

  const admin = createAdminClient()

  const [{ data: profile, error: profileError }, { data: enrolment, error: enrolError }, { data: tpl, error: tplError }] = await Promise.all([
    admin.from('users').select('email, display_name, signup_flow').eq('id', userId).single(),
    (admin.from('user_tournaments') as any)
      .select('welcome_sent_at').eq('user_id', userId).eq('tournament_id', tournamentId).maybeSingle(),
    (admin.from('tournament_email_templates') as any)
      .select('subject, body').eq('tournament_id', tournamentId).eq('template_key', 'welcome').maybeSingle(),
  ])

  if (profileError) {
    console.error('[welcome-email] profile fetch failed:', profileError.message)
    return
  }
  // Before migration 204 there's no per-enrolment flag to guard a resend — send nothing.
  if (enrolError) {
    console.error('[welcome-email] enrolment fetch failed:', enrolError.message)
    return
  }
  if (!profile || !enrolment || enrolment.welcome_sent_at) return

  // Bracket-Challenge guests get a dedicated branded "you're entered + claim your
  // account" email instead — the generic tipping-comp welcome would confuse them
  // (they signed up for a bracket, not the predictions comp).
  if ((profile as any).signup_flow === 'bracket_guest') return

  if (tplError) { console.error('[welcome-email] template fetch failed:', tplError.message); return }
  if (!tpl) return   // no welcome written for this tournament

  // Claim the send first, so two enrolment paths racing (sign-up + verify) can't both send.
  const { data: claimed } = await (admin.from('user_tournaments') as any)
    .update({ welcome_sent_at: new Date().toISOString() })
    .eq('user_id', userId).eq('tournament_id', tournamentId).is('welcome_sent_at', null)
    .select('user_id').maybeSingle()
  if (!claimed) return

  // Apply merge tags
  const firstName = ((profile as any).display_name ?? 'there').split(' ')[0]
  const subject = (tpl.subject as string).replace(/\{\{first_name\}\}/g, firstName)
  const body    = (tpl.body as string).replace(/\{\{first_name\}\}/g, firstName)

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from:    FROM,
    to:      (profile as any).email,
    subject,
    html:    buildHtml(body),
  })

  if (error) {
    console.error('[welcome-email] send failed:', error)
    // Release the claim so a later enrolment can try again.
    await (admin.from('user_tournaments') as any)
      .update({ welcome_sent_at: null }).eq('user_id', userId).eq('tournament_id', tournamentId)
  }
}

const linkify = (text: string) =>
  text.replace(/https?:\/\/[^\s<>"']+/g, url =>
    `<a href="${url}" style="color:#16a34a;text-decoration:underline;">${url}</a>`)

function buildHtml(body: string): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.tribepicks.com').replace(/\/$/, '')
  const lines  = body
    .split('\n')
    .map(l => `<p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#374151;">${l ? linkify(l) : '&nbsp;'}</p>`)
    .join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#ffffff;">
  <div style="text-align:center;margin-bottom:24px;">
    <img src="https://tribepicks.com/logo.png" alt="TribePicks" height="96" style="display:inline-block;"/>
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
