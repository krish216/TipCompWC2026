import Stripe from 'stripe'
import { isPracticeTournament } from '@/lib/sweep/practice'

// ── Sweep billing: organisers buying pools from TribePicks ────────────────────────────────
// The one seam every pool increase goes through — creating a sweep with more than the free
// allowance, and adding pools later in Settings. A purchase row (migration 196) is created,
// handed to a provider, and only raises comps.max_tribes once fulfilled. Swapping how money
// is taken means touching the providers below, never the routes.
//
// Billing is OFF unless SWEEP_BILLING_ENABLED=true: purchases then go through the 'free'
// provider and are fulfilled on the spot, so behaviour matches what it was before billing.

// Pricing — placeholders until pricing is decided. AUD cents, GST added by Stripe Tax.
export const SWEEP_PRICING = {
  includedPools: 1,      // pools every sweep gets free
  perPoolCents:  500,    // each pool beyond that
  maxPools:      5,
}

export const sweepBillingEnabled = () => process.env.SWEEP_BILLING_ENABLED === 'true'

export function quotePools(pools: number): number {
  return sweepBillingEnabled() ? pools * SWEEP_PRICING.perPoolCents : 0
}

// What the organiser UI needs to show prices.
export function billingInfo() {
  return {
    enabled:        sweepBillingEnabled(),
    included_pools: SWEEP_PRICING.includedPools,
    per_pool_cents: SWEEP_PRICING.perPoolCents,
    max_pools:      SWEEP_PRICING.maxPools,
  }
}

type Purchase = { id: string; comp_id: string; user_id: string; pools: number; amount_cents: number; currency: string }
type CheckoutCtx = { compName: string; email: string | null; appUrl: string }
export type CheckoutResult = { kind: 'completed' } | { kind: 'redirect'; url: string }

interface PoolPaymentProvider {
  id: 'free' | 'stripe' | 'admin'
  checkout(admin: any, purchase: Purchase, ctx: CheckoutCtx): Promise<CheckoutResult>
}

// Nothing to collect — fulfil immediately.
const instantProvider = (id: 'free' | 'admin'): PoolPaymentProvider => ({
  id,
  async checkout(admin, purchase) {
    const res = await fulfilPoolPurchase(admin, purchase.id)
    if (res.error) throw new Error(res.error)
    return { kind: 'completed' }
  },
})

// Stripe Checkout — fulfilled by /api/stripe/webhook on checkout.session.completed
// (metadata.kind = 'sweep_pools'), never by the redirect back.
const stripeProvider: PoolPaymentProvider = {
  id: 'stripe',
  async checkout(admin, purchase, ctx) {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2024-04-10' })
    const back = `${ctx.appUrl}/sweep-admin?comp_id=${purchase.comp_id}&tab=settings`
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: purchase.currency,
          unit_amount: SWEEP_PRICING.perPoolCents,
          product_data: { name: 'TribePicks · Sweep pool', description: `Extra pool for ${ctx.compName}` },
        },
        quantity: purchase.pools,
      }],
      automatic_tax: { enabled: true },
      billing_address_collection: 'auto',
      customer_email: ctx.email ?? undefined,
      client_reference_id: purchase.user_id,
      metadata: { kind: 'sweep_pools', purchase_id: purchase.id, comp_id: purchase.comp_id, user_id: purchase.user_id },
      success_url: `${back}&pools=paid`,
      cancel_url:  back,
    })
    await (admin.from('sweep_pool_purchases') as any).update({ stripe_session_id: session.id }).eq('id', purchase.id)
    if (!session.url) throw new Error('Stripe did not return a checkout URL')
    return { kind: 'redirect', url: session.url }
  },
}

function pickProvider(isPlatformAdmin: boolean, isPractice: boolean): PoolPaymentProvider {
  // Practice sweeps (migration 200) are never charged, billing on or off.
  if (!sweepBillingEnabled() || isPractice) return instantProvider('free')
  if (isPlatformAdmin) return instantProvider('admin')
  return stripeProvider
}

