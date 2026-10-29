import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { resolveCompChiefContact, chiefFromLine } from '@/lib/comp-chief'
import { PRACTICE_SLUG } from '@/lib/sweep/practice'

export const dynamic = 'force-dynamic'

const FROM    = process.env.RESEND_FROM ?? 'TribePicks <noreply@mail.tribepicks.com>'
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.tribepicks.com').replace(/\/$/, '')

// /api/comps/:id/sweep/practice-crew — bring the people from an organiser's practice sweeps
// (migration 200) into their REAL sweep :id. Invite, never auto-add: they signed up for a
// pretend sweep, not a real-money one, so they opt in with the one-tap Join that /sweep shows
// for pending comp_invitations (self-register deletes the invitation once they join).
// Members are only ever returned by name — the organiser never sees their emails.
//
// GET  → { data: [{ user_id, display_name, practice_names, status: 'member'|'invited'|'none', can_email }] }
// POST { user_ids } → invites those still at 'none' and emails each one.

type CrewRow = { user_id: string; display_name: string; practice_names: string[]; status: 'member' | 'invited' | 'none'; can_email: boolean; email: string | null }

async function gate(compId: string) {
  const user = await getSessionUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const admin = createAdminClient()
  const [{ data: comp }, { data: compAdmin }, { data: platformAdmin }] = await Promise.all([
    (admin.from('comps') as any).select('id, name, invite_code, tournament_id, created_by, owner_name, owner_email').eq('id', compId).maybeSingle(),
    (admin.from('comp_admins') as any).select('user_id').eq('comp_id', compId).eq('user_id', user.id).maybeSingle(),
    (admin.from('admin_users') as any).select('user_id').eq('user_id', user.id).maybeSingle(),
  ])
  if (!comp) return { error: NextResponse.json({ error: 'Sweep not found' }, { status: 404 }) }
  if (!compAdmin && !platformAdmin) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const { data: tourn } = await (admin.from('tournaments') as any)
    .select('name, slug, format').eq('id', comp.tournament_id).maybeSingle()
  if ((tourn as any)?.format !== 'sweep' || (tourn as any)?.slug === PRACTICE_SLUG) {
    return { error: NextResponse.json({ error: 'Only a real sweep can invite a practice crew' }, { status: 400 }) }
  }
  return { admin, user, comp, tournamentName: (tourn as any)?.name ?? 'the race' }
}

