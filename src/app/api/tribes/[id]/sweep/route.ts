import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { approvalClockStart, approvalDeadline, getOrganiserDetails, hasContact, hasPaymentDetails } from '@/lib/sweep/organiser'
import { computePoolPrizes, isValidSplit, poolFeeShares } from '@/lib/sweep/prizes'
import { isPracticeSlug } from '@/lib/sweep/practice'
import { DRAW_OPENS_LABEL, loadField, overFieldTicketIds } from '@/lib/sweep/field'

export const dynamic = 'force-dynamic'

// GET /api/tribes/:id/sweep — this pool's sweep state: the shared race field, every
// member's tickets (a member can hold several — see grant-tickets), the caller's own
// unclaimed/claimed tickets, the full member roster (for the admin's grant-tickets UI,
// including members with zero tickets so far), and the 1st/2nd/3rd podium for this pool.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const tribeId = params.id

  const { data: tribe } = await (admin.from('tribes') as any)
    .select('id, comp_id, tournament_id, sweep_locked_at, practice_results').eq('id', tribeId).maybeSingle()
  if (!tribe) return NextResponse.json({ error: 'Tribe not found' }, { status: 404 })

  // Comp admins can view ANY pool under their comp, not just ones they personally joined —
  // the organiser now routinely browses pools they're not a tribe_member of (e.g. an
  // overflow pool via /sweep's "My sweeps" pills or /tribe's pool selector), so gating on
  // membership alone would 403 them out of their own sweep's pools.
  const [{ data: membership }, { data: isAdmin }] = await Promise.all([
    (admin.from('tribe_members') as any).select('user_id').eq('tribe_id', tribeId).eq('user_id', user.id).maybeSingle(),
    (admin.from('comp_admins') as any).select('user_id').eq('comp_id', tribe.comp_id).eq('user_id', user.id).maybeSingle(),
  ])
  if (!membership && !isAdmin) return NextResponse.json({ error: 'Not a member of this tribe' }, { status: 403 })

  const { data: tourn } = await (admin.from('tournaments') as any)
    .select('format, race_start_at, slug').eq('id', tribe.tournament_id).maybeSingle()
  if ((tourn as any)?.format !== 'sweep') {
    return NextResponse.json({ error: 'This tribe is not a sweep' }, { status: 400 })
  }

  const [{ data: comp }, organiser, { data: myPending }] = await Promise.all([
    (admin.from('comps') as any)
      .select('allow_iou, sweep_approval_mode, owner_name, sweep_ticket_price_cents, sweep_prize_split, sweep_deduct_fee').eq('id', tribe.comp_id).maybeSingle(),
    getOrganiserDetails(admin, tribe.comp_id),
    (admin.from('sweep_payment_requests') as any)
      .select('created_at, receipt_attached_at, payment_method').eq('tribe_id', tribeId).eq('user_id', user.id).eq('status', 'pending'),
  ])
  const raceStartAt = (tourn as any)?.race_start_at ?? null
  // The organiser's phone/email is only handed to a buyer who's actually waiting too long —
  // shown upfront, people message the organiser minutes after requesting. Payment details,
  // by contrast, every member needs before they can pay at all. A bank transfer with no
  // receipt yet is waiting on the buyer, so it never counts as overdue.
  const overdue = ((myPending ?? []) as any[]).some(r =>
    !(r.payment_method === 'bank_transfer' && !r.receipt_attached_at) &&
    approvalDeadline(approvalClockStart(r), organiser.approval_window_hours, raceStartAt).getTime() < Date.now())

  const [{ data: horses }, { data: entries }, { data: memberRows }] = await Promise.all([
    (admin.from('sweep_horses') as any)
      .select('id, number, name, scratched, finish_position')
      .eq('tournament_id', tribe.tournament_id).order('number', { ascending: true }),
    (admin.from('sweep_entries') as any)
      .select('id, user_id, horse_id, joined_at').eq('tribe_id', tribeId),
    (admin.from('tribe_members') as any).select('user_id, joined_at').eq('tribe_id', tribeId),
  ])

  const allUserIds = [...new Set([...(memberRows ?? []).map((m: any) => m.user_id), ...(entries ?? []).map((e: any) => e.user_id)])]
  const { data: users } = allUserIds.length
    ? await (admin.from('users') as any).select('id, display_name, avatar_url').in('id', allUserIds)
    : { data: [] }
  const userById  = Object.fromEntries((users ?? []).map((u: any) => [u.id, u]))
  const horseById = Object.fromEntries((horses ?? []).map((h: any) => [h.id, h]))

  // Group tickets per member — each member can hold zero, one, or several.
  const ticketsByUser: Record<string, { id: string; horse: any }[]> = {}
  for (const e of (entries ?? []) as any[]) {
    if (!ticketsByUser[e.user_id]) ticketsByUser[e.user_id] = []
    ticketsByUser[e.user_id].push({ id: e.id, horse: e.horse_id ? horseById[e.horse_id] ?? null : null })
  }

  const roster = (memberRows ?? []).map((m: any) => {
    const tickets = ticketsByUser[m.user_id] ?? []
    return {
      user_id:      m.user_id,
      display_name: userById[m.user_id]?.display_name ?? 'Tipster',
      avatar_url:   userById[m.user_id]?.avatar_url ?? null,
      horses:       tickets.map(t => t.horse).filter(Boolean),
      unclaimed:    tickets.filter(t => !t.horse).length,
      total_tickets: tickets.length,
    }
  })

  const myRoster = roster.find((r: any) => r.user_id === user.id)

  // Podium: for each placegetter horse, which (if any) entrant in THIS pool holds it —
  // and if several of someone's tickets somehow held it, that can't happen (one horse,
  // one ticket, UNIQUE(tribe_id, horse_id)) so a single match is always correct.
  // A practice pool has its own pretend result (tribes.practice_results — the practice field is
  // shared by every practice sweep, so finish_position can't hold it).
  const isPractice = isPracticeSlug((tourn as any)?.slug)
  const practiceIds: string[] = (tribe as any).practice_results ?? []
  const podium = [1, 2, 3].map(place => {
    const horse = isPractice
      ? (horses ?? []).find((h: any) => h.id === practiceIds[place - 1])
      : (horses ?? []).find((h: any) => h.finish_position === place)
    if (!horse) return { place, horse: null, winner: null }
    const winner = roster.find((r: any) => r.horses.some((h: any) => h.id === horse.id)) ?? null
    return { place, horse, winner }
  })

  // One pattern for every sweep: you only ever see your OWN horses; who drew what across the
  // pool is hidden from everyone (organiser included) until the pool closes — every horse
  // drawn, or the pool locked (manually / the 30-min auto-lock), whichever comes first, so a
  // pool that never fills still reveals before the race. The redaction is a stripped object
  // (no number, name or real id), not a flag, so nothing leaks to a caller reading the raw
  // response.
  const [field, { data: pendingRows }] = await Promise.all([
    loadField(admin, tribe.tournament_id),
    (admin.from('sweep_payment_requests') as any).select('tickets_requested').eq('tribe_id', tribeId).eq('status', 'pending'),
  ])
  // Same rule as the request route's oversell guard: granted tickets + pending requests.
  const ticketsLeft = Math.max(0, field.capacity - (entries ?? []).length
    - ((pendingRows ?? []) as any[]).reduce((sum, r) => sum + r.tickets_requested, 0))
  const nonScratched = field.runners
  const claimedCount = (entries ?? []).filter((e: any) => e.horse_id).length
  const drawFull = field.drawOpen && nonScratched > 0 && claimedCount >= nonScratched
  // Short final field: the caller's tickets that can't spin (lib/sweep/field.ts).
  const overField = overFieldTicketIds((entries ?? []) as any[], field)
  const myOverField = ((entries ?? []) as any[]).filter(e => e.user_id === user.id && overField.has(e.id)).length
  const poolClosed = drawFull || !!tribe.sweep_locked_at
  const hideOthers = !poolClosed
  const redact = (h: any) => (h ? { id: `hidden-${Math.random().toString(36).slice(2, 10)}`, hidden: true } : h)
  const redactRow = (r: any) => r.user_id === user.id ? r : { ...r, horses: r.horses.map(redact) }

  const rosterOut = hideOthers ? roster.map(redactRow) : roster
  const podiumOut = hideOthers
    ? podium.map(p => ({ ...p, winner: p.winner ? redactRow(p.winner) : p.winner }))
    : podium

  // Live prize table for THIS pool — tickets sold so far × price, less its share of any
  // TribePicks fee. Null until the organiser sets a ticket price.
  const price = (comp as any)?.sweep_ticket_price_cents ?? null
  const split = isValidSplit((comp as any)?.sweep_prize_split) ? (comp as any).sweep_prize_split : [70, 20, 10]
  const prizes = price
    ? computePoolPrizes({
        ticketPriceCents: price, ticketsSold: (entries ?? []).length, split,
        feeCents: (await poolFeeShares(admin, tribe.comp_id, (comp as any)?.sweep_deduct_fee !== false))[tribeId] ?? 0,
      })
    : null

  return NextResponse.json({
    comp_id:         tribe.comp_id,
    is_practice:     isPractice,
    ticket_price_cents: price,
    prizes,
    field_size:      field.capacity,
    tickets_left:    ticketsLeft,   // 0 → sold out (or fully spoken for by pending requests)
    // Selling before the field is known (migration 201): no spinning, and the placeholder
    // horses stay out of the response entirely.
    draw_open:       field.drawOpen,
    draw_opens_label: DRAW_OPENS_LABEL,
    my_over_field:   myOverField,
    locked:          !!tribe.sweep_locked_at,
    is_comp_admin:   !!isAdmin,
    allow_iou:       !!(comp as any)?.allow_iou,
    approval_mode:   (comp as any)?.sweep_approval_mode ?? 'manual',
    draw_full:       drawFull,
    draw_hidden:     hideOthers,   // true → other members' horses are redacted until the pool closes
    horses:          field.drawOpen ? horses ?? [] : [],
    available:       field.drawOpen ? (horses ?? []).filter((h: any) => !(entries ?? []).some((e: any) => e.horse_id === h.id)) : [],
    roster:          rosterOut,
    my_horses:       myRoster?.horses ?? [],
    my_unclaimed:    Math.max(0, (myRoster?.unclaimed ?? 0) - myOverField),
    podium:          podiumOut,
    // ── Buying: who to pay, where, and how long approval should take ──
    organiser_name:        organiser.contact_name ?? (comp as any)?.owner_name ?? null,
    approval_window_hours: organiser.approval_window_hours,
    race_start_at:         raceStartAt,
    payment_details:       hasPaymentDetails(organiser) ? {
      account_name:   organiser.bank_account_name,
      bsb:            organiser.bank_bsb,
      account_number: organiser.bank_account_number,
      payid:          organiser.payid,
    } : null,
    // Bank transfer with the details given out by the organiser (migration 202). Their
    // contact shows up front then, so a buyer who missed the details can ask for them.
    bank_shared_directly:  !hasPaymentDetails(organiser) && organiser.bank_shared_directly,
    organiser_contact:     (overdue || isAdmin || (!hasPaymentDetails(organiser) && organiser.bank_shared_directly)) && hasContact(organiser)
      ? { phone: organiser.contact_phone, email: organiser.contact_email }
      : null,
  })
}
