import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { grantTickets } from '@/lib/sweep/tickets'
import { sendSweepPaymentConfirmation } from '@/lib/sweep/emails'
import { createNotifications } from '@/lib/notifications'
import { DRAW_OPENS_LABEL, loadField } from '@/lib/sweep/field'

export const dynamic = 'force-dynamic'

const PAYMENT_METHODS = ['cash', 'bank_transfer', 'iou']

// POST /api/tribes/:id/sweep/buy-on-behalf — comp-admin only. The organiser buys tickets for
// pool members who paid them in person (or owe them). Each purchase is recorded exactly like
// an approved ticket request — method and amount from the ticket price — so it shows in the
// pool's paid/owed column and sweep-admin's Requests, and the buyer gets the usual email.
// IOU: tickets now, paid_at left null (owed) — the organiser can extend credit even when
// buyers can't choose IOU themselves. TribePicks never touches the money.
// Body: { purchases: [{ user_id, tickets, payment_method }] }
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const purchases = (Array.isArray(body?.purchases) ? body.purchases : []) as { user_id: string; tickets: number; payment_method: string }[]
  if (!purchases.length || purchases.some(p =>
    typeof p?.user_id !== 'string' || !Number.isInteger(p.tickets) || p.tickets < 1 || !PAYMENT_METHODS.includes(p.payment_method))) {
    return NextResponse.json({ error: 'Each purchase needs a member, a whole number of tickets and a payment method.' }, { status: 400 })
  }
  if (new Set(purchases.map(p => p.user_id)).size !== purchases.length) {
    return NextResponse.json({ error: 'Each member can only appear once.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const tribeId = params.id

  const { data: tribe } = await (admin.from('tribes') as any)
    .select('id, name, comp_id, tournament_id').eq('id', tribeId).maybeSingle()
  if (!tribe) return NextResponse.json({ error: 'Pool not found' }, { status: 404 })

  const [{ data: isAdmin }, { data: tourn }, { data: members }, { data: comp }] = await Promise.all([
    (admin.from('comp_admins') as any).select('user_id').eq('comp_id', tribe.comp_id).eq('user_id', user.id).maybeSingle(),
    (admin.from('tournaments') as any).select('format').eq('id', tribe.tournament_id).maybeSingle(),
    (admin.from('tribe_members') as any).select('user_id').eq('tribe_id', tribeId).in('user_id', purchases.map(p => p.user_id)),
    (admin.from('comps') as any).select('name, sweep_ticket_price_cents').eq('id', tribe.comp_id).maybeSingle(),
  ])
  if (!isAdmin) return NextResponse.json({ error: 'Only an organiser can buy tickets for others' }, { status: 403 })
  if ((tourn as any)?.format !== 'sweep') return NextResponse.json({ error: 'This pool is not a sweep' }, { status: 400 })
  if (((members ?? []) as any[]).length !== purchases.length) {
    return NextResponse.json({ error: 'Everyone you buy for must be a member of this pool.' }, { status: 400 })
  }

  // Up-front oversell check across the whole basket, so it's all-or-nothing in the normal
  // case; grantTickets re-checks each one authoritatively as it inserts.
  const [field, { count: ticketCount }, { data: pendingRows }] = await Promise.all([
    loadField(admin, tribe.tournament_id),
    (admin.from('sweep_entries') as any).select('id', { count: 'exact', head: true }).eq('tribe_id', tribeId),
    (admin.from('sweep_payment_requests') as any).select('tickets_requested').eq('tribe_id', tribeId).eq('status', 'pending'),
  ])
  const left = Math.max(0, field.capacity - (ticketCount ?? 0)
    - ((pendingRows ?? []) as any[]).reduce((sum, r) => sum + r.tickets_requested, 0))
  const total = purchases.reduce((sum, p) => sum + p.tickets, 0)
  if (total > left) {
    return NextResponse.json({ error: `Only ${left} ticket${left === 1 ? '' : 's'} left in this pool — you've picked ${total}.` }, { status: 400 })
  }

  const priceCents = (comp as any)?.sweep_ticket_price_cents ?? null
  const compName = (comp as any)?.name ?? 'your sweep'
  const { data: buyers } = await (admin.from('users') as any)
    .select('id, email, display_name').in('id', purchases.map(p => p.user_id))
  const buyerById = Object.fromEntries(((buyers ?? []) as any[]).map(b => [b.id, b]))

  const bought: string[] = []
  const failed: { user_id: string; error: string }[] = []
  for (const p of purchases) {
    const granted = await grantTickets(admin, { tribeId, tournamentId: tribe.tournament_id, userId: p.user_id, count: p.tickets })
    if (!granted.ok) { failed.push({ user_id: p.user_id, error: granted.error }); continue }

    const now = new Date().toISOString()
    const amount = priceCents ? (priceCents * p.tickets) / 100 : null
    const { error } = await (admin.from('sweep_payment_requests') as any).insert({
      tribe_id: tribeId, comp_id: tribe.comp_id, user_id: p.user_id,
      tickets_requested: p.tickets, payment_method: p.payment_method, amount,
      status: 'approved', reviewed_by: user.id, reviewed_at: now,
      paid_at: p.payment_method === 'iou' ? null : now,
      notes: 'Bought by the organiser on their behalf',
    })
    // The tickets are granted either way; a missing record only loses the money line.
    if (error) console.error('[sweep/buy-on-behalf] request record failed:', error.message)
    bought.push(p.user_id)

    const buyer = buyerById[p.user_id]
    if (buyer?.email && p.payment_method !== 'iou') {
      sendSweepPaymentConfirmation({
        email: buyer.email, name: buyer.display_name, compName, tribeName: tribe.name ?? '',
        tickets: p.tickets, amount, paymentMethod: p.payment_method, drawOpen: field.drawOpen,
      }).catch(() => {})
    }
    await createNotifications({
      user_id: p.user_id,
      type:    'sweep_request_approved',
      title:   `You're in — your organiser added ${p.tickets} ticket${p.tickets === 1 ? '' : 's'} in ${compName}`,
      body:    field.drawOpen ? 'Spin the wheel to draw your horse.' : `The draw opens ${DRAW_OPENS_LABEL}. We'll let you know when you can spin.`,
      data:    { href: `/tribe?comp_id=${tribe.comp_id}`, comp_id: tribe.comp_id, tribe_id: tribeId },
    })
  }

  if (!bought.length) return NextResponse.json({ error: failed[0]?.error ?? 'Nothing was bought.' }, { status: 400 })
  return NextResponse.json({ ok: true, bought: bought.length, failed })
}
