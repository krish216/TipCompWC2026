import { createNotifications } from '@/lib/notifications'
import { sendSweepRequestToApprove } from '@/lib/sweep/emails'

// Tells a sweep's organisers a ticket request is ready for them to approve — in-app (the
// bell) and by email, since most organisers aren't sitting in TribePicks when it arrives.
// Called when a cash request comes in, when a bank-transfer receipt is attached (manual
// approval), and when the buyer sends a reminder. An organiser who is the buyer (their own
// ticket, or testing a practice sweep) isn't told about their own request.
export async function alertOrganisers(admin: any, opts: {
  compId: string; tribeId: string; requestId: string; buyerId: string
  tickets: number; amount: number | null; paymentMethod: string
  reminder?: boolean
}): Promise<void> {
  const [{ data: admins }, { data: buyer }, { data: comp }] = await Promise.all([
    (admin.from('comp_admins') as any).select('user_id').eq('comp_id', opts.compId),
    (admin.from('users') as any).select('display_name').eq('id', opts.buyerId).maybeSingle(),
    (admin.from('comps') as any).select('name').eq('id', opts.compId).maybeSingle(),
  ])
  const organiserIds = ((admins ?? []) as any[]).map(a => a.user_id).filter((id: string) => id !== opts.buyerId)
  if (!organiserIds.length) return

  const buyerName = (buyer as any)?.display_name ?? 'Someone'
  const compName = (comp as any)?.name ?? 'your sweep'
  const tickets = `${opts.tickets} ticket${opts.tickets === 1 ? '' : 's'}`
  const transfer = opts.paymentMethod === 'bank_transfer'

  await createNotifications(organiserIds.map((user_id: string) => ({
    user_id,
    type: opts.reminder ? 'sweep_payment_reminder' as const : 'sweep_payment_request' as const,
    title: opts.reminder
      ? `${buyerName} is still waiting on ${tickets} in ${compName}`
      : `${buyerName} wants ${tickets} in ${compName}`,
    body: transfer ? 'Receipt attached — check the money has landed, then approve.' : 'Paying cash — approve once you\'ve got it in hand.',
    data: { href: `/sweep?approve=${opts.compId}`, comp_id: opts.compId, tribe_id: opts.tribeId, request_id: opts.requestId },
  })))

  const { data: users } = await (admin.from('users') as any).select('email, display_name').in('id', organiserIds)
  await Promise.all(((users ?? []) as any[]).filter(u => u.email).map(u => sendSweepRequestToApprove({
    email: u.email, name: u.display_name, compId: opts.compId, compName, buyerName,
    tickets: opts.tickets, amount: opts.amount, paymentMethod: opts.paymentMethod, reminder: opts.reminder,
  })))
}
