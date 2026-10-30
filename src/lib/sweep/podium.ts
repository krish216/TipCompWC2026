// Who wins what in one pool — roll-down prizes. A pool's 1st/2nd/3rd prizes go to the
// best-finishing horses THAT POOL HOLDS, in finishing order: if nobody in the pool holds the
// actual winner, 1st prize goes to whoever holds the highest-placed horse they do hold, and so
// on. Unsold horses never win anything, and a pool always pays out its whole pot.
//
// Dead heats: horses tied on a finishing position share the prizes their places span equally
// (two held horses tied for the top spot share 1st + 2nd prize). Horses that didn't finish,
// and scratched ones, never win. Needs the FULL finishing order — a pool's 3rd prize can hang
// on 9th place — so callers only build a podium once every runner has a result.

export const ordinal = (n: number) => `${n}${[, 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th'}`
const MEDAL = ['🥇', '🥈', '🥉']
// "🥇 1st prize" / "🥇🥈 1st & 2nd prize (shared)" — the pool page and the results email.
export const prizeLabel = (places: number[]) =>
  `${places.map(p => MEDAL[p - 1]).join('')} ${places.map(ordinal).join(' & ')} prize${places.length > 1 ? ' (shared)' : ''}`
export const finishedLabel = (position: number) => `finished ${ordinal(position)}`

export type Finish = { horseId: string; position: number | null }   // null → did not finish

export type PodiumWinner = {
  horseId: string
  position: number          // where the horse actually finished
  places: number[]          // prize places it wins (more than one when a dead heat spans them)
  pct: number               // its share of the pot, in percent (may be fractional)
}

export function rollDownPodium(
  finishes: Finish[], heldHorseIds: Set<string>, split: [number, number, number],
): PodiumWinner[] {
  const held = finishes
    .filter(f => f.position != null && heldHorseIds.has(f.horseId))
    .sort((a, b) => a.position! - b.position!)

  const winners: PodiumWinner[] = []
  let nextPlace = 1
  for (let i = 0; i < held.length && nextPlace <= 3; ) {
    const group = held.filter(f => f.position === held[i].position)
    const places = [1, 2, 3].filter(p => p >= nextPlace && p < nextPlace + group.length)
    const pct = places.reduce((sum, p) => sum + split[p - 1], 0) / group.length
    for (const f of group) winners.push({ horseId: f.horseId, position: f.position!, places, pct })
    nextPlace += group.length
    i += group.length
  }
  return winners
}

// Prize money per winner, in cents, from the pool's place amounts (computePoolPrizes):
// a dead heat splits the sum of the places it spans, the first tied horse taking any odd cent.
export function winnerCents(winners: PodiumWinner[], placeCents: Record<number, number>): number[] {
  const out: number[] = []
  for (let i = 0; i < winners.length; ) {
    const key = winners[i].places.join(',')
    let n = 0
    while (i + n < winners.length && winners[i + n].places.join(',') === key) n++
    const total = winners[i].places.reduce((sum, p) => sum + (placeCents[p] ?? 0), 0)
    const each = Math.floor(total / n)
    for (let k = 0; k < n; k++) out.push(each + (k === 0 ? total - each * n : 0))
    i += n
  }
  return out
}

// A finishing order typed by an admin: horse numbers in order, comma or space separated, with
// "=" joining a dead heat — "7, 3=12, 1" puts 3 and 12 equal 2nd and 1 in 4th.
// Returns [number, position][] or an error.
export function parseFinishOrder(text: string): { ok: true; order: [number, number][] } | { ok: false; error: string } {
  const groups = text.replace(/\s*=\s*/g, '=').split(/[,\s]+/).map(s => s.trim()).filter(Boolean)
  const order: [number, number][] = []
  let position = 1
  for (const g of groups) {
    const nums = g.split('=').map(s => Number(s.trim()))
    if (nums.some(n => !Number.isInteger(n) || n < 1)) return { ok: false, error: `"${g}" isn't a horse number.` }
    for (const n of nums) order.push([n, position])
    position += nums.length
  }
  return { ok: true, order }
}