// Start buying `pools` more pools for a comp. Caller has already authorised the user as an
// organiser of this sweep.
export async function buyPools(admin: any, opts: { compId: string; userId: string; pools: number }): Promise<CheckoutResult | { error: string; status: number }> {
  if (!Number.isInteger(opts.pools) || opts.pools < 1) return { error: 'Add at least one pool.', status: 400 }

  const [{ data: comp }, { data: platformAdmin }, { data: buyer }] = await Promise.all([
    (admin.from('comps') as any).select('name, max_tribes, tournament_id').eq('id', opts.compId).maybeSingle(),
    (admin.from('admin_users') as any).select('user_id').eq('user_id', opts.userId).maybeSingle(),
    (admin.from('users') as any).select('email').eq('id', opts.userId).maybeSingle(),
  ])
  if (!comp) return { error: 'Sweep not found', status: 404 }
  const current = (comp as any).max_tribes ?? 1
  if (current + opts.pools > SWEEP_PRICING.maxPools) {
    return { error: `A sweep can have up to ${SWEEP_PRICING.maxPools} pools — this one has ${current}.`, status: 400 }
  }

  const provider = pickProvider(!!platformAdmin, await isPracticeTournament(admin, (comp as any).tournament_id))
  const { data: purchase, error } = await (admin.from('sweep_pool_purchases') as any)
    .insert({
      comp_id: opts.compId, user_id: opts.userId, pools: opts.pools,
      amount_cents: provider.id === 'stripe' ? quotePools(opts.pools) : 0,
      currency: 'aud', provider: provider.id,
    })
    .select().single()
  if (error) return { error: error.message, status: 500 }

  try {
    return await provider.checkout(admin, purchase as Purchase, {
      compName: (comp as any).name, email: (buyer as any)?.email ?? null,
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    })
  } catch (e: any) {
    await (admin.from('sweep_pool_purchases') as any).update({ status: 'cancelled' }).eq('id', (purchase as any).id)
    return { error: e?.message ?? 'Could not start checkout', status: 502 }
  }
}

// Mark a purchase paid and raise the sweep's pool count. Idempotent: only the call that
// flips pending -> paid does anything, so Stripe retrying the webhook is harmless.
export async function fulfilPoolPurchase(admin: any, purchaseId: string): Promise<{ error?: string }> {
  const { data: purchase } = await (admin.from('sweep_pool_purchases') as any)
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', purchaseId).eq('status', 'pending')
    .select().maybeSingle()
  if (!purchase) return {}

  const { data: comp } = await (admin.from('comps') as any)
    .select('max_tribes, tournament_id').eq('id', (purchase as any).comp_id).maybeSingle()
  if (!comp) return { error: 'Sweep not found' }
  const target = Math.min(SWEEP_PRICING.maxPools, ((comp as any).max_tribes ?? 1) + (purchase as any).pools)
  const { error } = await (admin.from('comps') as any).update({ max_tribes: target }).eq('id', (purchase as any).comp_id)
  if (error) return { error: error.message }

  const poolError = await ensurePoolCount(admin, (purchase as any).comp_id, (comp as any).tournament_id, target, (purchase as any).user_id)
  return poolError ? { error: `Paid, but the new pool couldn't be created: ${poolError}` } : {}
}

// Pools exist (and show as pills) the moment they're paid for, not only once
// self-register's overflow lazily adds one later.
export async function ensurePoolCount(admin: any, compId: string, tournamentId: string, targetCount: number, userId: string): Promise<string | null> {
  const { data: existingTribes } = await admin.from('tribes').select('id, name').eq('comp_id', compId)
  const existingCount = (existingTribes ?? []).length
  const toCreate = targetCount - existingCount
  if (toCreate <= 0) return null

  // A one-pool sweep's pool is just "Pool" (see /api/comps/create) — number it once it has company.
  const lone = existingCount === 1 && (existingTribes as any[])[0].name === 'Pool' ? (existingTribes as any[])[0] : null
  if (lone) await admin.from('tribes').update({ name: 'Pool 1' }).eq('id', lone.id)

  const rows = Array.from({ length: toCreate }, (_, i) => {
    const n = existingCount + i + 1
    return {
      name:          `Pool ${n}`,
      // tribes.created_by is NOT NULL — without it the insert is rejected outright.
      created_by:    userId,
      invite_code:   (Math.random().toString(36).substring(2, 10) + n).toUpperCase().slice(0, 10),
      comp_id:       compId,
      tournament_id: tournamentId,
      is_default:    false,
    }
  })
  const { error } = await admin.from('tribes').insert(rows)
  if (error) console.error('[sweep/billing] pool create failed:', error)
  return error ? error.message : null
}
