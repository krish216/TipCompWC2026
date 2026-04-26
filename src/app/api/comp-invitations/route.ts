import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { Resend } from 'resend'

const FROM     = process.env.RESEND_FROM ?? 'TribePicks <noreply@mail.tribepicks.com>'
const APP_URL  = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.tribepicks.com'

// Helper: verify caller is comp admin (or tournament admin)
async function verifyCompAdmin(userId: string, compId: string) {
  const admin = createAdminClient()
  const [{ data: compAdmin }, { data: tournAdmin }] = await Promise.all([
    (admin.from('comp_admins') as any).select('comp_id').eq('user_id', userId).eq('comp_id', compId).single(),
    admin.from('admin_users').select('user_id').eq('user_id', userId).single(),
  ])
  return !!(compAdmin || tournAdmin)
}

// GET /api/comp-invitations?comp_id=  — list all invitations for a comp
export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const compId = new URL(request.url).searchParams.get('comp_id')
  if (!compId) return NextResponse.json({ error: 'comp_id required' }, { status: 400 })

  if (!(await verifyCompAdmin(user.id, compId)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await (admin.from('comp_invitations') as any)
    .select('id, email, invited_at, joined_at, user_id')
    .eq('comp_id', compId)
    .order('invited_at', { ascending: false })

  if (error) {
    console.warn('[comp-invitations GET]', error.message)
    return NextResponse.json({ data: [] })
  }

  // Fetch display names for invited users who have registered accounts
  const userIds = (data ?? []).filter((r: any) => r.user_id).map((r: any) => r.user_id)
  const displayNames: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: userRows } = await admin.from('users').select('id, display_name').in('id', userIds)
    ;(userRows ?? []).forEach((u: any) => { displayNames[u.id] = u.display_name })
  }

  return NextResponse.json({
    data: (data ?? []).map((row: any) => ({
      id:           row.id,
      email:        row.email,
      invited_at:   row.invited_at,
      joined_at:    row.joined_at,
      user_id:      row.user_id,
      display_name: row.user_id ? (displayNames[row.user_id] ?? null) : null,
      joined:       !!row.joined_at,
    }))
  })
}

