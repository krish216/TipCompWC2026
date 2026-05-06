import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2024-04-10' })

// POST /api/stripe/create-checkout
// Body: { tournament_id: string }
// Returns: { url: string } — Stripe Checkout session URL
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { tournament_id } = await request.json()
    if (!tournament_id) return NextResponse.json({ error: 'tournament_id required' }, { status: 400 })

    // Verify tournament exists and get its name
    const admin = createAdminClient()
    const { data: tourn } = await (admin.from('tournaments') as any)
      .select('id, name').eq('id', tournament_id).single()
    if (!tourn) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })

    // Check user isn't already premium for this tournament
    const { data: existing } = await admin
      .from('user_tournaments')
      .select('is_premium')
      .eq('user_id', user.id)
      .eq('tournament_id', tournament_id)
      .maybeSingle()
    if ((existing as any)?.is_premium) {
      return NextResponse.json({ error: 'Already premium for this tournament' }, { status: 409 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'aud',
          unit_amount: 995, // $9.95 AUD in cents
          product_data: {
            name: 'TribePicks Pro',
            description: `Premium comp-organiser features for ${(tourn as any).name}`,
          },
        },
        quantity: 1,
      }],
      // Stripe Tax handles Australian GST automatically when enabled in the dashboard
      automatic_tax: { enabled: true },
      billing_address_collection: 'auto',
      customer_email: user.email,
      metadata: {
        user_id:       user.id,
        tournament_id: tournament_id,
      },
      success_url: `${appUrl}/comp-admin?upgraded=1`,
      cancel_url:  `${appUrl}/comp-admin`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('[stripe/create-checkout]', err)
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 })
  }
}
