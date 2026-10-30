import { rollDownPodium, winnerCents, type Finish } from '@/lib/sweep/podium'
import { computePoolPrizes, isValidSplit, poolFeeShares } from '@/lib/sweep/prizes'

// The race result a pool's podium is built from — null until it's complete. A real race:
// every non-scratched horse has a finish_position or did_not_finish (migration 206), entered
// in one go on /admin/sweep-horses. A practice pool: tribes.practice_results, the pretend
// race's full order (one race per practice sweep, shared by its pools).
export function raceFinishes(
  horses: { id: string; scratched: boolean; finish_position: number | null; did_not_finish?: boolean }[],
  practiceOrder: string[] | null,
): Finish[] | null {
  if (practiceOrder) {
    if (!practiceOrder.length) return null
    return practiceOrder.map((horseId, i) => ({ horseId, position: i + 1 }))
  }
  const runners = horses.filter(h => !h.scratched)
  if (!runners.length || runners.some(h => h.finish_position == null && !h.did_not_finish)) return null
  return runners.map(h => ({ horseId: h.id, position: h.did_not_finish ? null : h.finish_position }))
}

export type PoolPodiumRow = {
  places: number[]          // prize places won (two or more → a dead heat sharing them)
  horseId: string
  position: number          // where the horse actually finished
  userId: string
  cents: number | null      // prize money, null when the sweep has no ticket price
}

// One pool's winners: roll-down over the horses its tickets hold, priced from its own pot.
export async function poolPodium(
  admin: any, opts: { tribeId: string; compId: string; finishes: Finish[]; entries: { user_id: string; horse_id: string | null }[] },
): Promise<PoolPodiumRow[]> {
  const holderOf = new Map(opts.entries.filter(e => e.horse_id).map(e => [e.horse_id as string, e.user_id]))
  const { data: comp } = await (admin.from('comps') as any)
    .select('sweep_ticket_price_cents, sweep_prize_split, sweep_deduct_fee').eq('id', opts.compId).maybeSingle()
  const split: [number, number, number] = isValidSplit((comp as any)?.sweep_prize_split) ? (comp as any).sweep_prize_split : [70, 20, 10]

  // Places with no share of the pot (e.g. winner takes all) aren't prizes at all.
  const winners = rollDownPodium(opts.finishes, new Set(holderOf.keys()), split)
    .filter(w => w.pct > 0)
  const price = (comp as any)?.sweep_ticket_price_cents ?? null
  let cents: (number | null)[] = winners.map(() => null)
  if (price) {
    const prizes = computePoolPrizes({
      ticketPriceCents: price, ticketsSold: opts.entries.length, split,
      feeCents: (await poolFeeShares(admin, opts.compId, (comp as any)?.sweep_deduct_fee !== false))[opts.tribeId] ?? 0,
    })
    cents = winnerCents(winners, Object.fromEntries(prizes.places.map(p => [p.place, p.cents])))
  }
  return winners.map((w, i) => ({
    places: w.places, horseId: w.horseId, position: w.position, userId: holderOf.get(w.horseId)!, cents: cents[i],
  }))
}
