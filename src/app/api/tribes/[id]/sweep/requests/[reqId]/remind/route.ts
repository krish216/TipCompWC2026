import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { alertOrganisers } from '@/lib/sweep/request-alerts'
import { approvalClockStart, approvalDeadline, getOrganiserDetails } from '@/lib/sweep/organiser'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// POST /api/tribes/:id/sweep/requests/:reqId/remind — the buyer nudges the organiser about
// a request that's gone past its approval window. Buyer-only, pending-only, overdue-only,
// and at most once per approval window (sweep_payment_requests.last_reminded_at), so it's
// a nudge rather than a way to spam the organiser's bell.
export async function POST(_req: NextRequest, { params }: { params: { id: string; reqId: string } }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: req } = await (admin.from('sweep_payment_requests') as any)
    .select('id, comp_id, tribe_id, user_id, status, tickets_requested, payment_method, amount, created_at, receipt_attached_at, last_reminded_at')
    .eq('id', params.reqId).eq('tribe_id', params.id).maybeSingle()
  if (!req) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (req.user_id !== user.id) return NextResponse.json({ error: 'Only the buyer can send a reminder' }, { status: 403 })
  if (req.status !== 'pending') return NextResponse.json({ error: 'This request is no longer pending' }, { status: 409 })
  if (req.payment_method === 'bank_transfer' && !req.receipt_attached_at) {
    return NextResponse.json({ error: 'Attach your transfer receipt first — your organiser can\'t approve it without one.' }, { status: 409 })
  }

  const [organiser, { data: tribe }] = await Promise.all([
    getOrganiserDetails(admin, req.comp_id),
    (admin.from('tribes') as any).select('tournament_id').eq('id', params.id).maybeSingle(),
  ])
  const { data: tourn } = await (admin.from('tournaments') as any)
    .select('race_start_at').eq('id', (tribe as any)?.tournament_id).maybeSingle()

  const now = Date.now()
  if (approvalDeadline(approvalClockStart(req), organiser.approval_window_hours, (tourn as any)?.race_start_at ?? null).getTime() > now) {
    return NextResponse.json({ error: "It's still within the approval window — give your organiser a little longer." }, { status: 409 })
  }
  const windowMs = organiser.approval_window_hours * 60 * 60 * 1000
  if (req.last_reminded_at && new Date(req.last_reminded_at).getTime() + windowMs > now) {
    return NextResponse.json({ error: 'Reminder already sent — your organiser has been nudged.' }, { status: 429 })
  }

  const { error } = await (admin.from('sweep_payment_requests') as any)
    .update({ last_reminded_at: new Date(now).toISOString() }).eq('id', req.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await alertOrganisers(admin, {
    compId: req.comp_id, tribeId: params.id, requestId: req.id, buyerId: user.id,
    tickets: req.tickets_requested, amount: req.amount ?? null, paymentMethod: req.payment_method, reminder: true,
  })

  return NextResponse.json({ ok: true, reminded_at: new Date(now).toISOString() })
}
