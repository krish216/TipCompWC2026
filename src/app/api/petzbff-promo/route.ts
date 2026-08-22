import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// POST /api/petzbff-promo
//
// Lead + result capture for the PetzBFF Dog Lovers Show Quiz (see migration 182).
// This exists because Shopify's storefront cannot do it: Shopify attaches its captcha
// token only to forms rendered by Liquid's own customer-form tag, so a custom form in a
// page or section is rejected with "Missing CAPTCHA token" and the lead is lost.
//
// Two calls per play:
//   stage 'start'  — the email gate, before question 1. This is the lead.
//   stage 'finish' — the run ended. Carries score/outcome/discount, and emails the code.
//
// Deliberately loud: if the insert fails the caller gets a non-200 and the UI says so.
// The whole reason this route exists is that a silent capture failure cost a day of
// trade-show leads.

// PetzBFF's own address. petzbff.com.au is a VERIFIED sending domain in Resend, so this
// sends as PetzBFF, not TribePicks.
//
// Deliberately NOT the shared RESEND_FROM env var: that one is set to the TribePicks address
// (no-reply@mail.tribepicks.com) for TribePicks' own transactional mail, and PetzBFF must
// never inherit it — a dog-store discount email from a football-tipping domain is a brand and
// deliverability smell. Override only via the PetzBFF-specific PETZBFF_RESEND_FROM if ever needed.
const FROM = process.env.PETZBFF_RESEND_FROM ?? 'PetzBFF <paws@petzbff.com.au>'

// The Shopify discount codes. Must match the codes in the quiz UI and in Shopify admin.
const CODES: Record<number, string> = {
  3: 'PETZBFF3', 6: 'PETZBFF6', 9: 'PETZBFF9', 12: 'PETZBFF12', 15: 'PETZBFF15',
  18: 'Maisey18', 21: 'Bear21', 24: 'Waffles24', 27: 'Murph27', 30: 'QNeve30',
}

// Soft cap: how many completed plays one email gets. Blunts casual replay-farming and keeps
// the lead list clean. NOT a hard control — it keys on email, which a determined user can
// change; the real cost bound is a usageLimit on the high-value Shopify codes.
const PLAY_LIMIT = 3

const Body = z.object({
  email:     z.string().trim().toLowerCase().email().max(254),
  consent:   z.boolean(),
  stage:     z.enum(['start', 'finish']),
  sessionId: z.string().trim().min(8).max(64),
  score:     z.number().int().min(0).max(10).optional(),
  outcome:   z.enum(['banked', 'busted', 'perfect']).optional(),
  pct:       z.number().int().min(3).max(30).optional(),
  source:    z.string().trim().max(60).optional(),
  quiz:      z.enum(['dog', 'cat']).default('dog'),   // which quiz — labels the lead + scopes the cap
})

// Best-effort throttle. Serverless instances are not shared, so this stops a hammering
// tab rather than a distributed abuser - which is all it needs to do for a promo quiz.
const seen = new Map<string, number[]>()
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 12

function throttled(key: string): boolean {
  const now = Date.now()
  const hits = (seen.get(key) ?? []).filter(t => now - t < WINDOW_MS)
  hits.push(now)
  seen.set(key, hits)
  if (seen.size > 5000) seen.clear()   // crude bound; this is not a real rate limiter
  return hits.length > MAX_PER_WINDOW
}

