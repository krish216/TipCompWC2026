'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import QRCode from 'qrcode'
import { track } from '@vercel/analytics'
import { Spinner } from '@/components/ui'
import { fmtCents, type PoolPrizes } from '@/lib/sweep/prizes'
import { ordinal } from '@/lib/sweep/podium'

type Horse = { id: string; number: number; name: string; scratched: boolean }
type Row = { user_id: string; display_name: string; horses: (Horse | { id: string; hidden: true })[]; paid?: number; owed?: number }
type Sweep = {
  comp_id: string; pool_name: string | null; sweep_name: string | null; race_name: string | null
  is_practice: boolean; is_comp_admin: boolean; draw_open: boolean; draw_hidden: boolean
  horses: Horse[]; roster: Row[]; ticket_price_cents: number | null; prizes: PoolPrizes | null
  podium: { places: number[]; horse: Horse | null; winner: { display_name: string } | null; cents: number | null }[]
  race_run: boolean; finish_by_horse: Record<string, number | null> | null
  organiser_name: string | null; race_start_at: string | null
}

const raceDay = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
  : null

// A pool's draw on one A4 page — for the office wall on race day. It follows the pool's own
// rule (GET /api/tribes/:id/sweep): who drew what is hidden from everyone, organiser included,
// until the pool closes, so there's nothing to print before then. The organiser's copy adds a
// Paid column; members never see each other's money.
function PoolSheet() {
  const poolId = useSearchParams().get('pool')
  const [sweep, setSweep] = useState<Sweep | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [qrSvg, setQrSvg] = useState('')
  const [showPaid, setShowPaid] = useState(true)   // organiser: untick for a copy to put on the wall

  useEffect(() => {
    if (!poolId) { setError('No pool chosen.'); return }
    fetch(`/api/tribes/${poolId}/sweep`)
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(r.status === 401 ? 'Log in to print your pool’s draw.' : d.error ?? 'Couldn’t load this pool.')
        setSweep(d)
        QRCode.toString(`https://tribepicks.com/tribe?comp_id=${d.comp_id}`, { type: 'svg', margin: 0 }).then(setQrSvg).catch(() => {})
      })
      .catch(e => setError(e.message))
  }, [poolId])

  if (error) return <Notice>{error}</Notice>
  if (!sweep) return <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div>
  if (!sweep.draw_open || sweep.draw_hidden) {
    return <Notice>The draw prints once the pool closes — when every horse is drawn, or the pool locks before the race. Until then, who drew what stays hidden.</Notice>
  }

  const holder = new Map<string, Row>()
  for (const r of sweep.roster) for (const h of r.horses) if (!('hidden' in h)) holder.set(h.id, r)
  const finish = sweep.race_run ? sweep.finish_by_horse : null
  const canSeeMoney = sweep.is_comp_admin && !sweep.is_practice
  const money = canSeeMoney && showPaid
  const when = raceDay(sweep.race_start_at)
  const places: { place: number; pct: number | null; cents: number | null }[] =
    sweep.prizes?.places ?? [1, 2, 3].map(place => ({ place, pct: null, cents: null }))

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 print:p-0 print:max-w-none">
      <style>{`@page { size: A4; margin: 12mm } @media print { body { background: #fff } }`}</style>

      {/* On screen only — the sheet below is what prints. */}
      <div className="print:hidden flex flex-wrap items-center gap-3 mb-4">
        <button onClick={() => { track('pool_sheet_print', { organiser: sweep.is_comp_admin }); window.print() }}
          className="bg-gray-900 hover:bg-black text-white text-sm font-bold px-4 py-2.5 rounded-xl">
          🖨️ Print the draw
        </button>
        <Link href={`/tribe?comp_id=${sweep.comp_id}`} className="text-sm font-bold text-emerald-700 hover:underline">← Back to My Pool</Link>
        {canSeeMoney && (
          <label className="w-full flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={showPaid} onChange={e => setShowPaid(e.target.checked)} className="accent-emerald-600" />
            Show who&apos;s paid — untick for a copy to put up on the wall. Members&apos; copies never show payments.
          </label>
        )}
      </div>

      <section className="bg-white border border-gray-200 rounded-2xl p-6 print:border-0 print:rounded-none print:p-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-gray-900">{sweep.sweep_name ?? 'Sweep'}{sweep.pool_name ? ` — ${sweep.pool_name}` : ''}</h1>
            <p className="text-xs text-gray-500 mt-0.5">{[sweep.race_name, when].filter(Boolean).join(' · ')}</p>
            {sweep.is_practice && <p className="text-[11px] font-bold text-violet-700 mt-1">Practice sweep — no real money</p>}
          </div>
          <div className="text-right text-xs text-gray-700 shrink-0 space-y-0.5">
            {sweep.organiser_name && <p>Organiser <strong>{sweep.organiser_name}</strong></p>}
            {sweep.prizes && <p>{sweep.prizes.tickets_sold} tickets × {fmtCents(sweep.prizes.ticket_price_cents)} = <strong>{fmtCents(sweep.prizes.pot_cents)}</strong> pot</p>}
          </div>
        </div>

        <table className="w-full mt-4 text-sm border-collapse">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b-2 border-gray-800">
              <th className="py-1 w-10">No.</th><th className="py-1">Horse</th><th className="py-1 w-[35%]">Drawn by</th>
              {money && <th className="py-1 w-20 text-center">Paid</th>}
              <th className="py-1 w-14 text-center">Finish</th>
            </tr>
          </thead>
          <tbody>
            {sweep.horses.map(h => {
              const r = holder.get(h.id)
              const pos = finish && !h.scratched ? finish[h.id] : undefined
              return (
                <tr key={h.id} className="border-b border-gray-300 h-[26px]">
                  <td className="font-bold text-gray-700">{h.number}</td>
                  <td className={h.scratched ? 'line-through text-gray-400' : 'text-gray-900'}>
                    {h.name}{h.scratched && <span className="no-underline text-[10px] ml-1">scratched</span>}
                  </td>
                  <td className={r ? 'font-semibold text-gray-900' : 'text-gray-400 text-xs'}>{r ? r.display_name : h.scratched ? '' : 'Unsold'}</td>
                  {money && (
                    <td className="text-center text-xs">
                      {!r ? '' : (r.owed ?? 0) > 0
                        ? <span className="font-bold text-amber-700">Owes {fmtCents(Math.round(r.owed! * 100))}</span>
                        : <span className="text-emerald-700">✓ Paid</span>}
                    </td>
                  )}
                  <td className="text-center font-bold text-gray-800">{pos === undefined ? '' : pos === null ? 'DNF' : ordinal(pos)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Prizes — blanks to fill in on the day, or the winners once the result is in. */}
        <div className="grid grid-cols-3 gap-2 mt-4 text-xs">
          {places.map(p => {
            const won = sweep.podium.find(w => w.places.includes(p.place))
            return (
              <div key={p.place} className="border border-gray-400 rounded-lg px-2 py-1.5">
                <p className="font-bold text-gray-800">{ordinal(p.place)}{p.pct != null && <span className="font-normal text-gray-500"> · {p.pct}% · {fmtCents(p.cents!)}</span>}</p>
                <p className="text-gray-700 mt-1">
                  {won?.winner ? <><strong>{won.winner.display_name}</strong>{won.horse && ` — #${won.horse.number} ${won.horse.name}`}</> : 'Name ______________________'}
                </p>
              </div>
            )
          })}
        </div>

        <div className="flex items-end justify-between gap-4 mt-3">
          <p className="text-[10px] text-gray-500 leading-snug">
            Every dollar collected goes back as prizes. If a placed horse went unsold, its prize rolls down to the next horse home that someone holds.
            <br />Live results and payouts: scan the code, or open TribePicks.
          </p>
          {qrSvg && <div className="w-14 h-14 shrink-0 [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />}
        </div>
      </section>
    </main>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-md mx-auto px-4 py-16 text-center">
      <p className="text-sm text-gray-600">{children}</p>
      <Link href="/tribe" className="inline-block mt-4 text-sm font-bold text-emerald-700 hover:underline">← Back to My Pool</Link>
    </main>
  )
}

export default function PoolSheetPage() {
  return <Suspense fallback={<div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div>}><PoolSheet /></Suspense>
}
