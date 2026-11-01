// Sweep prize maths — one place so the buyer's prize table, the organiser's Pools tab and
// (later) the results email can't disagree. All money in cents.
//
// Each POOL pays its own 1st/2nd/3rd from its own pot:
//   pot = tickets sold in the pool × ticket price
// Every dollar goes back as prizes — nothing comes out for TribePicks or the organiser
// (Victorian sweep rules; a cut would be a breach). Anything TribePicks charges an organiser
// is paid by them separately, never from a pot.
// 2nd and 3rd are rounded down to the nearest 5c (payable in cash); 1st gets everything
// left, so the prizes always add up to exactly the pot.

// Victoria caps a Melbourne Cup sweep's prizes at $5,000 in total (VGCCC, "Melbourne Cup
// sweeps"). Every dollar is paid out, so the most a sweep can pay is price × tickets — and
// tickets can reach the race's maximum field in every pool. Applied to the whole sweep (all
// its pools together), the cautious reading. Checked wherever that maximum can grow: the
// price at creation, a price change, and adding pools.
export const PRIZE_CAP_CENTS = 500_000
export const MAX_FIELD_FOR_CAP = 24   // = MAX_FIELD in field.ts (the Cup's maximum field)

export const maxPayoutCents = (priceCents: number, pools: number) => priceCents * MAX_FIELD_FOR_CAP * pools

// null when within the cap, else the reason — worded for the organiser.
export function prizeCapError(priceCents: number | null | undefined, pools: number): string | null {
  if (!priceCents || maxPayoutCents(priceCents, pools) <= PRIZE_CAP_CENTS) return null
  const maxPrice = Math.floor(PRIZE_CAP_CENTS / (MAX_FIELD_FOR_CAP * pools) / 50) * 50   // down to the 50c
  return `Victoria caps a sweep's prizes at $5,000. At ${fmtCents(priceCents)} a ticket, ${pools} pool${pools === 1 ? '' : 's'} of up to ${MAX_FIELD_FOR_CAP} tickets could pay out ${fmtCents(maxPayoutCents(priceCents, pools))}` +
    ` — keep the price at ${fmtCents(maxPrice)} or less${pools > 1 ? ', or use fewer pools' : ''}.`
}

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
  pot_cents: number
  places: { place: 1 | 2 | 3; pct: number; cents: number }[]   // only places with pct > 0
}

export function computePoolPrizes(opts: {
  ticketPriceCents: number; ticketsSold: number; split: [number, number, number]
}): PoolPrizes {
  const pot = opts.ticketPriceCents * opts.ticketsSold
  const raw = opts.split.map(pct => Math.floor(pot * pct / 100 / 5) * 5)   // 1st is recomputed below
  raw[0] += pot - raw.reduce((a, b) => a + b, 0)
  return {
    ticket_price_cents: opts.ticketPriceCents,
    tickets_sold: opts.ticketsSold,
    pot_cents: pot,
    places: ([1, 2, 3] as const)
      .map((place, i) => ({ place, pct: opts.split[i], cents: raw[i] }))
      .filter(p => p.pct > 0),
  }
}

export const fmtCents = (c: number) => `$${(c / 100).toFixed(2).replace(/\.00$/, '')}`
