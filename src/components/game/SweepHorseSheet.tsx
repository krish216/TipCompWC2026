'use client'

import { fmtCents } from '@/lib/sweep/prizes'
import { horseDetails, ordinal, prizeLabel } from '@/lib/sweep/podium'

export type SheetHorse = {
  id: string; number: number; name: string; scratched: boolean; finish_position: number | null
  barrier?: number | null; jockey?: string | null; trainer?: string | null; weight_kg?: number | null   // migration 207
}
type SheetHorseOrHidden = SheetHorse | { id: string; hidden: true }
const isHidden = (h: SheetHorseOrHidden): h is { id: string; hidden: true } => (h as any)?.hidden === true

// The sweep sheet, by horse — on My Pool ("Who's in this pool") and the organiser's
// Allocation tab. Before the reveal it marks only YOUR horses: flagging the others as taken
// or free would give the draw away (it's why the wheel shows no numbers).
export function SweepHorseSheet({ horses, roster, mine, finishByHorse, podium, drawHidden, drawOpensLabel }: {
  horses: SheetHorse[]
  roster: { display_name: string; horses: SheetHorseOrHidden[] }[]
  mine: Set<string>                                       // horse ids that are yours — green rows
  finishByHorse: Record<string, number | null> | null
  podium: { places: number[]; horse: SheetHorse | null; cents: number | null }[]
  drawHidden: boolean
  drawOpensLabel: string
}) {
  if (!horses.length) {
    return <p className="text-sm text-gray-400 text-center py-4">The field is listed here once the draw opens ({drawOpensLabel}).</p>
  }
  const holder = new Map<string, string>()
  for (const r of roster) for (const h of r.horses) if (!isHidden(h)) holder.set(h.id, r.display_name)
  const finish = finishByHorse
  const prize = new Map(podium.filter(p => p.horse).map(p => [p.horse!.id, p]))
  // After the race: finishing order (non-finishers, then scratchings, last). Before: by number.
  const rank = (h: SheetHorse) => h.scratched ? 1e6 : finish ? (finish[h.id] ?? 1e5) : h.number
  const list = [...horses].sort((a, b) => rank(a) - rank(b) || a.number - b.number)
  return (
    <div>
      {list.map((h, i) => {
        const pos = finish && !h.scratched ? finish[h.id] : undefined
        const won = prize.get(h.id)
        const details = horseDetails(h)
        return (
          // Banded rows for scanning a 24-runner sheet; your own horses stay green on top.
          // gray-50 vanished: the card has no fill, so it sits on the gray-50 page.
          <div key={h.id} className={`flex items-start justify-between gap-3 py-2 px-2 -mx-2 rounded-lg text-sm ${
            mine.has(h.id) ? 'bg-emerald-50 ring-1 ring-emerald-200' : i % 2 ? '' : 'bg-gray-200/60'}`}>
            <span className="flex items-start gap-2 min-w-0">
              {finish && (
                <span className="w-9 flex-shrink-0 text-xs font-bold text-gray-500 pt-0.5">
                  {h.scratched ? '' : pos == null ? 'DNF' : ordinal(pos)}
                </span>
              )}
              <span className="min-w-0">
                <span className={`block ${h.scratched ? 'line-through text-red-400' : 'font-semibold text-gray-900'}`}>#{h.number} {h.name}</span>
                {h.scratched
                  ? <span className="block text-[11px] text-red-400">Scratched</span>
                  : details && <span className="block text-[11px] text-gray-400">{details}</span>}
              </span>
            </span>
            <span className="text-right flex-shrink-0">
              {mine.has(h.id)
                ? <span className="block font-bold text-emerald-700">You</span>
                : !drawHidden && !h.scratched && (
                    holder.has(h.id)
                      ? <span className="block text-gray-700">{holder.get(h.id)}</span>
                      : <span className="block text-gray-300 italic">unsold</span>
                  )}
              {won && (
                <span className="block text-xs font-bold text-amber-700">
                  {prizeLabel(won.places)}{won.cents != null ? ` · ${fmtCents(won.cents)}` : ''}
                </span>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}
