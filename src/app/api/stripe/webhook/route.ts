import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2024-04-10' })

export async function POST(request: NextRequest) {
  const body      = await request.text()
  const signature = request.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET ?? '')
  } catch (err: any) {
    console.error('[stripe/webhook] signature verification failed:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session       = event.data.object as Stripe.Checkout.Session
    const tournamentId  = session.metadata?.tournament_id

    // ── Donation (Support TribePicks Payment Link) ──────────────────────────────
    // Premium upgrades always carry tournament_id metadata; donations never do, so
    // the absence of it identifies a donation. Just record it — no entitlement to grant.
    if (!tournamentId) {
      const admin = createAdminClient()
      const { error } = await (admin.from('donations') as any).upsert(
        {
          user_id:               session.client_reference_id || null,  // signed-in donor, else anonymous
          email:                 session.customer_details?.email ?? session.customer_email ?? null,
          amount_cents:          session.amount_total ?? 0,
          currency:              session.currency ?? 'aud',
          stripe_session_id:     session.id,
          stripe_payment_intent: typeof session.payment_intent === 'string' ? session.payment_intent : null,
          dog_slug:              session.metadata?.dog_slug ?? null,   // which doggie was fed (migration 170)
        },
        { onConflict: 'stripe_session_id', ignoreDuplicates: true },  // idempotent across Stripe retries
      )

      if (error) {
        console.error('[stripe/webhook] donation insert failed:', error)
        return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
      }

      console.log(`[stripe/webhook] donation recorded — ${session.amount_total} ${session.currency} (session ${session.id})`)
      return NextResponse.json({ received: true })
    }

    // ── Premium upgrade / ad-free pass ──────────────────────────────────────────
    const userId = session.metadata?.user_id
    const kind   = session.metadata?.kind   // 'ad_free' | undefined (undefined = Pro)

    if (!userId || !tournamentId) {
      console.error('[stripe/webhook] missing metadata', session.metadata)
      return NextResponse.json({ error: 'Missing metadata' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Upsert grants the right entitlement. Upsert only sets the provided columns,
    // so an ad-free purchase never clears is_premium and vice-versa.
    const entitlement = kind === 'ad_free' ? { is_ad_free: true } : { is_premium: true }
    const { error } = await (admin.from('user_tournaments') as any)
      .upsert(
        { user_id: userId, tournament_id: tournamentId, ...entitlement },
        { onConflict: 'user_id,tournament_id' }
      )

    if (error) {
      console.error('[stripe/webhook] upsert failed:', error)
      return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
    }

    console.log(`[stripe/webhook] ${kind === 'ad_free' ? 'ad-free' : 'premium'} granted — user ${userId} tournament ${tournamentId}`)
  }

  return NextResponse.json({ received: true })
}