export async function POST(request: NextRequest) {
  let parsed
  try {
    parsed = Body.parse(await request.json())
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 })
  }

  const { email, consent, stage, sessionId, score, outcome, pct, source, quiz } = parsed

  if (!consent) {
    return NextResponse.json({ ok: false, error: 'consent_required' }, { status: 400 })
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (throttled(ip)) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
  }

  // Soft anti-farming cap, enforced at the gate ('start') so a blocked player never begins a
  // 4th run. Counts 'finish' rows (completed plays) for this email, so abandoning a run
  // mid-quiz doesn't burn a go. On a block we hand back their best prior code so the message
  // can resurface value instead of dead-ending. Fails OPEN: a read error lets them play
  // rather than lose a real lead.
  if (stage === 'start') {
    try {
      const admin = createAdminClient()
      const { data: prior } = await (admin.from('petzbff_promo') as any)
        .select('discount_pct, code')
        .eq('email', email).eq('stage', 'finish').eq('quiz', quiz)
        .order('discount_pct', { ascending: false })
      const plays = ((prior ?? []) as any[]).length
      if (plays >= PLAY_LIMIT) {
        const best = ((prior ?? []) as any[])[0]
        return NextResponse.json({
          ok: false, error: 'play_limit', plays,
          bestCode: best?.code ?? null, bestPct: best?.discount_pct ?? null,
        }, { status: 200 })
      }
    } catch (err) {
      console.error('[petzbff-promo] play-limit check failed', err)
    }
  }

  const code = typeof pct === 'number' ? CODES[pct] : null
  if (stage === 'finish' && !code) {
    return NextResponse.json({ ok: false, error: 'unknown_discount' }, { status: 400 })
  }

  // The insert is the point of this route. If it fails, say so - never swallow it.
  let rowId: string | null = null
  try {
    const admin = createAdminClient()
    const { data, error } = await (admin.from('petzbff_promo') as any)
      .insert({
        email,
        consent,
        stage,
        quiz,
        score:        score  ?? null,
        outcome:      outcome ?? null,
        discount_pct: pct    ?? null,
        code,
        session_id:   sessionId,
        source:       source ?? null,
        user_agent:   request.headers.get('user-agent')?.slice(0, 500) ?? null,
      })
      .select('id')
      .single()
    if (error) throw error
    rowId = data?.id ?? null
  } catch (err) {
    console.error('[petzbff-promo] insert failed', err)
    return NextResponse.json({ ok: false, error: 'store_failed' }, { status: 500 })
  }

  // Email the code. Secondary to the insert: a mail failure must not lose the lead, so
  // it is reported separately rather than failing the request.
  let emailed = false
  if (stage === 'finish' && code) {
    try {
      if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not set')
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from:     FROM,
        to:       email,
        reply_to: 'paws@petzbff.com.au',   // replies reach PetzBFF even during the interim from-address
        subject:  `Your PetzBFF discount code: ${pct}% off`,
        html:     codeEmailHtml(code, pct!, score ?? 0, outcome ?? 'busted'),
      })
      emailed = true
      const admin = createAdminClient()
      await (admin.from('petzbff_promo') as any)
        .update({ emailed_at: new Date().toISOString() })
        .eq('id', rowId)
    } catch (err) {
      console.error('[petzbff-promo] email failed', err)   // lead is safe; code is on screen
    }
  }

  return NextResponse.json({ ok: true, code, emailed })
}

function codeEmailHtml(code: string, pct: number, score: number, outcome: string): string {
  const headline = outcome === 'perfect'
    ? 'Ten from ten. Show off.'
    : outcome === 'banked'
      ? `You banked ${pct}%.`
      : `You walked away with ${pct}%.`

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#fdf8f2;font-family:Cabin,Helvetica,Arial,sans-serif;color:#121212">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid rgba(18,18,18,.12);border-radius:14px;padding:28px 24px">
    <p style="margin:0 0 6px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#e08151;font-weight:700">PetzBFF</p>
    <h1 style="margin:0 0 10px;font-size:26px;line-height:1.2">${headline}</h1>
    <p style="margin:0 0 20px;font-size:16px;line-height:1.5">You scored ${score} out of 10 in the Dog Lovers Show Quiz. Here is your code.</p>
    <div style="text-align:center;margin:0 0 20px">
      <div style="display:inline-block;font-family:ui-monospace,Menlo,monospace;font-size:26px;font-weight:700;letter-spacing:.08em;padding:14px 22px;border:2px dashed #e08151;border-radius:12px">${code}</div>
      <p style="margin:10px 0 0;font-size:14px;color:#555">${pct}% off anything in the store</p>
    </div>
    <p style="text-align:center;margin:0 0 20px">
      <a href="https://petzbff.com.au/collections/all" style="display:inline-block;background:#e08151;color:#fff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:10px">Spend it on something good</a>
    </p>
    <p style="margin:0;font-size:12px;color:#777;line-height:1.5">Enter the code at checkout. One use per customer. You are getting this because you asked us to send your code when you played the quiz.</p>
  </div>
</body></html>`
}
