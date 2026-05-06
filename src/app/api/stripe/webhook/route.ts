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
    const userId        = session.metadata?.user_id
    const tournamentId  = session.metadata?.tournament_id

    if (!userId || !tournamentId) {
      console.error('[stripe/webhook] missing metadata', session.metadata)
      return NextResponse.json({ error: 'Missing metadata' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Upsert the user_tournaments row and mark as premium
    const { error } = await (admin.from('user_tournaments') as any)
      .upsert(
        { user_id: userId, tournament_id: tournamentId, is_premium: true },
        { onConflict: 'user_id,tournament_id' }
      )

    if (error) {
      console.error('[stripe/webhook] upsert failed:', error)
      return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
    }

    console.log(`[stripe/webhook] premium granted — user ${userId} tournament ${tournamentId}`)
  }

  return NextResponse.json({ received: true })
}
