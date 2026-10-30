import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { grantTickets } from '@/lib/sweep/tickets'
import { sendSweepPaymentConfirmation, sendSweepRequestRejected } from '@/lib/sweep/emails'
import { createNotifications } from '@/lib/notifications'
import { getOrganiserDetails } from '@/lib/sweep/organiser'
import { DRAW_OPENS_LABEL, loadField } from '@/lib/sweep/field'
import { autoDrawIfRequested } from '@/lib/sweep/draw'

export const dynamic = 'force-dynamic'

const ACTIONS = ['approve', 'reject', 'mark_paid']

// PATCH /api/tribes/:id/sweep/requests/:reqId — comp-admin only. Body: { action, notes? }.
// approve/reject only apply to a pending request; mark_paid only settles an approved request
// that's still unpaid (the IOU case — tickets already granted, money not yet in hand).
export async function PATCH(request: NextRequest, { params }: { params: { id: string; reqId: string } }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const action = body?.action
  if (!ACTIONS.includes(action)) return NextResponse.json({ error: `action must be one of: ${ACTIONS.join(', ')}` }, { status: 400 })

  const admin = createAdminClient()
  const { data: req } = await (admin.from('sweep_payment_requests') as any)
    .select('*').eq('id', params.reqId).eq('tribe_id', params.id).maybeSingle()
  if (!req) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  const { data: isAdmin } = await (admin.from('comp_admins') as any)
    .select('user_id').eq('comp_id', req.comp_id).eq('user_id', user.id).maybeSingle()
  if (!isAdmin) return NextResponse.json({ error: 'Only a comp admin can act on this request' }, { status: 403 })

  if (action === 'approve') {
    if (req.status !== 'pending') return NextResponse.json({ error: 'This request is no longer pending' }, { status: 409 })

    const { data: tribe } = await (admin.from('tribes') as any).select('name, tournament_id').eq('id', params.id).maybeSingle()
    const granted = await grantTickets(admin, {
      tribeId: params.id, tournamentId: (tribe as any).tournament_id, userId: req.user_id, count: req.tickets_requested,
      requestId: req.id,
    })
    if (!granted.ok) return NextResponse.json({ error: granted.error }, { status: 400 })

    const now = new Date().toISOString()
    const { data: updated, error } = await (admin.from('sweep_payment_requests') as any)
      .update({ status: 'approved', reviewed_by: user.id, reviewed_at: now, paid_at: now })
      .eq('id', req.id).select().maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Buyer asked for their horse to be drawn for them (migration 203).
    await autoDrawIfRequested(admin, { tribeId: params.id, tournamentId: (tribe as any).tournament_id, userId: req.user_id, autoDraw: req.auto_draw })

    const [{ data: buyer }, { data: comp }, { drawOpen }] = await Promise.all([
      (admin.from('users') as any).select('email, display_name').eq('id', req.user_id).maybeSingle(),
      (admin.from('comps') as any).select('name').eq('id', req.comp_id).maybeSingle(),
      loadField(admin, (tribe as any).tournament_id),
    ])
    if ((buyer as any)?.email) {
      sendSweepPaymentConfirmation({
        email: (buyer as any).email, name: (buyer as any).display_name,
        compName: (comp as any)?.name ?? 'your sweep', tribeName: (tribe as any)?.name ?? '',
        tickets: req.tickets_requested, amount: req.amount, paymentMethod: req.payment_method, drawOpen,
      }).catch(() => {})
    }
    await createNotifications({
      user_id: req.user_id,
      type:    'sweep_request_approved',
      title:   `You're in — ${req.tickets_requested} ticket${req.tickets_requested === 1 ? '' : 's'} approved in ${(comp as any)?.name ?? 'your sweep'}`,
      body:    req.auto_draw
        ? (drawOpen ? 'Your horse has been drawn for you — check your pool.' : `Ticket secured — we'll draw your horse when the draw opens ${DRAW_OPENS_LABEL}.`)
        : drawOpen ? 'Spin the wheel to draw your horse.' : `Ticket secured — the draw opens ${DRAW_OPENS_LABEL}. We'll let you know when you can spin.`,
      data:    { href: `/tribe?comp_id=${req.comp_id}`, comp_id: req.comp_id, tribe_id: params.id, request_id: req.id },
    })

    return NextResponse.json({ ok: true, request: updated })
  }

  if (action === 'reject') {
    if (req.status !== 'pending') return NextResponse.json({ error: 'This request is no longer pending' }, { status: 409 })
    const { data: updated, error } = await (admin.from('sweep_payment_requests') as any)
      .update({ status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString(), notes: body?.notes ?? null })
      .eq('id', req.id).select().maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Tell the buyer — rejections used to be silent.
    const [{ data: buyer }, { data: comp }, organiser] = await Promise.all([
      (admin.from('users') as any).select('email, display_name').eq('id', req.user_id).maybeSingle(),
      (admin.from('comps') as any).select('name, owner_name').eq('id', req.comp_id).maybeSingle(),
      getOrganiserDetails(admin, req.comp_id),
    ])
    const compName = (comp as any)?.name ?? 'your sweep'
    if ((buyer as any)?.email) {
      sendSweepRequestRejected({
        email: (buyer as any).email, name: (buyer as any).display_name,
        compName, tickets: req.tickets_requested, paymentMethod: req.payment_method,
        notes: body?.notes ?? null, organiserName: organiser.contact_name ?? (comp as any)?.owner_name ?? null,
      }).catch(() => {})
    }
    await createNotifications({
      user_id: req.user_id,
      type:    'sweep_request_rejected',
      title:   `Your ticket request in ${compName} wasn't approved`,
      body:    body?.notes ? `Note: ${String(body.notes).slice(0, 140)}` : 'Check with your organiser, or send a new request.',
      data:    { href: `/tribe?comp_id=${req.comp_id}`, comp_id: req.comp_id, tribe_id: params.id, request_id: req.id },
    })

    return NextResponse.json({ ok: true, request: updated })
  }

  // mark_paid — settling an outstanding IOU (tickets already granted at approval time).
  if (req.status !== 'approved' || req.paid_at) {
    return NextResponse.json({ error: 'Only an approved, unpaid request can be marked paid' }, { status: 409 })
  }
  const { data: updated, error } = await (admin.from('sweep_payment_requests') as any)
    .update({ paid_at: new Date().toISOString() }).eq('id', req.id).select().maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, request: updated })
}
