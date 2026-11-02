import Link from 'next/link'
import type { Metadata } from 'next'
import QRCode from 'qrcode'
import { getCup, getField, raceDayLabel, CUP_OG_IMAGES } from '../cup'
import { PrintButton } from './PrintButton'

export const revalidate = 900

// A free printable sweep sheet — what most "Melbourne Cup sweep" searches are after — with the
// online sweep offered alongside. Page 1 is the draw sheet, page 2 the tickets for the hat.
// Before the final field is declared it prints numbered blanks.
const URL = 'https://tribepicks.com/melbourne-cup/sweep-sheet'
const DESC = 'Free printable Melbourne Cup 2026 sweep sheet: the full field, a draw sheet with names, paid and prize columns, and cut-out tickets for the hat.'

export const metadata: Metadata = {
  title: 'Printable Melbourne Cup 2026 sweep sheet — free | TribePicks',
  description: DESC,
  alternates: { canonical: URL },
  openGraph: { title: 'Free printable Melbourne Cup 2026 sweep sheet', description: DESC, url: URL, siteName: 'TribePicks', type: 'website', images: CUP_OG_IMAGES },
}

const BLANK_FIELD = 24   // the Cup's maximum field

export default async function SweepSheetPage() {
  const cup = await getCup()
  const declared = cup && cup.sweep_draw_open !== false ? await getField(cup.id) : []
  const rows = declared.length
    ? declared
    : Array.from({ length: BLANK_FIELD }, (_, i) => ({ number: i + 1, name: '', scratched: false }))
  const tickets = rows.filter(h => !h.scratched)
  const qrSvg = await QRCode.toString('https://tribepicks.com/melbourne-cup?src=sheet', { type: 'svg', margin: 0 }).catch(() => '')

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 print:p-0 print:max-w-none">
      <style>{`@page { size: A4; margin: 12mm } @media print { body { background: #fff } .sheet-page { break-after: page } }`}</style>

      {/* On screen only — the sheet below is what prints. */}
      <div className="print:hidden">
        <h1 className="text-2xl sm:text-3xl font-black text-gray-900">Printable Melbourne Cup 2026 sweep sheet</h1>
        <p className="text-sm text-gray-500 mt-2">
          Free to print. Page 1 is the draw sheet — who drew which horse, who&apos;s paid, and the prizes. Page 2 is the
          tickets: cut them out, fold them, and draw them from a hat.
          {!declared.length && ' The final field isn’t declared yet, so the horse names are blank — come back after the barrier draw for a printed field.'}
        </p>
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <PrintButton />
          <Link href="/melbourne-cup?src=sheet" className="text-sm font-bold text-emerald-700 hover:underline">
            Or run it online — no hat, no chasing →
          </Link>
        </div>
        <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs text-emerald-900">
          <strong>Running it at work?</strong> On TribePicks everyone gets a link, pays you directly, and spins a wheel for their
          horse — you see who&apos;s paid, and winners are worked out for you after the race.
        </div>
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mt-8 mb-2">Preview</p>
      </div>

      {/* Page 1 — the draw sheet */}
      <section className="sheet-page bg-white border border-gray-200 rounded-2xl p-6 print:border-0 print:rounded-none print:p-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-gray-900">Melbourne Cup 2026 sweep</h2>
            <p className="text-xs text-gray-500 mt-0.5">{raceDayLabel(cup)} · Flemington</p>
          </div>
          <div className="text-right text-xs text-gray-700 space-y-2 shrink-0">
            <p>Organiser ______________________</p>
            <p>Ticket price $________</p>
          </div>
        </div>

        <table className="w-full mt-4 text-sm border-collapse">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b-2 border-gray-800">
              <th className="py-1 w-10">No.</th><th className="py-1">Horse</th><th className="py-1 w-[35%]">Drawn by</th>
              <th className="py-1 w-12 text-center">Paid</th><th className="py-1 w-14 text-center">Finish</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(h => (
              <tr key={h.number} className="border-b border-gray-300 h-[26px]">
                <td className="font-bold text-gray-700">{h.number}</td>
                <td className={h.scratched ? 'line-through text-gray-400' : 'text-gray-900'}>
                  {h.name}{h.scratched && <span className="no-underline text-[10px] ml-1">scratched</span>}
                </td>
                <td /><td className="text-center text-gray-300">☐</td><td />
              </tr>
            ))}
          </tbody>
        </table>

        <div className="grid grid-cols-4 gap-2 mt-4 text-xs">
          {['1st', '2nd', '3rd', 'Last'].map(p => (
            <div key={p} className="border border-gray-400 rounded-lg px-2 py-1.5">
              <p className="font-bold text-gray-800">{p}</p>
              <p className="text-gray-500 mt-1">____% · $______</p>
              <p className="text-gray-500 mt-1">Name ____________</p>
            </div>
          ))}
        </div>
        <div className="flex items-end justify-between gap-4 mt-3">
          <p className="text-[10px] text-gray-500 leading-snug">
            Every dollar collected goes back as prizes. In Victoria, total prizes can&apos;t be more than $5,000 —
            rules differ in other states. Leave &ldquo;Last&rdquo; blank if you&apos;re only paying 1st–3rd.
            <br />Run it online instead — free: <strong>tribepicks.com/melbourne-cup</strong>
          </p>
          {qrSvg && <div className="w-14 h-14 shrink-0 [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />}
        </div>
      </section>

      {/* Page 2 — tickets for the hat */}
      <section className="mt-6 bg-white border border-gray-200 rounded-2xl p-6 print:mt-0 print:border-0 print:rounded-none print:p-0">
        <h2 className="text-sm font-bold text-gray-700">Tickets — cut out, fold, and draw from a hat</h2>
        <div className="grid grid-cols-4 mt-3 border-l border-t border-dashed border-gray-400">
          {tickets.map(h => (
            <div key={h.number} className="border-r border-b border-dashed border-gray-400 h-20 flex flex-col items-center justify-center text-center px-1">
              <p className="text-2xl font-black text-gray-900 leading-none">{h.number}</p>
              <p className="text-[11px] text-gray-700 mt-1 leading-tight">{h.name || ' '}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-2">Melbourne Cup 2026 · tribepicks.com/melbourne-cup</p>
      </section>
    </main>
  )
}
