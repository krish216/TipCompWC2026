import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { resolveCompChiefContact, chiefFromLine } from '@/lib/comp-chief'
import { PRACTICE_SLUG } from '@/lib/sweep/practice'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const FROM    = process.env.RESEND_FROM ?? 'TribePicks <noreply@mail.tribepicks.com>'
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.tribepicks.com').replace(/\/$/, '')
const MAX_PER_SEND = 50
const RESEND_AFTER_MS = 60 * 60 * 1000   // one reminder an hour per address, at most

// /api/comps/:id/sweep/invites — sweep-admin's "Invite by email". Sweep-worded invites into
// comp_invitations, the same rows /sweep shows a signed-in person as a one-tap Join (and
// self-register deletes once they join). So who still needs a nudge comes from live data:
//   invited    — invitations not taken up yet (the row is gone once they join);
//   no_ticket  — in the sweep but holding no ticket and no open request, by name only.
//
// GET              → { invited: [{ id, email, invited_at, display_name }], no_ticket: [{ user_id, display_name }] }
// POST { emails }  → invites new addresses and emails each; { invited, already_invited, already_in, invalid }
// PATCH { id }     → re-sends one invitation (at most hourly)
// DELETE ?id=      → removes one invitation

async function gate(compId: string) {
  const user = await getSessionUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const admin = createAdminClient()
  const [{ data: comp }, { data: compAdmin }, { data: platformAdmin }] = await Promise.all([
    (admin.from('comps') as any)
      .select('id, name, invite_code, tournament_id, created_by, owner_name, owner_email, sweep_ticket_price_cents').eq('id', compId).maybeSingle(),
    (admin.from('comp_admins') as any).select('user_id').eq('comp_id', compId).eq('user_id', user.id).maybeSingle(),
    (admin.from('admin_users') as any).select('user_id').eq('user_id', user.id).maybeSingle(),
  ])
  if (!comp) return { error: NextResponse.json({ error: 'Sweep not found' }, { status: 404 }) }
  if (!compAdmin && !platformAdmin) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const { data: tourn } = await (admin.from('tournaments') as any)
    .select('name, slug, format').eq('id', comp.tournament_id).maybeSingle()
  if ((tourn as any)?.format !== 'sweep') return { error: NextResponse.json({ error: 'This comp is not a sweep' }, { status: 400 }) }
  return { admin, user, comp: comp as any, tournamentName: (tourn as any)?.name ?? 'the race', practice: (tourn as any)?.slug === PRACTICE_SLUG }
}

type Gate = Exclude<Awaited<ReturnType<typeof gate>>, { error: NextResponse }>

