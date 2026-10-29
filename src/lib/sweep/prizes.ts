// Sweep prize maths — one place so the buyer's prize table, the organiser's Pools tab and
// (later) the results email can't disagree. All money in cents.
//
// Each POOL pays its own 1st/2nd/3rd from its own pot:
//   pot = tickets sold in the pool × ticket price − the pool's share of the TribePicks fee
// 2nd and 3rd are rounded down to the nearest 5c (payable in cash); 1st gets everything
// left, so the prizes always add up to exactly the pot (1st can end in odd cents when a
// fee is deducted, e.g. $82.89).

export const PRIZE_PRESETS: { id: string; label: string; split: [number, number, number] }[] = [
  { id: '70-20-10',  label: '70 / 20 / 10',     split: [70, 20, 10] },
  { id: '60-25-15',  label: '60 / 25 / 15',     split: [60, 25, 15] },
  { id: '100-0-0',   label: 'Winner takes all', split: [100, 0, 0] },
]

export function isValidSplit(s: unknown): s is [number, number, number] {
  return Array.isArray(s) && s.length === 3
    && s.every(n => Number.isInteger(n) && n >= 0 && n <= 100)
    && s[0] + s[1] + s[2] === 100
}

export type PoolPrizes = {
  ticket_price_cents: number
  tickets_sold: number
  gross_cents: number
  fee_cents: number          // this pool's share of the TribePicks fee taken out (0 if none)
  pot_cents: number
  places: { place: 1 | 2 | 3; pct: number; cents: number }[]   // only places with pct > 0
}

export function computePoolPrizes(opts: {
  ticketPriceCents: number; ticketsSold: number; split: [number, number, number]; feeCents: number
}): PoolPrizes {
  const gross = opts.ticketPriceCents * opts.ticketsSold
  const fee = Math.min(gross, Math.max(0, opts.feeCents))   // never deduct more than the pot holds
  const pot = gross - fee
  const raw = opts.split.map(pct => Math.floor(pot * pct / 100 / 5) * 5)   // 1st is recomputed below
  raw[0] += pot - raw.reduce((a, b) => a + b, 0)
  return {
    ticket_price_cents: opts.ticketPriceCents,
    tickets_sold: opts.ticketsSold,
    gross_cents: gross,
    fee_cents: fee,
    pot_cents: pot,
    places: ([1, 2, 3] as const)
      .map((place, i) => ({ place, pct: opts.split[i], cents: raw[i] }))
      .filter(p => p.pct > 0),
  }
}

// Each pool's share of what the organiser actually paid TribePicks (paid Stripe purchases
// only — free / admin / billing-off pools cost nothing, so deduct nothing). Split equally
// across the sweep's pools; the first pool absorbs any leftover cent. Keyed by tribe id.
export async function poolFeeShares(admin: any, compId: string, deduct: boolean): Promise<Record<string, number>> {
  const { data: tribes } = await (admin.from('tribes') as any)
    .select('id, created_at').eq('comp_id', compId).order('created_at', { ascending: true })
  const ids = ((tribes ?? []) as any[]).map(t => t.id)
  const shares: Record<string, number> = Object.fromEntries(ids.map(id => [id, 0]))
  if (!deduct || !ids.length) return shares

  const { data: purchases } = await (admin.from('sweep_pool_purchases') as any)
    .select('amount_cents').eq('comp_id', compId).eq('status', 'paid').eq('provider', 'stripe')
  const total = ((purchases ?? []) as any[]).reduce((a, p) => a + (p.amount_cents ?? 0), 0)
  if (!total) return shares

  const each = Math.floor(total / ids.length)
  ids.forEach((id, i) => { shares[id] = each + (i === 0 ? total - each * ids.length : 0) })
  return shares
}

export const fmtCents = (c: number) => `$${(c / 100).toFixed(2).replace(/\.00$/, '')}`
