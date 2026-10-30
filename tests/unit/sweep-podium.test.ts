import { parseFinishOrder, rollDownPodium, winnerCents } from '@/lib/sweep/podium'

const order = (ids: string[]) => ids.map((horseId, i) => ({ horseId, position: i + 1 }))
const SPLIT: [number, number, number] = [70, 20, 10]

describe('roll-down podium', () => {
  it('pays the actual placegetters when the pool holds them', () => {
    const w = rollDownPodium(order(['a', 'b', 'c', 'd']), new Set(['a', 'b', 'c', 'd']), SPLIT)
    expect(w.map(x => [x.horseId, x.places, x.pct])).toEqual([['a', [1], 70], ['b', [2], 20], ['c', [3], 10]])
  })

  it('rolls prizes down to the best-placed horses the pool holds', () => {
    const w = rollDownPodium(order(['a', 'b', 'c', 'd', 'e', 'f']), new Set(['b', 'e', 'f']), SPLIT)
    expect(w.map(x => [x.horseId, x.position, x.places])).toEqual([['b', 2, [1]], ['e', 5, [2]], ['f', 6, [3]]])
  })

  it('never pays a horse that did not finish', () => {
    const finishes = [{ horseId: 'a', position: 1 }, { horseId: 'b', position: null }, { horseId: 'c', position: 2 }]
    const w = rollDownPodium(finishes, new Set(['b', 'c']), SPLIT)
    expect(w.map(x => x.horseId)).toEqual(['c'])
  })

  it('splits the places a dead heat spans', () => {
    const finishes = [{ horseId: 'a', position: 1 }, { horseId: 'b', position: 2 }, { horseId: 'c', position: 2 }, { horseId: 'd', position: 4 }]
    const w = rollDownPodium(finishes, new Set(['b', 'c', 'd']), SPLIT)
    expect(w.map(x => [x.horseId, x.places, x.pct])).toEqual([['b', [1, 2], 45], ['c', [1, 2], 45], ['d', [3], 10]])
    expect(winnerCents(w, { 1: 7001, 2: 2000, 3: 1000 })).toEqual([4501, 4500, 1000])
  })

  it('shares only the places left when a dead heat runs past 3rd', () => {
    const finishes = [{ horseId: 'a', position: 1 }, { horseId: 'b', position: 2 }, { horseId: 'c', position: 3 }, { horseId: 'd', position: 3 }]
    const w = rollDownPodium(finishes, new Set(['a', 'b', 'c', 'd']), SPLIT)
    expect(w.slice(2).map(x => [x.horseId, x.places, x.pct])).toEqual([['c', [3], 5], ['d', [3], 5]])
  })

  it('parses a typed finishing order with dead heats', () => {
    expect(parseFinishOrder('7, 3 = 12, 1')).toEqual({ ok: true, order: [[7, 1], [3, 2], [12, 2], [1, 4]] })
    expect(parseFinishOrder('7, x').ok).toBe(false)
  })
})
