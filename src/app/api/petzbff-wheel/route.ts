import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// POST /api/petzbff-wheel
//
// One spin of the PetzBFF trade-show prize wheel (see migration 183). The server owns the
// inventory and decides the prize atomically via the petzbff_wheel_spin() function — the
// client wheel just animates to whatever comes back. Every real spin also captures the lead.
//
// Same loud-failure stance as the quiz: if the allocation fails, the caller gets a non-200
// and the UI says so, rather than pretending someone won a prize we can't account for.

// PetzBFF's own verified sender. Deliberately NOT the shared RESEND_FROM (that's the
// TribePicks address) — see api/petzbff-promo/route.ts for the full reasoning.
const FROM = process.env.PETZBFF_RESEND_FROM ?? 'PetzBFF <paws@petzbff.com.au>'

const Body = z.object({
  email:     z.string().trim().toLowerCase().email().max(254),
  consent:   z.boolean(),
  sessionId: z.string().trim().min(8).max(64),
  source:    z.string().trim().max(60).optional(),
})

// Best-effort throttle, per the same rationale as the quiz route: stops one hammering tab,
// not a distributed abuser — which is all a booth wheel needs.
const seen = new Map<string, number[]>()
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 12
function throttled(key: string): boolean {
  const now = Date.now()
  const hits = (seen.get(key) ?? []).filter(t => now - t < WINDOW_MS)
  hits.push(now)
  seen.set(key, hits)
  if (seen.size > 5000) seen.clear()
  return hits.length > MAX_PER_WINDOW
}

interface SpinRow {
  spin_id: string
  prize_id: string
  prize_label: string
  value_cents: number
  already: boolean
}

export async function POST(request: NextRequest) {
  let parsed
  try {
    parsed = Body.parse(await request.json())
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 })
  }
  const { email, consent, sessionId, source } = parsed

  if (!consent) {
    return NextResponse.json({ ok: false, error: 'consent_required' }, { status: 400 })
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (throttled(ip)) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
  }

  const admin = createAdminClient()

  // Gate: the wheel is open only when an admin has set a window and flipped it active.
  const { data: cfg } = await (admin.from('petzbff_wheel_config') as any)
    .select('active, show_starts_at, show_ends_at').eq('id', true).maybeSingle()
  if (!cfg?.active) {
    return NextResponse.json({ ok: false, error: 'closed' }, { status: 200 })
  }

  // Allocate. This is the point of the route — if it fails, say so, never fake a win.
  let row: SpinRow
  try {
    const { data, error } = await (admin.rpc as any)('petzbff_wheel_spin', {
      p_email: email,
      p_consent: consent,
      p_session: sessionId,
      p_source: source ?? null,
      p_user_agent: request.headers.get('user-agent')?.slice(0, 500) ?? null,
    })
    if (error) throw error
    row = (Array.isArray(data) ? data[0] : data) as SpinRow
    if (!row?.prize_id) throw new Error('empty allocation')
  } catch (err) {
    console.error('[petzbff-wheel] spin failed', err)
    return NextResponse.json({ ok: false, error: 'spin_failed' }, { status: 500 })
  }

  const prize = { id: row.prize_id, label: row.prize_label, valueCents: row.value_cents }

  // Email a confirmation the first time only (never re-mail a repeat open). Secondary to the
  // allocation: a mail failure must not fail the request — the prize is already on screen.
  let emailed = false
  if (!row.already && prize.id !== 'none') {
    try {
      if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not set')
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from:     FROM,
        to:       email,
        reply_to: 'paws@petzbff.com.au',
        subject:  `You won a ${prize.label} at the PetzBFF stand!`,
        html:     wonEmailHtml(prize.label),
      })
      emailed = true
      await (admin.from('petzbff_wheel_spins') as any)
        .update({ emailed_at: new Date().toISOString() }).eq('id', row.spin_id)
    } catch (err) {
      console.error('[petzbff-wheel] email failed', err)   // lead + prize are safe
    }
  }

  return NextResponse.json({ ok: true, prize, already: row.already, emailed })
}

function wonEmailHtml(prizeLabel: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#fdf8f2;font-family:Cabin,Helvetica,Arial,sans-serif;color:#121212">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid rgba(18,18,18,.12);border-radius:14px;padding:28px 24px">
    <p style="margin:0 0 6px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#e08151;font-weight:700">PetzBFF</p>
    <h1 style="margin:0 0 10px;font-size:26px;line-height:1.2">You won!</h1>
    <p style="margin:0 0 18px;font-size:16px;line-height:1.5">Your prize from the PetzBFF wheel:</p>
    <div style="text-align:center;margin:0 0 20px">
      <div style="display:inline-block;font-size:22px;font-weight:700;padding:14px 22px;border:2px dashed #e08151;border-radius:12px">${prizeLabel}</div>
    </div>
    <p style="margin:0 0 6px;font-size:15px;line-height:1.5"><strong>Show this email (or your winning screen) at the PetzBFF stand to collect it.</strong></p>
    <p style="margin:14px 0 0;font-size:12px;color:#777;line-height:1.5">You're getting this because you played the wheel at our stand and asked us to email your result.</p>
  </div>
</body></html>`
}
