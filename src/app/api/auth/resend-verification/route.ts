import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'
import { Resend } from 'resend'

const FROM = process.env.RESEND_FROM ?? 'TribePicks <noreply@mail.tribepicks.com>'

export async function POST() {
  const user = await getSessionUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'Email service not configured' }, { status: 500 })
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.tribepicks.com').replace(/\/$/, '')
  // Bare callback URL — more likely to match Supabase's redirect allowlist.
  // auth/callback defaults next to /auth/confirmed when no ?next= is present.
  const callbackUrl = `${appUrl}/auth/callback`

  const admin = createAdminClient()
  let verifyUrl: string | undefined
  try {
    const { data: linkData, error: linkError } = await (admin.auth as any).admin.generateLink({
      type:    'magiclink',
      email:   user.email,
      options: { redirectTo: callbackUrl },
    })
    if (linkError) console.error('[resend-verification] generateLink error:', linkError.message)
    verifyUrl = linkData?.properties?.action_link
  } catch (e: any) {
    console.error('[resend-verification] generateLink threw:', e?.message)
  }

  if (!verifyUrl) {
    return NextResponse.json({ error: 'Failed to generate verification link' }, { status: 500 })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from:    FROM,
    to:      user.email,
    subject: 'Verify your TribePicks email address',
    html:    buildHtml(verifyUrl, appUrl),
  })

  if (error) {
    console.error('[resend-verification] send failed:', error)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

function buildHtml(verifyUrl: string, appUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#ffffff;">
  <img src="https://tribepicks.com/logo.png" alt="TribePicks" height="96" style="display:block;margin-bottom:24px"/>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 24px;"/>
  <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#111827;">Verify your email address</p>
  <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#374151;">Click the button below to verify your TribePicks account. This link will sign you in and confirm your email.</p>
  <div style="text-align:center;margin-bottom:24px;">
    <a href="${verifyUrl}" style="display:inline-block;padding:12px 32px;background:#16a34a;color:#ffffff;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;">Verify my email →</a>
  </div>
  <p style="margin:0 0 24px;font-size:12px;color:#6b7280;text-align:center;">Button not working? <a href="${verifyUrl}" style="color:#6b7280;">Click here</a></p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px;"/>
  <p style="font-size:11px;color:#9ca3af;margin:0;">
    You're receiving this because you registered at
    <a href="${appUrl}" style="color:#6b7280;">TribePicks</a>.
  </p>
</body>
</html>`
}