// POST /api/comp-invitations — create invitation(s) and send email
// Body: { comp_id, emails: string[], customMessage?: string }
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const { comp_id, emails, subject, bodyTemplate } = body
  if (!comp_id || !Array.isArray(emails) || emails.length === 0)
    return NextResponse.json({ error: 'comp_id and emails[] required' }, { status: 400 })

  if (!(await verifyCompAdmin(user.id, comp_id)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()

  // Get comp + tournament details for the invite email
  const { data: comp } = await (admin.from('comps') as any)
    .select('id, name, invite_code, tournament_id').eq('id', comp_id).single()
  if (!comp) return NextResponse.json({ error: 'Comp not found' }, { status: 404 })

  let tournamentName = 'the tournament'
  if ((comp as any).tournament_id) {
    const { data: tourn } = await (admin.from('tournaments') as any)
      .select('name').eq('id', (comp as any).tournament_id).single()
    if (tourn) tournamentName = (tourn as any).name
  }

  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

  const results: { email: string; status: 'invited' | 'already_invited' | 'already_member' | 'error'; id?: string; user_id?: string | null; display_name?: string | null }[] = []

  for (const rawEmail of emails) {
    const email = rawEmail.trim().toLowerCase()
    if (!email || !/\S+@\S+\.\S+/.test(email)) continue

    // Check if already invited
    const { data: existing } = await (admin.from('comp_invitations') as any)
      .select('id').eq('comp_id', comp_id).eq('email', email).maybeSingle()
    if (existing) { results.push({ email, status: 'already_invited', id: existing.id }); continue }

    // Look up registered user by email in the users table
    const { data: registeredUser } = await (admin.from('users') as any)
      .select('id, display_name').ilike('email', email).maybeSingle()

    // Skip if user is already a member of this comp
    if (registeredUser) {
      const { data: membership } = await (admin.from('user_comps') as any)
        .select('comp_id').eq('user_id', (registeredUser as any).id).eq('comp_id', comp_id).maybeSingle()
      if (membership) { results.push({ email, status: 'already_member' }); continue }
    }

    // Insert invitation row
    const { data: inv, error: invErr } = await (admin.from('comp_invitations') as any)
      .insert({ comp_id, email, invited_by: user.id, user_id: (registeredUser as any)?.id ?? null })
      .select('id').single()

    if (invErr) { results.push({ email, status: 'error' }); continue }

    // Send invitation email
    if (resend) {
      const recipientName = (registeredUser as any)?.display_name ?? 'there'
      const tokens = { name: recipientName, comp_name: (comp as any).name, join_code: (comp as any).invite_code, tournament_name: tournamentName }
      const emailSubject = subject
        ? subject.replace(/\{comp_name\}/g, tokens.comp_name).replace(/\{tournament_name\}/g, tokens.tournament_name)
        : `You've been invited to join ${tokens.comp_name}`
      const emailHtml = bodyTemplate
        ? buildTemplateHtml(bodyTemplate, tokens)
        : buildInviteHtml({ recipientName, compName: tokens.comp_name, inviteCode: tokens.join_code, tournamentName, customMessage: '' })
      await resend.emails.send({
        from: FROM, to: email, subject: emailSubject, html: emailHtml,
      }).catch(() => { /* non-fatal — invitation row already created */ })
    }

    results.push({
      email,
      status:       'invited',
      id:           (inv as any).id,
      user_id:      (registeredUser as any)?.id           ?? null,
      display_name: (registeredUser as any)?.display_name ?? null,
    })
  }

  const invited       = results.filter(r => r.status === 'invited').length
  const already       = results.filter(r => r.status === 'already_invited').length
  const alreadyMember = results.filter(r => r.status === 'already_member').length

  return NextResponse.json({ results, invited, already, already_member: alreadyMember })
}

function buildInviteHtml({ recipientName, compName, inviteCode, tournamentName, customMessage }: {
  recipientName: string; compName: string; inviteCode: string
  tournamentName: string; customMessage: string
}): string {
  const customPara = customMessage.trim()
    ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#374151;">${customMessage.trim().replace(/\n/g, '<br/>')}</p>`
    : ''
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:540px;margin:0 auto;padding:32px 24px;background:#ffffff;">

  <!-- Header -->
  <div style="margin-bottom:24px;">
    <p style="margin:0;font-size:22px;font-weight:900;color:#065f46;letter-spacing:-0.5px;">TribePicks ⚽</p>
  </div>

  <p style="margin:0 0 16px;font-size:15px;font-weight:700;color:#111827;">Hi ${recipientName},</p>

  <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#374151;">
    You've been invited to join <strong>${compName}</strong> for the <strong>${tournamentName}</strong>.
  </p>

  ${customPara}

  <!-- Join code callout -->
  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;margin:0 0 24px;">
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:0.05em;">Your join code</p>
    <p style="margin:0;font-size:28px;font-weight:900;color:#065f46;letter-spacing:0.25em;font-family:monospace;">${inviteCode}</p>
  </div>

  <!-- Step-by-step instructions -->
  <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#111827;">How to join in 3 steps:</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
    ${[
      ['1', `Go to <a href="${APP_URL}" style="color:#065f46;font-weight:600;">${APP_URL.replace('https://', '')}</a> and create a free account`],
      ['2', 'Once registered, tap <strong>Join Comp</strong> on the home screen'],
      ['3', `Enter comp code <strong style="font-family:monospace;letter-spacing:0.1em;">${inviteCode}</strong> and tap <strong>Join</strong> — you\'re in!`],
    ].map(([n, text]) => `
    <tr>
      <td style="width:32px;padding:6px 12px 6px 0;vertical-align:top;">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#065f46;color:#fff;font-size:12px;font-weight:700;">${n}</span>
      </td>
      <td style="padding:6px 0;font-size:13px;line-height:1.6;color:#374151;">${text}</td>
    </tr>`).join('')}
  </table>

  <p style="margin:0 0 24px;font-size:14px;color:#374151;">Good luck! 🏆</p>
  <p style="margin:0 0 24px;font-size:13px;color:#6b7280;">The <strong>${compName}</strong> team</p>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px;"/>
  <p style="font-size:11px;color:#9ca3af;margin:0;">
    This invite was sent by your comp admin via <a href="${APP_URL}" style="color:#9ca3af;">TribePicks</a>.
  </p>
</body>
</html>`
}

function buildTemplateHtml(
  template: string,
  tokens: { name: string; comp_name: string; join_code: string; tournament_name: string }
): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.tribepicks.com'
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const body = template
    .replace(/\{name\}/g,            esc(tokens.name))
    .replace(/\{comp_name\}/g,       esc(tokens.comp_name))
    .replace(/\{join_code\}/g,       esc(tokens.join_code))
    .replace(/\{tournament_name\}/g, esc(tokens.tournament_name))
  const lines = body.split('\n').map(line =>
    `<p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#374151;">${line || '&nbsp;'}</p>`
  ).join('')
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:540px;margin:0 auto;padding:32px 24px;background:#ffffff;">
  <div style="margin-bottom:24px;">
    <p style="margin:0;font-size:22px;font-weight:900;color:#065f46;letter-spacing:-0.5px;">TribePicks ⚽</p>
  </div>
  ${lines}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px;"/>
  <p style="font-size:11px;color:#9ca3af;margin:0;">
    This invite was sent by your comp admin via <a href="${appUrl}" style="color:#9ca3af;">TribePicks</a>.
  </p>
</body>
</html>`
}

// DELETE /api/comp-invitations?id=  — remove an invitation
export async function DELETE(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const admin = createAdminClient()

  // Get the invitation to verify comp admin access
  const { data: inv } = await (admin.from('comp_invitations') as any)
    .select('comp_id').eq('id', id).single()
  if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!(await verifyCompAdmin(user.id, (inv as any).comp_id)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await (admin.from('comp_invitations') as any).delete().eq('id', id)
  return NextResponse.json({ success: true })
}
