import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { createNotifications } from '@/lib/notifications'
import { Resend } from 'resend'

const FROM = process.env.RESEND_FROM ?? 'TribePicks <noreply@mail.tribepicks.com>'

// GET /api/comp-announcements?comp_id={id}
// Returns recent published announcements for a comp (members only).
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const compId = searchParams.get('comp_id')
    if (!compId) return NextResponse.json({ error: 'comp_id required' }, { status: 400 })

    const admin = createAdminClient()

    // Verify caller is a comp member or admin
    const [{ data: memberRow }, { data: adminRow }] = await Promise.all([
      (admin.from('user_comps') as any).select('user_id').eq('comp_id', compId).eq('user_id', user.id).single(),
      (admin.from('comp_admins') as any).select('comp_id').eq('comp_id', compId).eq('user_id', user.id).single(),
    ])
    if (!memberRow && !adminRow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: rows } = await (admin.from('comp_announcements') as any)
      .select('id, title, body, created_at')
      .eq('comp_id', compId)
      .eq('published', true)
      .order('created_at', { ascending: false })
      .limit(20)

    return NextResponse.json({ data: rows ?? [] })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 })
  }
}

// POST /api/comp-announcements
// persist: true  → saves to comp_announcements table (in-app feed)
// send_email: true + recipients → emails via Resend (existing email tab behaviour)
// Both can be combined. At least one must be active.
export async function POST(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const {
    comp_id,
    title,
    body: msgBody,
    recipients = [],
    send_email  = recipients.length > 0,  // default: email if recipients provided
    persist     = false,                   // default: don't persist (backward compat)
  } = body ?? {}

  if (!comp_id || !title?.trim() || !msgBody?.trim()) {
    return NextResponse.json({ error: 'comp_id, title and body required' }, { status: 400 })
  }
  if (!persist && (!send_email || !Array.isArray(recipients) || recipients.length === 0)) {
    return NextResponse.json({ error: 'Provide recipients for email, or set persist:true for in-app post' }, { status: 400 })
  }

  // Verify caller is a comp admin
  const { data: adminRow } = await (adminClient.from('comp_admins') as any)
    .select('comp_id').eq('user_id', user.id).eq('comp_id', comp_id).single()
  if (!adminRow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // ── 1. Persist to comp_announcements table ──────────────────────────────────
  let persistedId: string | null = null
  if (persist) {
    const { data: inserted } = await (adminClient.from('comp_announcements') as any)
      .insert({ comp_id, author_id: user.id, title: title.trim(), body: msgBody.trim(), published: true })
      .select('id').single()
    persistedId = (inserted as any)?.id ?? null
  }

  // ── 2. Send email if requested ──────────────────────────────────────────────
  let sent = 0
  if (send_email && Array.isArray(recipients) && recipients.length > 0) {
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'Email service not configured — set RESEND_API_KEY' }, { status: 503 })
    }

    const { data: comp } = await (adminClient.from('comps') as any)
      .select('name').eq('id', comp_id).single()
    const compName = (comp as any)?.name ?? 'Your comp'

    // Resolve display names so {name} personalises per recipient (matched
    // case-insensitively; recipients with no account fall back to "there").
    const { data: nameRows } = await (adminClient.from('users') as any)
      .select('email, display_name, first_name').in('email', recipients as string[])
    const nameByEmail: Record<string, string> = {}
    for (const u of (nameRows ?? []) as any[]) {
      if (u.email) nameByEmail[String(u.email).toLowerCase()] = (u.display_name || u.first_name || '').trim()
    }
    const nameFor = (email: string) => nameByEmail[email.toLowerCase()] || 'there'

    const resend  = new Resend(process.env.RESEND_API_KEY)
    const subject = title.trim()
    const trimmedBody = msgBody.trim()

    const BATCH = 100
    for (let i = 0; i < recipients.length; i += BATCH) {
      const slice    = (recipients as string[]).slice(i, i + BATCH)
      const messages = slice.map((to: string) => ({
        from: FROM, to, subject,
        html: buildHtml(compName, personalise(trimmedBody, nameFor(to), true)),
      }))
      const { error } = await resend.batch.send(messages)
      if (error) return NextResponse.json({ error: (error as any).message ?? 'Send failed' }, { status: 500 })
      sent += slice.length
    }

    // Fire in-app notifications for emailed recipients
    ;(async () => {
      try {
        const { data: userRows } = await (adminClient.from('users') as any)
          .select('id, display_name, first_name').in('email', recipients as string[])
        const rows = (userRows ?? []) as any[]
        if (!rows.length) return
        await createNotifications(rows.map((u: any) => {
          const nm      = (u.display_name || u.first_name || '').trim() || 'there'
          const preview = personalise(msgBody.trim(), nm).split('\n').find((l: string) => l.trim()) ?? ''
          return {
            user_id: u.id as string,
            type:    'comp_announcement' as const,
            title:   `📢 ${title.trim()}`,
            body:    preview.length > 120 ? preview.slice(0, 117) + '…' : preview,
            data:    { comp_id },
          }
        }))
      } catch {}
    })()
  } else if (persist) {
    // In-app only — notify all comp members via bell
    ;(async () => {
      try {
        const { data: memberRows } = await (adminClient.from('user_comps') as any)
          .select('user_id').eq('comp_id', comp_id)
        const userIds = ((memberRows ?? []) as any[])
          .map((m: any) => m.user_id as string)
          .filter((uid: string) => uid !== user.id)
        if (!userIds.length) return
        const { data: us } = await (adminClient.from('users') as any)
          .select('id, display_name, first_name').in('id', userIds)
        const nameById: Record<string, string> = {}
        for (const u of (us ?? []) as any[]) nameById[u.id] = (u.display_name || u.first_name || '').trim()
        await createNotifications(userIds.map((uid: string) => {
          const nm      = nameById[uid] || 'there'
          const preview = personalise(msgBody.trim(), nm).split('\n').find((l: string) => l.trim()) ?? ''
          return {
            user_id: uid,
            type:    'comp_announcement' as const,
            title:   `📢 ${title.trim()}`,
            body:    preview.length > 120 ? preview.slice(0, 117) + '…' : preview,
            data:    { comp_id },
          }
        }))
      } catch {}
    })()
  }

  return NextResponse.json({ persisted: !!persistedId, id: persistedId, sent })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
}

// Replace {name} with the recipient's name. For email the name is HTML-escaped
// (it's user-supplied); the plain-text notification path passes raw.
function personalise(text: string, name: string, forHtml = false): string {
  return text.replace(/\{name\}/g, forHtml ? escapeHtml(name) : name)
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
