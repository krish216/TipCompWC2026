import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { Resend } from 'resend'

const FROM     = process.env.RESEND_FROM ?? 'TribePicks <noreply@mail.tribepicks.com>'
const APP_URL  = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.tribepicks.com').replace(/\/$/, '')

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
      const inviteCode    = (comp as any).invite_code
      const joinLink      = `${APP_URL}/join?code=${inviteCode}&email=${encodeURIComponent(email)}`
      const tokens = { name: recipientName, comp_name: (comp as any).name, join_code: inviteCode, join_link: joinLink, tournament_name: tournamentName }
      const emailSubject = subject
        ? subject.replace(/\{comp_name\}/g, tokens.comp_name).replace(/\{tournament_name\}/g, tokens.tournament_name)
        : `You've been invited to join ${tokens.comp_name}`
      const emailHtml = bodyTemplate
        ? buildTemplateHtml(bodyTemplate, tokens)
        : buildInviteHtml({ recipientName, compName: tokens.comp_name, inviteCode, joinLink, tournamentName })
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

function buildInviteHtml({ recipientName, compName, inviteCode, joinLink, tournamentName }: {
  recipientName: string; compName: string; inviteCode: string
  joinLink: string; tournamentName: string
}): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:540px;margin:0 auto;padding:32px 24px;background:#ffffff;">

  <!-- Header -->
  <div style="margin-bottom:24px;">
    <p style="margin:0;font-size:22px;font-weight:900;color:#065f46;letter-spacing:-0.5px;">TribePicks ⚽</p>
  </div>

  <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#111827;">Hi ${recipientName},</p>

  <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#374151;">
    You've been invited to join <strong>${compName}</strong> — a prediction comp for the <strong>${tournamentName}</strong>. Tap the button below to create your free account and join in one click.
  </p>

  <!-- Primary CTA -->
  <div style="text-align:center;margin:0 0 28px;">
    <a href="${joinLink}"
       style="display:inline-block;padding:14px 36px;background:#16a34a;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:12px;letter-spacing:-0.2px;box-shadow:0 4px 14px rgba(22,163,74,0.35);">
      Join ${compName} →
    </a>
  </div>

  <!-- What to expect -->
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px 20px;margin:0 0 28px;">
    <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.04em;">What happens when you tap Join</p>
    <table style="width:100%;border-collapse:collapse;">
      ${[
        ['🖊️', 'Create a free account (takes 30 seconds)'],
        ['✅', `You're automatically added to <strong>${compName}</strong>`],
        ['🎯', 'Start tipping — predictions open now'],
      ].map(([icon, text]) => `
      <tr>
        <td style="width:28px;padding:4px 10px 4px 0;vertical-align:top;font-size:15px;">${icon}</td>
        <td style="padding:4px 0;font-size:13px;line-height:1.5;color:#374151;">${text}</td>
      </tr>`).join('')}
    </table>
  </div>

  <!-- Fallback -->
  <div style="border-top:1px solid #f3f4f6;padding-top:20px;margin-bottom:24px;">
    <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">Button not working?</p>
    <p style="margin:0 0 6px;font-size:13px;color:#6b7280;line-height:1.5;">
      <strong>If you already have a TribePicks account:</strong> sign in at
      <a href="${APP_URL}" style="color:#065f46;">${APP_URL.replace('https://', '')}</a>
      — the invitation will appear on your home screen. Tap it to join with one click, no code needed.
    </p>
    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">
      <strong>No invitation showing?</strong> Tap <em>Join a comp</em> on the home screen and enter code
      <span style="font-family:monospace;font-weight:700;color:#065f46;letter-spacing:0.15em;">${inviteCode}</span>.
    </p>
  </div>

  <p style="margin:0 0 24px;font-size:14px;color:#374151;">Good luck! 🏆</p>
  <p style="margin:0 0 24px;font-size:13px;color:#6b7280;">The <strong>${compName}</strong> team</p>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px;"/>
  <p style="font-size:11px;color:#9ca3af;margin:0;">
    This invite was sent by your comp admin via <a href="${APP_URL}" style="color:#9ca3af;">TribePicks</a>.
    The join link uses your comp's invite code which does not expire.
  </p>
</body>
</html>`
}

function buildTemplateHtml(
  template: string,
  tokens: { name: string; comp_name: string; join_code: string; join_link: string; tournament_name: string }
): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.tribepicks.com').replace(/\/$/, '')
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // Use a null-byte sentinel so we can locate {join_link} after escaping other tokens
  const JOIN_PLACEHOLDER = '\x00JOIN\x00'
  const body = template
    .replace(/\{name\}/g,            esc(tokens.name))
    .replace(/\{comp_name\}/g,       esc(tokens.comp_name))
    .replace(/\{join_code\}/g,       esc(tokens.join_code))
    .replace(/\{join_link\}/g,       JOIN_PLACEHOLDER)
    .replace(/\{tournament_name\}/g, esc(tokens.tournament_name))

  // Full-width CTA button — used when {join_link} is on its own line
  const joinBtn =
    `<div style="text-align:center;margin:24px 0;">` +
    `<a href="${tokens.join_link}" style="display:inline-block;padding:14px 36px;background:#16a34a;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:12px;letter-spacing:-0.2px;box-shadow:0 4px 14px rgba(22,163,74,0.35);">` +
    `Join ${esc(tokens.comp_name)} →` +
    `</a></div>`

  // Inline anchor — used when {join_link} is embedded in text
  const joinAnchor = `<a href="${tokens.join_link}" style="color:#16a34a;word-break:break-all;">${tokens.join_link}</a>`

  const lines = body.split('\n').map(line => {
    if (line.trim() === JOIN_PLACEHOLDER) return joinBtn
    const replaced = line.replace(JOIN_PLACEHOLDER, joinAnchor)
    return `<p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#374151;">${replaced || '&nbsp;'}</p>`
  }).join('')

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
