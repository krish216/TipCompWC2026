import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { receiptPath, SWEEP_RECEIPTS_BUCKET } from '@/lib/sweep/storage'
import { grantTickets } from '@/lib/sweep/tickets'
import { sendSweepPaymentConfirmation } from '@/lib/sweep/emails'
import { loadField } from '@/lib/sweep/field'
import { autoDrawIfRequested } from '@/lib/sweep/draw'

export const dynamic = 'force-dynamic'

// POST /api/tribes/:id/sweep/requests/:reqId/receipt (multipart: file) — the buyer attaches
// their bank-transfer receipt. In auto-approve mode this is the literal "the instant the
// receipt is attached" moment: the request is approved and tickets granted right here, no
// organiser click needed. In manual mode it just attaches the receipt and leaves the
// request pending for the organiser to review.
export async function POST(request: NextRequest, { params }: { params: { id: string; reqId: string } }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: req } = await (admin.from('sweep_payment_requests') as any)
    .select('*').eq('id', params.reqId).eq('tribe_id', params.id).maybeSingle()
  if (!req) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (req.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (req.status !== 'pending') return NextResponse.json({ error: 'This request is no longer pending' }, { status: 409 })
  if (req.payment_method !== 'bank_transfer') return NextResponse.json({ error: 'Receipts only apply to bank-transfer requests' }, { status: 400 })

  const form = await request.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'Receipt image must be under 5 MB' }, { status: 400 })

  const ext = (file.name.split('.').pop() || file.type.split('/').pop() || 'jpg')
  const path = receiptPath(user.id, req.id, ext)
  const buf = new Uint8Array(await file.arrayBuffer())

  const { error: upErr } = await admin.storage.from(SWEEP_RECEIPTS_BUCKET)
    .upload(path, buf, { upsert: true, contentType: file.type || undefined })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: tribe } = await (admin.from('tribes') as any)
    .select('name, tournament_id, comp_id').eq('id', params.id).maybeSingle()
  const { data: comp } = await (admin.from('comps') as any)
    .select('name, sweep_approval_mode').eq('id', req.comp_id).maybeSingle()

  const autoApprove = (comp as any)?.sweep_approval_mode === 'auto'
  // receipt_attached_at starts the organiser's approval window (migration 195) — a transfer
  // can't be reviewed before there's a receipt to review.
  const update: Record<string, any> = { receipt_url: path, receipt_attached_at: new Date().toISOString() }
  if (autoApprove) {
    const granted = await grantTickets(admin, {
      tribeId: params.id, tournamentId: (tribe as any).tournament_id, userId: user.id, count: req.tickets_requested,
      requestId: req.id,
    })
    if (!granted.ok) {
      // Receipt is still saved even if the field's full by now — leave pending for the
      // organiser to sort out manually rather than silently dropping the attempt.
      await (admin.from('sweep_payment_requests') as any).update(update).eq('id', req.id)
      return NextResponse.json({ error: granted.error, receipt_attached: true }, { status: 400 })
    }
    update.status = 'approved'
    update.reviewed_at = new Date().toISOString()
    update.paid_at = new Date().toISOString()
  }

  const { data: updated, error } = await (admin.from('sweep_payment_requests') as any)
    .update(update).eq('id', req.id).select().maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (autoApprove) {
    // Buyer asked for their horse to be drawn for them (migration 203).
    await autoDrawIfRequested(admin, { tribeId: params.id, tournamentId: (tribe as any).tournament_id, userId: user.id, autoDraw: req.auto_draw })
    const { data: buyer } = await (admin.from('users') as any).select('email, display_name').eq('id', user.id).maybeSingle()
    if ((buyer as any)?.email) {
      sendSweepPaymentConfirmation({
        email: (buyer as any).email, name: (buyer as any).display_name,
        compName: (comp as any)?.name ?? 'your sweep', tribeName: (tribe as any)?.name ?? '',
        tickets: req.tickets_requested, amount: req.amount, paymentMethod: 'bank_transfer',
        drawOpen: (await loadField(admin, (tribe as any).tournament_id)).drawOpen,
      }).catch(() => {})
    }
  }

  return NextResponse.json({ ok: true, request: updated })
}
