import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const FROM = process.env.RESEND_FROM ?? 'TribePicks <noreply@mail.tribepicks.com>'
const CODE_TTL_MS  = 10 * 60 * 1000   // 10 minutes
const RESEND_GAP_MS = 45 * 1000       // min gap between sends to one email

function sixDigitCode(): string {
  // Secure-ish 6-digit code via Web Crypto (available in the route runtime).
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000
  return String(n).padStart(6, '0')
}

function buildHtml(code: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#ffffff;">
  <p style="margin:0 0 4px;font-size:20px;font-weight:900;color:#065f46;">TribePicks</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:14px 0 20px;"/>
  <p style="font-size:14px;color:#374151;margin:0 0 12px;">Your Bracket Challenge verification code:</p>
  <p style="font-size:34px;font-weight:900;letter-spacing:8px;color:#111827;margin:0 0 12px;">${code}</p>
  <p style="font-size:12px;color:#6b7280;margin:0;">Enter this to confirm your email and lock in your entry. It expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
</body></html>`
}

// POST /api/bracket/send-code — email a 6-digit verification code for guest entry.
export async function POST(request: NextRequest) {
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: 'Email service not configured' }, { status: 503 })

  const body  = await request.json().catch(() => ({} as any))
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })

  const admin = createAdminClient()

  // Rate-limit: one code per email per RESEND_GAP_MS.
  const { data: existing } = await (admin.from('email_codes') as any).select('created_at').eq('email', email).maybeSingle()
  if (existing && Date.now() - new Date((existing as any).created_at).getTime() < RESEND_GAP_MS)
    return NextResponse.json({ error: 'Hang on a few seconds before requesting another code.' }, { status: 429 })

  const code = sixDigitCode()
  const now  = new Date().toISOString()
  const { error: upErr } = await (admin.from('email_codes') as any).upsert({
    email, code, expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(), attempts: 0, created_at: now,
  }, { onConflict: 'email' })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error: mailErr } = await resend.emails.send({
    from: FROM, to: email, subject: `${code} is your TribePicks code`, html: buildHtml(code),
  })
  if (mailErr) return NextResponse.json({ error: 'Could not send the code — please try again.' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
