import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { Resend } from 'resend'

const FROM = process.env.RESEND_FROM ?? 'TribePicks <noreply@mail.tribepicks.com>'

// POST /api/comp-announcements — comp admin emails all (or selected) tipsters
export async function POST(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const { comp_id, title, body: emailBody, recipients } = body ?? {}

  if (!comp_id || !title?.trim() || !emailBody?.trim()) {
    return NextResponse.json({ error: 'comp_id, title and body required' }, { status: 400 })
  }
  if (!Array.isArray(recipients) || recipients.length === 0) {
    return NextResponse.json({ error: 'recipients array required' }, { status: 400 })
  }

  // Verify caller is an admin for this comp
  const { data: adminRow } = await (adminClient.from('comp_admins') as any)
    .select('comp_id').eq('user_id', user.id).eq('comp_id', comp_id).single()
  if (!adminRow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'Email service not configured — set RESEND_API_KEY' }, { status: 503 })
  }

  // Fetch comp name for email footer branding
  const { data: comp } = await (adminClient.from('comps') as any)
    .select('name').eq('id', comp_id).single()
  const compName = (comp as any)?.name ?? 'Your comp'

  const resend  = new Resend(process.env.RESEND_API_KEY)
  const html    = buildHtml(compName, emailBody.trim())
  const subject = title.trim()

  // Batch-send individually so each recipient only sees their own address.
  // Resend batch endpoint accepts up to 100 messages per call.
  const BATCH = 100
  let sent = 0
  for (let i = 0; i < recipients.length; i += BATCH) {
    const slice    = (recipients as string[]).slice(i, i + BATCH)
    const messages = slice.map(to => ({ from: FROM, to, subject, html }))
    const { error } = await resend.batch.send(messages)
    if (error) return NextResponse.json({ error: (error as any).message ?? 'Send failed' }, { status: 500 })
    sent += slice.length
  }

  return NextResponse.json({ sent })
}

function buildHtml(compName: string, body: string): string {
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
    <p style="margin:3px 0 0;font-size:12px;color:#6b7280;">${compName}</p>
  </div>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px;"/>
  ${lines}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px;"/>
  <p style="font-size:11px;color:#9ca3af;margin:0;">
    Message sent by your comp admin via <a href="${appUrl}" style="color:#6b7280;">TribePicks</a>.
    &nbsp;·&nbsp;
    <a href="${appUrl}/settings" style="color:#9ca3af;">Manage notifications</a>
  </p>
</body>
</html>`
}
