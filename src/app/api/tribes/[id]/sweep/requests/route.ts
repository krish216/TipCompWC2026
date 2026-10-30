import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { grantTickets } from '@/lib/sweep/tickets'
import { loadField } from '@/lib/sweep/field'
import { autoDrawIfRequested } from '@/lib/sweep/draw'
import { createNotifications } from '@/lib/notifications'
import { signReceiptUrls } from '@/lib/sweep/receipts'
import { bankTransferEnabled, getOrganiserDetails } from '@/lib/sweep/organiser'

export const dynamic = 'force-dynamic'

const PAYMENT_METHODS = ['cash', 'bank_transfer', 'iou']

// POST /api/tribes/:id/sweep/requests — a buyer asks for N tickets in this pool. Unlike
// buy-on-behalf (the organiser buys for someone who paid them in person),
// this is the self-serve path: the request starts `pending` and only becomes real tickets
// once confirmed — immediately for `iou` (if the comp allows it) and `bank_transfer` in
// auto-approve mode, or via the organiser's explicit approve for everything else.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const ticketsRequested = Number(body?.tickets_requested)
  const paymentMethod = body?.payment_method
  if (!Number.isInteger(ticketsRequested) || ticketsRequested < 1) {
    return NextResponse.json({ error: 'tickets_requested must be a positive integer' }, { status: 400 })
  }
  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    return NextResponse.json({ error: `payment_method must be one of: ${PAYMENT_METHODS.join(', ')}` }, { status: 400 })
  }

  const admin = createAdminClient()
  const tribeId = params.id

  const { data: tribe } = await (admin.from('tribes') as any)
    .select('id, comp_id, tournament_id, sweep_locked_at').eq('id', tribeId).maybeSingle()
  if (!tribe) return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
  if (tribe.sweep_locked_at) return NextResponse.json({ error: 'This pool is locked — no more ticket requests.' }, { status: 409 })

  // An organiser can open any pool in their sweep without being in it. Buying a ticket there
  // is joining it — no separate "join" step; anyone else must already be a member.
  const { data: membership } = await (admin.from('tribe_members') as any)
    .select('user_id').eq('tribe_id', tribeId).eq('user_id', user.id).maybeSingle()
  if (!membership) {
    const { data: isOrganiser } = await (admin.from('comp_admins') as any)
      .select('user_id').eq('comp_id', tribe.comp_id).eq('user_id', user.id).maybeSingle()
    if (!isOrganiser) return NextResponse.json({ error: "You're not in this pool." }, { status: 403 })
    await (admin.from('tribe_members') as any)
      .upsert({ user_id: user.id, tribe_id: tribeId }, { onConflict: 'user_id,tribe_id', ignoreDuplicates: true })
  }

  const { data: tourn } = await (admin.from('tournaments') as any)
    .select('format').eq('id', tribe.tournament_id).maybeSingle()
  if ((tourn as any)?.format !== 'sweep') {
    return NextResponse.json({ error: 'This pool is not a sweep' }, { status: 400 })
  }

  const { data: comp } = await (admin.from('comps') as any)
    .select('name, allow_iou, sweep_approval_mode, sweep_ticket_price_cents').eq('id', tribe.comp_id).maybeSingle()
  if (paymentMethod === 'iou' && !(comp as any)?.allow_iou) {
    return NextResponse.json({ error: 'IOU is not enabled for this sweep' }, { status: 403 })
  }
  // No bank details on file (and none shared directly) → the buyer can't know where to pay.
  if (paymentMethod === 'bank_transfer' && !bankTransferEnabled(await getOrganiserDetails(admin, tribe.comp_id))) {
    return NextResponse.json({ error: "Your organiser hasn't added bank details yet — pay by cash, or check back later." }, { status: 409 })
  }

  // Oversell guard: granted tickets so far + other pending requests' tickets + this one
  // can't exceed the pool's capacity (lib/sweep/field.ts). grantTickets() re-checks this
  // authoritatively at the moment tickets actually get inserted — this is just an early,
  // friendlier rejection.
  const [{ capacity: horseCount }, { count: ticketCount }, { data: pendingRows }] = await Promise.all([
    loadField(admin, tribe.tournament_id),
    (admin.from('sweep_entries') as any).select('id', { count: 'exact', head: true }).eq('tribe_id', tribeId),
    (admin.from('sweep_payment_requests') as any).select('tickets_requested').eq('tribe_id', tribeId).eq('status', 'pending'),
  ])
  const reserved = (ticketCount ?? 0) + ((pendingRows ?? []) as any[]).reduce((sum, r) => sum + r.tickets_requested, 0)
  if (reserved + ticketsRequested > (horseCount ?? 0)) {
    return NextResponse.json({
      error: `Only ${Math.max(0, (horseCount ?? 0) - reserved)} ticket(s) left in this pool's field.`,
    }, { status: 400 })
  }

  // What the buyer owes, from the organiser's ticket price — never trusted from the client.
  // Null for a legacy sweep with no price set.
  const priceCents = (comp as any)?.sweep_ticket_price_cents ?? null
  const amount = priceCents ? (priceCents * ticketsRequested) / 100 : null

  // "Draw my horse for me" (migration 203) — only sent when ticked, so requests still save
  // if the column isn't there yet.
  const autoDraw = body?.auto_draw === true
  const baseRow = {
    tribe_id: tribeId, comp_id: tribe.comp_id, user_id: user.id,
    tickets_requested: ticketsRequested, payment_method: paymentMethod, amount,
    ...(autoDraw ? { auto_draw: true } : {}),
  }

  if (paymentMethod === 'iou') {
    const granted = await grantTickets(admin, { tribeId, tournamentId: tribe.tournament_id, userId: user.id, count: ticketsRequested })
    if (!granted.ok) return NextResponse.json({ error: granted.error }, { status: 400 })
    const { data: inserted, error } = await (admin.from('sweep_payment_requests') as any)
      .insert({ ...baseRow, status: 'approved', reviewed_at: new Date().toISOString(), paid_at: null })
      .select().maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await autoDrawIfRequested(admin, { tribeId, tournamentId: tribe.tournament_id, userId: user.id, autoDraw })
    return NextResponse.json({ ok: true, request: inserted })
  }

  // cash / bank_transfer both start pending — cash waits for the organiser to tick it off
  // in person, bank_transfer waits for a receipt (and then manual or auto approval).
  const { data: inserted, error } = await (admin.from('sweep_payment_requests') as any)
    .insert({ ...baseRow, status: 'pending' })
    .select().maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: admins } = await (admin.from('comp_admins') as any).select('user_id').eq('comp_id', tribe.comp_id)
  const { data: buyer } = await (admin.from('users') as any).select('display_name').eq('id', user.id).maybeSingle()
  await createNotifications(((admins ?? []) as any[]).map(a => ({
    user_id: a.user_id,
    type: 'sweep_payment_request' as const,
    title: `${(buyer as any)?.display_name ?? 'Someone'} wants ${ticketsRequested} ticket(s) in ${(comp as any)?.name ?? 'your sweep'}`,
    body: paymentMethod === 'cash' ? 'Paying cash — approve once you\'ve got it in hand.' : 'Paid by bank transfer — review their receipt.',
    data: { href: '/sweep-admin?tab=requests', comp_id: tribe.comp_id, tribe_id: tribeId, request_id: (inserted as any).id },
  })))

  return NextResponse.json({ ok: true, request: inserted })
}

// GET /api/tribes/:id/sweep/requests — comp-admin: every request for this pool (the review
// queue). Member: only their own requests ("my orders").
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const tribeId = params.id

  const { data: tribe } = await (admin.from('tribes') as any).select('id, comp_id').eq('id', tribeId).maybeSingle()
  if (!tribe) return NextResponse.json({ error: 'Pool not found' }, { status: 404 })

  // Organisers see every pool's queue in their sweep, whether or not they're in that pool.
  const [{ data: membership }, { data: isAdmin }] = await Promise.all([
    (admin.from('tribe_members') as any).select('user_id').eq('tribe_id', tribeId).eq('user_id', user.id).maybeSingle(),
    (admin.from('comp_admins') as any).select('user_id').eq('comp_id', tribe.comp_id).eq('user_id', user.id).maybeSingle(),
  ])
  if (!membership && !isAdmin) return NextResponse.json({ error: "You're not in this pool." }, { status: 403 })

  let query = (admin.from('sweep_payment_requests') as any).select('*').eq('tribe_id', tribeId).order('created_at', { ascending: false })
  if (!isAdmin) query = query.eq('user_id', user.id)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: await signReceiptUrls(admin, data ?? []), is_comp_admin: !!isAdmin })
}
