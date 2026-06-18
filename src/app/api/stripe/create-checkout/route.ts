import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2024-04-10' })

// Prices (AUD cents). Pro unlocks organiser features + ad-free; the ad-free pass
// is the cheap, ads-only tier for tipsters. Change here to re-price.
const PRO_PRICE_CENTS     = 995
const AD_FREE_PRICE_CENTS = 295

// POST /api/stripe/create-checkout
// Body: { tournament_id: string, kind?: 'pro' | 'ad_free' }   (defaults to 'pro')
// Returns: { url: string } — Stripe Checkout session URL
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { tournament_id, kind } = await request.json()
    if (!tournament_id) return NextResponse.json({ error: 'tournament_id required' }, { status: 400 })
    const adFree = kind === 'ad_free'

    // Verify tournament exists and get its name
    const admin = createAdminClient()
    const { data: tourn } = await (admin.from('tournaments') as any)
      .select('id, name').eq('id', tournament_id).single()
    if (!tourn) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })

    // Don't let users pay for something they already have.
    const { data: existing } = await admin
      .from('user_tournaments')
      .select('is_premium, is_ad_free')
      .eq('user_id', user.id)
      .eq('tournament_id', tournament_id)
      .maybeSingle()
    const ex = existing as any
    if (adFree) {
      // Pro already includes ad-free, so block if either flag is set.
      if (ex?.is_ad_free || ex?.is_premium) {
        return NextResponse.json({ error: 'You already have ad-free for this tournament' }, { status: 409 })
      }
    } else if (ex?.is_premium) {
      return NextResponse.json({ error: 'Already premium for this tournament' }, { status: 409 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const tName = (tourn as any).name

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'aud',
          unit_amount: adFree ? AD_FREE_PRICE_CENTS : PRO_PRICE_CENTS,
          product_data: adFree
            ? { name: 'TribePicks — Ad-free', description: `Remove ads for ${tName} — covers the whole tournament` }
            : { name: 'TribePicks Pro',       description: `Premium comp-organiser features for ${tName}` },
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
        ...(adFree ? { kind: 'ad_free' } : {}),
      },
      success_url: adFree ? `${appUrl}/settings?adfree=1` : `${appUrl}/comp-admin?upgraded=1`,
      cancel_url:  adFree ? `${appUrl}/settings`          : `${appUrl}/comp-admin`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('[stripe/create-checkout]', err)
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 })
  }
}
