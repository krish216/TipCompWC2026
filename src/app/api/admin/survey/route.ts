import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { requireAdmin } from '@/lib/sponsors/auth'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const DEFAULT_SURVEY = 'wc2026_pulse'
const FROM   = process.env.RESEND_FROM ?? 'TribePicks <noreply@mail.tribepicks.com>'
const APPURL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.tribepicks.com').replace(/\/$/, '')

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
}

// One-tap NPS email. Each 0–10 number links to /r/<token>?s=<n>; the token is
// opaque (no identity in the URL).
function buildSurveyHtml(name: string, token: string): string {
  const link = (n: number) => `${APPURL}/r/${token}?s=${n}`
  const cell = (n: number) => {
    const bg = n <= 6 ? '#ef4444' : n <= 8 ? '#f59e0b' : '#059669'
    return `<td style="padding:2px;"><a href="${link(n)}" style="display:block;width:30px;line-height:34px;text-align:center;border-radius:6px;background:${bg};color:#ffffff;font-weight:700;font-size:13px;text-decoration:none;">${n}</a></td>`
  }
  const scale = `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:6px auto;"><tr>${Array.from({ length: 11 }, (_, n) => cell(n)).join('')}</tr></table>`
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#ffffff;">
  <p style="margin:0 0 4px;font-size:20px;font-weight:900;color:#065f46;letter-spacing:-0.5px;">TribePicks</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:14px 0 20px;"/>
  <p style="font-size:15px;color:#111827;margin:0 0 6px;">Hi ${escapeHtml(name)},</p>
  <p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 4px;">You've been reporting issues and we've been shipping fixes fast. Now the bigger picture — one tap:</p>
  <p style="font-size:15px;font-weight:700;color:#111827;margin:16px 0 2px;text-align:center;">How likely are you to recommend TribePicks to a mate?</p>
  ${scale}
  <p style="font-size:11px;color:#9ca3af;margin:0;text-align:center;">0 = not at all&nbsp;&nbsp;·&nbsp;&nbsp;10 = absolutely</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 14px;"/>
  <p style="font-size:11px;color:#9ca3af;margin:0;">🔒 Your response is confidential — we use it to improve TribePicks and may follow up to help. Tap a number above and you can add a reason on the next screen.</p>
</body></html>`
}

function randomToken(): string {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '')
}

// GET /api/admin/survey?survey= — admin: NPS summary + responses.
export async function GET(request: NextRequest) {
  const { admin, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const survey = new URL(request.url).searchParams.get('survey') || DEFAULT_SURVEY

  const { data: resp } = await (admin.from('nps_responses') as any)
    .select('score, comment, source, created_at, users(display_name)')
    .eq('survey_key', survey).order('created_at', { ascending: false })
  const rows = (resp ?? []) as any[]

  let promoters = 0, passives = 0, detractors = 0, sum = 0
  for (const r of rows) {
    sum += r.score
    if (r.score >= 9) promoters++
    else if (r.score >= 7) passives++
    else detractors++
  }
  const total = rows.length
  const nps = total ? Math.round(((promoters - detractors) / total) * 100) : null

  const { count: invited } = await (admin.from('nps_invites') as any)
    .select('token', { count: 'exact', head: true }).eq('survey_key', survey)

  const { data: liveRow } = await (admin.from('app_settings') as any).select('value').eq('key', 'nps_pulse_live').maybeSingle()

  return NextResponse.json({
    live: (liveRow as any)?.value === 'on',
    summary: { total, promoters, passives, detractors, nps, avg: total ? +(sum / total).toFixed(1) : null, invited: invited ?? 0 },
    responses: rows.map(r => ({
      score: r.score, comment: r.comment, source: r.source, created_at: r.created_at,
      display_name: r.users?.display_name ?? 'Member',
    })),
  })
}

// PATCH /api/admin/survey — admin: turn the in-app pulse on/off for all users.
// Body: { live: boolean }. Admins always see the pulse regardless (preview).
export async function PATCH(request: NextRequest) {
  const { admin, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await request.json().catch(() => ({} as any))
  const value = b.live ? 'on' : 'off'
  const { error } = await (admin.from('app_settings') as any).upsert({ key: 'nps_pulse_live', value, updated_at: new Date().toISOString() })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, live: value === 'on' })
}

// POST /api/admin/survey — admin: send the NPS email.
// Body: { survey?, emails?: string[], scope?: 'all', test_email?: string }
export async function POST(request: NextRequest) {
  const { admin, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: 'Email service not configured' }, { status: 503 })

  const b = await request.json().catch(() => ({} as any))
  const survey = b.survey || DEFAULT_SURVEY

  // Resolve recipients → users with an email.
  let recipients: any[] = []
  if (typeof b.test_email === 'string' && b.test_email.trim()) {
    const { data } = await (admin.from('users') as any).select('id, email, display_name, first_name').ilike('email', b.test_email.trim()).limit(1)
    recipients = (data ?? []) as any[]
  } else if (Array.isArray(b.emails) && b.emails.length) {
    const { data } = await (admin.from('users') as any).select('id, email, display_name, first_name').in('email', b.emails)
    recipients = (data ?? []) as any[]
  } else if (b.scope === 'all') {
    for (let from = 0; ; from += 1000) {
      const { data } = await (admin.from('users') as any).select('id, email, display_name, first_name').not('email', 'is', null).range(from, from + 999)
      if (!data?.length) break
      recipients.push(...data)
      if (data.length < 1000) break
    }
  } else {
    return NextResponse.json({ error: 'Provide test_email, emails[], or scope:"all"' }, { status: 400 })
  }
  recipients = recipients.filter(r => r.email)
  if (!recipients.length) return NextResponse.json({ error: 'No matching recipients' }, { status: 400 })

  // One opaque invite token per user (reuse an existing one if present).
  const userIds = recipients.map(r => r.id)
  const tokenByUser: Record<string, string> = {}
  for (let i = 0; i < userIds.length; i += 300) {
    const { data: inv } = await (admin.from('nps_invites') as any).select('token, user_id').eq('survey_key', survey).in('user_id', userIds.slice(i, i + 300))
    ;((inv ?? []) as any[]).forEach(x => { tokenByUser[x.user_id] = x.token })
  }
  const toCreate = recipients.filter(r => !tokenByUser[r.id]).map(r => ({ token: randomToken(), user_id: r.id, survey_key: survey }))
  if (toCreate.length) {
    await (admin.from('nps_invites') as any).insert(toCreate)
    toCreate.forEach(c => { tokenByUser[c.user_id] = c.token })
  }

  // Send via Resend in batches.
  const resend  = new Resend(process.env.RESEND_API_KEY)
  const subject = 'Quick one — how are we doing? 🙏'
  let sent = 0
  const BATCH = 100
  for (let i = 0; i < recipients.length; i += BATCH) {
    const slice = recipients.slice(i, i + BATCH)
    const messages = slice.map(r => ({
      from: FROM, to: r.email as string, subject,
      html: buildSurveyHtml((r.display_name || r.first_name || 'there').trim() || 'there', tokenByUser[r.id]),
    }))
    const { error } = await resend.batch.send(messages)
    if (error) return NextResponse.json({ error: (error as any).message ?? 'Send failed', sent }, { status: 500 })
    sent += slice.length
  }

  return NextResponse.json({ ok: true, sent, recipients: recipients.length })
}