async function sendInvite(g: Gate, email: string, name: string | null) {
  if (!process.env.RESEND_API_KEY) return
  const chief = await resolveCompChiefContact(g.admin, g.comp)
  await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: chiefFromLine(chief.name, FROM), to: email,
    subject: g.practice ? `${chief.name} invited you to a practice sweep` : `${chief.name} invited you to their ${g.tournamentName} sweep 🏇`,
    html: buildHtml({
      name, chiefName: chief.name, replyable: !!chief.email, sweepName: g.comp.name, tournamentName: g.tournamentName, practice: g.practice,
      priceCents: g.comp.sweep_ticket_price_cents ?? null,
      joinLink: `${APP_URL}/sweep?code=${encodeURIComponent(g.comp.invite_code)}`,
    }),
    ...(chief.email ? { reply_to: chief.email } : {}),
  }).catch(() => { /* non-fatal — the invitation row (and /sweep's Join) already exists */ })
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gate(params.id)
  if ('error' in g) return g.error
  const { admin } = g

  const [{ data: invites }, { data: members }, { data: tribes }] = await Promise.all([
    (admin.from('comp_invitations') as any).select('id, email, invited_at, user_id').eq('comp_id', params.id).order('invited_at', { ascending: false }),
    (admin.from('user_comps') as any).select('user_id').eq('comp_id', params.id),
    (admin.from('tribes') as any).select('id').eq('comp_id', params.id),
  ])
  const tribeIds = ((tribes ?? []) as any[]).map(t => t.id)
  const [{ data: entries }, { data: requests }, { data: compAdmins }] = await Promise.all([
    tribeIds.length ? (admin.from('sweep_entries') as any).select('user_id').in('tribe_id', tribeIds) : { data: [] },
    tribeIds.length ? (admin.from('sweep_payment_requests') as any).select('user_id').in('tribe_id', tribeIds).in('status', ['pending', 'approved']) : { data: [] },
    (admin.from('comp_admins') as any).select('user_id').eq('comp_id', params.id),
  ])
  const holding = new Set([...(entries ?? []), ...(requests ?? []), ...(compAdmins ?? [])].map((r: any) => r.user_id))
  const noTicketIds = [...new Set(((members ?? []) as any[]).map(m => m.user_id))].filter(id => !holding.has(id))

  const nameIds = [...new Set([...noTicketIds, ...((invites ?? []) as any[]).map(i => i.user_id).filter(Boolean)])]
  const { data: users } = nameIds.length
    ? await (admin.from('users') as any).select('id, display_name').in('id', nameIds)
    : { data: [] }
  const nameOf = new Map(((users ?? []) as any[]).map(u => [u.id, u.display_name as string | null]))

  return NextResponse.json({
    invited: ((invites ?? []) as any[]).map(i => ({ id: i.id, email: i.email, invited_at: i.invited_at, display_name: i.user_id ? nameOf.get(i.user_id) ?? null : null })),
    no_ticket: noTicketIds.map(id => ({ user_id: id, display_name: nameOf.get(id) ?? 'Someone' }))
      .sort((a, b) => a.display_name!.localeCompare(b.display_name!)),
  })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gate(params.id)
  if ('error' in g) return g.error
  const { admin, user } = g

  const body = await req.json().catch(() => null)
  const raw: unknown[] = Array.isArray(body?.emails) ? body.emails : []
  const emails = [...new Set(raw.filter((e): e is string => typeof e === 'string').map(e => e.trim().toLowerCase()).filter(Boolean))]
  const valid = emails.filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
  if (!valid.length) return NextResponse.json({ error: 'Add at least one email address' }, { status: 400 })
  if (valid.length > MAX_PER_SEND) return NextResponse.json({ error: `Up to ${MAX_PER_SEND} addresses at a time` }, { status: 400 })

  const counts = { invited: 0, already_invited: 0, already_in: 0, invalid: emails.length - valid.length }
  for (const email of valid) {
    const { data: existing } = await (admin.from('comp_invitations') as any)
      .select('id').eq('comp_id', params.id).eq('email', email).maybeSingle()
    if (existing) { counts.already_invited++; continue }

    const { data: registered } = await (admin.from('users') as any)
      .select('id, display_name').ilike('email', email).maybeSingle()
    if (registered) {
      const { data: member } = await (admin.from('user_comps') as any)
        .select('comp_id').eq('comp_id', params.id).eq('user_id', (registered as any).id).maybeSingle()
      if (member) { counts.already_in++; continue }
    }

    const { error } = await (admin.from('comp_invitations') as any)
      .insert({ comp_id: params.id, email, invited_by: user.id, user_id: (registered as any)?.id ?? null })
    if (error) { counts.already_invited++; continue }   // unique (comp_id, email) — invited meanwhile
    counts.invited++
    await sendInvite(g, email, (registered as any)?.display_name ?? null)
  }
  return NextResponse.json(counts)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gate(params.id)
  if ('error' in g) return g.error
  const body = await req.json().catch(() => null)
  const { data: inv } = await (g.admin.from('comp_invitations') as any)
    .select('id, email, invited_at, user_id').eq('id', body?.id ?? '').eq('comp_id', params.id).maybeSingle()
  if (!inv) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
  if (Date.now() - new Date((inv as any).invited_at).getTime() < RESEND_AFTER_MS) {
    return NextResponse.json({ error: 'Sent within the last hour — give them a moment' }, { status: 429 })
  }
  const now = new Date().toISOString()
  await (g.admin.from('comp_invitations') as any).update({ invited_at: now }).eq('id', (inv as any).id)
  const { data: u } = (inv as any).user_id
    ? await (g.admin.from('users') as any).select('display_name').eq('id', (inv as any).user_id).maybeSingle()
    : { data: null }
  await sendInvite(g, (inv as any).email, (u as any)?.display_name ?? null)
  return NextResponse.json({ ok: true, invited_at: now })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gate(params.id)
  if ('error' in g) return g.error
  const id = new URL(req.url).searchParams.get('id') ?? ''
  await (g.admin.from('comp_invitations') as any).delete().eq('id', id).eq('comp_id', params.id)
  return NextResponse.json({ ok: true })
}

function buildHtml(o: {
  name: string | null; chiefName: string; replyable: boolean; sweepName: string; tournamentName: string
  practice: boolean; priceCents: number | null; joinLink: string
}): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const [chief, sweep, race] = [o.chiefName, o.sweepName, o.tournamentName].map(esc)
  const price = o.priceCents ? `$${(o.priceCents / 100).toFixed(o.priceCents % 100 ? 2 : 0)}` : null
  const pitch = o.practice
    ? 'It’s a practice sweep — no real money. Grab a ticket, spin for your horse and watch the pretend race.'
    : `${price ? `Tickets are <strong>${price}</strong> — you pay ${chief} directly. ` : ''}Spin the wheel for your horse, then cheer it home. Every dollar goes back as prizes.`
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:540px;margin:0 auto;padding:32px 24px;background:#ffffff;">
  <div style="margin-bottom:24px;text-align:center;">
    <img src="${APP_URL}/logo.png" alt="TribePicks" height="64" style="display:block;margin:0 auto;"/>
  </div>
  <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#111827;">Hi ${o.name ? esc(o.name) : 'there'},</p>
  <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#374151;">
    <strong>${chief}</strong> is running <strong>${sweep}</strong>${o.practice ? '' : ` for the <strong>${race}</strong>`} and has invited you in. 🏇
  </p>
  <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#374151;">${pitch}</p>
  <div style="text-align:center;margin:0 0 28px;">
    <a href="${o.joinLink}"
       style="display:inline-block;padding:14px 36px;background:#16a34a;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:12px;box-shadow:0 4px 14px rgba(22,163,74,0.35);">
      Join ${sweep} →
    </a>
  </div>
  <p style="margin:0 0 24px;font-size:13px;color:#6b7280;line-height:1.5;">
    New to TribePicks? The button sets up a free account in a few seconds. Already have one? The invitation is waiting on
    <a href="${APP_URL}/sweep" style="color:#065f46;">your sweeps</a> with a one-tap Join.
  </p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px;"/>
  <p style="font-size:11px;color:#9ca3af;margin:0;">Sent by ${chief} via <a href="${APP_URL}" style="color:#9ca3af;">TribePicks</a>.${o.replyable ? ` Reply to this email to reach ${chief}.` : ''}</p>
</body>
</html>`
}
