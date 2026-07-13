import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { dogBySlug } from '@/lib/dogs'

export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2024-04-10' })

// Prices (AUD cents). CompChief Pro ($9.95) unlocks organiser features + ad-free.
// Tipster Pro ($6.95) is the player tier — ad-free + advanced personal stats. It
// reuses the `is_ad_free` flag, so stats gate on is_ad_free (see Phase C/D). Change
// here to re-price.
const PRO_PRICE_CENTS     = 995
const AD_FREE_PRICE_CENTS = 695   // Tipster Pro

// POST /api/stripe/create-checkout
// Body: { tournament_id: string, kind?: 'pro' | 'ad_free' }   (defaults to 'pro')
// Returns: { url: string } — Stripe Checkout session URL
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const kind = body.kind

    // ── Donation ("Feed the doggies") — variable amount, NO tournament_id so the webhook
    // routes it to the donations table; grants no entitlement. Attributed via both
    // client_reference_id and metadata.user_id.
    if (kind === 'donation') {
      const amount = Math.round(Number(body.amount_cents))
      if (!Number.isFinite(amount) || amount < 100 || amount > 500000) {
        return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
      }
      const dog = dogBySlug(typeof body.dog_slug === 'string' ? body.dog_slug : null)
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'aud',
            unit_amount: amount,
            product_data: {
              name: 'TribePicks · Feed the doggies 🐾',
              description: dog ? `A treat for ${dog.name} — keeps TribePicks free & funds what’s next` : 'Keeps TribePicks free & funds what’s next',
            },
          },
          quantity: 1,
        }],
        automatic_tax: { enabled: true },
        billing_address_collection: 'auto',
        customer_email: user.email,
        client_reference_id: user.id,
        metadata: { user_id: user.id, kind: 'donation', ...(dog ? { dog_slug: dog.slug } : {}) },
        success_url: `${appUrl}/feed?fed=1`,
        cancel_url:  `${appUrl}/feed`,
      })
      return NextResponse.json({ url: session.url })
    }

    const tournament_id = body.tournament_id
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
            ? { name: 'TribePicks · Tipster Pro', description: `Ad-free + advanced personal stats for ${tName} — covers the whole tournament` }
            : { name: 'TribePicks · CompChief Pro', description: `Premium comp-organiser features for ${tName}` },
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