// Everyone in the caller's own practice sweeps (bar the caller), with where they stand on :id.
async function loadCrew(admin: any, userId: string, compId: string): Promise<CrewRow[]> {
  const { data: practiceTourn } = await (admin.from('tournaments') as any).select('id').eq('slug', PRACTICE_SLUG).maybeSingle()
  if (!practiceTourn) return []
  const { data: adminRows } = await (admin.from('comp_admins') as any).select('comp_id').eq('user_id', userId)
  const myCompIds = ((adminRows ?? []) as any[]).map(r => r.comp_id)
  if (!myCompIds.length) return []
  const { data: practiceComps } = await (admin.from('comps') as any)
    .select('id, name').in('id', myCompIds).eq('tournament_id', (practiceTourn as any).id)
  if (!practiceComps?.length) return []
  const nameById = new Map((practiceComps as any[]).map(c => [c.id, c.name as string]))

  const { data: memberships } = await (admin.from('user_comps') as any)
    .select('user_id, comp_id').in('comp_id', [...nameById.keys()]).neq('user_id', userId)
  const practiceNames = new Map<string, Set<string>>()
  for (const m of (memberships ?? []) as any[]) {
    const s = practiceNames.get(m.user_id) ?? new Set<string>()
    s.add(nameById.get(m.comp_id)!)
    practiceNames.set(m.user_id, s)
  }
  const ids = [...practiceNames.keys()]
  if (!ids.length) return []

  const [{ data: users }, { data: inReal }] = await Promise.all([
    (admin.from('users') as any).select('id, display_name, email').in('id', ids),
    (admin.from('user_comps') as any).select('user_id').eq('comp_id', compId).in('user_id', ids),
  ])
  const memberSet = new Set(((inReal ?? []) as any[]).map(r => r.user_id))
  const emails = ((users ?? []) as any[]).map(u => (u.email ?? '').toLowerCase()).filter(Boolean)
  const { data: invites } = emails.length
    ? await (admin.from('comp_invitations') as any).select('email').eq('comp_id', compId).in('email', emails)
    : { data: [] }
  const invitedSet = new Set(((invites ?? []) as any[]).map(r => (r.email ?? '').toLowerCase()))

  return ((users ?? []) as any[]).map(u => {
    const email = (u.email ?? '').toLowerCase() || null
    return {
      user_id: u.id,
      display_name: u.display_name ?? 'Someone',
      practice_names: [...(practiceNames.get(u.id) ?? [])],
      status: memberSet.has(u.id) ? 'member' : email && invitedSet.has(email) ? 'invited' : 'none',
      can_email: !!email,
      email,
    } as CrewRow
  }).sort((a, b) => a.display_name.localeCompare(b.display_name))
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gate(params.id)
  if ('error' in g) return g.error
  const crew = await loadCrew(g.admin, g.user.id, params.id)
  return NextResponse.json({ data: crew.map(({ email: _email, ...rest }) => rest) })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gate(params.id)
  if ('error' in g) return g.error
  const { admin, user, comp, tournamentName } = g

  const body = await req.json().catch(() => null)
  const wanted = new Set<string>(Array.isArray(body?.user_ids) ? body.user_ids.filter((x: unknown) => typeof x === 'string') : [])
  if (!wanted.size) return NextResponse.json({ error: 'Pick at least one person to invite' }, { status: 400 })

  // Only ever people from the caller's own practice crew, and only those not already in or invited.
  const targets = (await loadCrew(admin, user.id, params.id)).filter(c => wanted.has(c.user_id) && c.status === 'none' && c.email)

  const chief = await resolveCompChiefContact(admin, comp as any)
  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
  const joinLink = `${APP_URL}/sweep?code=${encodeURIComponent((comp as any).invite_code)}`

  let invited = 0
  for (const t of targets) {
    const { error } = await (admin.from('comp_invitations') as any)
      .insert({ comp_id: params.id, email: t.email, invited_by: user.id, user_id: t.user_id })
    if (error) continue   // unique (comp_id, email) — invited meanwhile
    invited++
    if (resend) {
      await resend.emails.send({
        from: chiefFromLine(chief.name, FROM), to: t.email!,
        subject: `${chief.name} invited you to the real ${tournamentName} sweep`,
        html: buildSweepInviteHtml({ name: t.display_name, chiefName: chief.name, sweepName: (comp as any).name, tournamentName, joinLink }),
        ...(chief.email ? { reply_to: chief.email } : {}),
      }).catch(() => { /* non-fatal — the invitation row (and /sweep's Join) already exists */ })
    }
  }
  return NextResponse.json({ invited, skipped: wanted.size - invited })
}

function buildSweepInviteHtml(o: { name: string; chiefName: string; sweepName: string; tournamentName: string; joinLink: string }): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const [name, chief, sweep, race] = [o.name, o.chiefName, o.sweepName, o.tournamentName].map(esc)
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:540px;margin:0 auto;padding:32px 24px;background:#ffffff;">
  <div style="margin-bottom:24px;text-align:center;">
    <img src="${APP_URL}/logo.png" alt="TribePicks" height="64" style="display:block;margin:0 auto;"/>
  </div>
  <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#111827;">Hi ${name},</p>
  <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#374151;">
    Thanks for trying the practice sweep! The real one is now open: <strong>${chief}</strong> has invited you to
    <strong>${sweep}</strong> for the <strong>${race}</strong>.
  </p>
  <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#374151;">
    It works just like the practice — buy a ticket, spin for your horse, and cheer it home. This time it's for real.
  </p>
  <div style="text-align:center;margin:0 0 28px;">
    <a href="${o.joinLink}"
       style="display:inline-block;padding:14px 36px;background:#16a34a;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:12px;box-shadow:0 4px 14px rgba(22,163,74,0.35);">
      Join ${sweep} →
    </a>
  </div>
  <p style="margin:0 0 24px;font-size:13px;color:#6b7280;line-height:1.5;">
    Already signed in to TribePicks? Open <a href="${APP_URL}/sweep" style="color:#065f46;">your sweeps</a> — the invitation is waiting there with a one-tap Join.
  </p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px;"/>
  <p style="font-size:11px;color:#9ca3af;margin:0;">Sent by ${chief} via <a href="${APP_URL}" style="color:#9ca3af;">TribePicks</a> because you joined their practice sweep.</p>
</body>
</html>`
}
