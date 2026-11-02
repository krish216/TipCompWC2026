import Link from 'next/link'
import type { Metadata } from 'next'
import { getCup, getField, raceDayLabel, CUP_OG_IMAGES } from '../cup'
import { ordinal } from '@/lib/sweep/podium'

// The 2026 Cup's official finishing order, for people checking their sweep — the same
// result every TribePicks pool is settled from (entered on /admin/sweep-horses). Until it's
// all in, the page shows the field and when results land. Kept up after the race: next
// year's page links back here.
export const revalidate = 300

const URL = 'https://tribepicks.com/melbourne-cup/2026-results'
const DESC = 'Melbourne Cup 2026 results for your sweep: the full official finishing order, plus how to work out and pay your sweep’s prizes.'

export const metadata: Metadata = {
  title: 'Melbourne Cup 2026 results — full finishing order for your sweep | TribePicks',
  description: DESC,
  alternates: { canonical: URL },
  openGraph: { title: 'Melbourne Cup 2026 results for your sweep', description: DESC, url: URL, siteName: 'TribePicks', type: 'website', images: CUP_OG_IMAGES },
}

const PAYOUT = [
  { q: 'Who wins the sweep?', a: 'Whoever drew the horses that finished 1st, 2nd and 3rd — and last, if your sweep pays a last-place prize. Check the finishing order above against your sweep sheet.' },
  { q: 'What if nobody drew the winner?', a: 'That’s up to your sweep’s rules. A common rule is that the prize rolls down to the next horse home that somebody holds, so the whole pot is still paid out. TribePicks sweeps do this automatically.' },
  { q: 'What about a dead heat?', a: 'Horses that tie share the prizes for the places they span — two horses dead-heating for 1st split the 1st and 2nd prizes between them.' },
  { q: 'What about a scratched horse, or one that didn’t finish?', a: 'A scratched horse doesn’t run, and a horse that doesn’t finish can’t place, so neither wins a prize (unless your sweep’s rules say otherwise).' },
]

export default async function CupResultsPage() {
  const cup = await getCup()
  const field = cup ? await getField(cup.id) : []
  const runners = field.filter(h => !h.scratched)
  const resultIn = runners.length > 0 && runners.every(h => h.finish_position != null || h.did_not_finish)
  const finished = runners.filter(h => h.finish_position != null).sort((a, b) => a.finish_position! - b.finish_position!)
  const lastPos = finished.length ? finished[finished.length - 1].finish_position : null

  return (
    <main className="max-w-xl mx-auto px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-wide text-amber-700">🐎 {raceDayLabel(cup)}</p>
      <h1 className="text-2xl sm:text-3xl font-black text-gray-900 mt-1">Melbourne Cup 2026 results</h1>

      {resultIn ? (
        <>
          <p className="text-sm text-gray-500 mt-2">The official finishing order — check it against your sweep.</p>
          <ol className="mt-5 divide-y divide-gray-100 border-y border-gray-100">
            {finished.map(h => (
              <li key={h.number} className="flex items-center gap-3 py-2 text-sm">
                <span className={`w-12 font-black ${h.finish_position! <= 3 ? 'text-amber-600' : 'text-gray-500'}`}>
                  {h.finish_position === 1 ? '🥇' : h.finish_position === 2 ? '🥈' : h.finish_position === 3 ? '🥉' : ordinal(h.finish_position!)}
                </span>
                <span className="text-gray-900 font-semibold">#{h.number} {h.name}</span>
                {h.finish_position === lastPos && finished.length > 3 && <span className="ml-auto text-[11px] font-bold text-gray-400">Last</span>}
              </li>
            ))}
            {runners.filter(h => h.did_not_finish).map(h => (
              <li key={h.number} className="flex items-center gap-3 py-2 text-sm text-gray-400">
                <span className="w-12 font-bold">DNF</span>#{h.number} {h.name}
              </li>
            ))}
          </ol>
          {field.some(h => h.scratched) && (
            <p className="text-xs text-gray-400 mt-2">
              Scratched: {field.filter(h => h.scratched).map(h => `#${h.number} ${h.name}`).join(', ')}
            </p>
          )}
          <p className="text-xs text-gray-500 mt-3">
            Running your sweep on TribePicks? Your pool&apos;s winners and prizes are already worked out — open your pool, or
            check the results email.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-500 mt-2">
            The full finishing order goes up here once the result is official, shortly after the race.
          </p>
          {runners.length > 0 && (
            <>
              <h2 className="text-lg font-black text-gray-900 mt-6">The field</h2>
              <ol className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                {field.map(h => (
                  <li key={h.number} className={h.scratched ? 'text-gray-400 line-through' : 'text-gray-800'}>
                    <span className="inline-block w-7 font-bold text-gray-500">{h.number}</span>{h.name}
                  </li>
                ))}
              </ol>
            </>
          )}
          <div className="mt-6 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-4">
            <p className="text-sm text-emerald-900">
              <span className="font-bold">Still time to run a sweep.</span> Share a link, everyone pays you and spins for their horse,
              and the winners are worked out for you after the race.
            </p>
            <Link href="/melbourne-cup?src=results" className="inline-block mt-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4 py-2 rounded-lg">
              Start your sweep →
            </Link>
            <Link href="/melbourne-cup/sweep-sheet" className="inline-block mt-3 ml-3 text-sm font-bold text-emerald-700 hover:underline">
              Or print a sweep sheet
            </Link>
          </div>
        </>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-black text-gray-900">Paying out your sweep</h2>
        <div className="mt-3 divide-y divide-gray-100 border-y border-gray-100">
          {PAYOUT.map(f => (
            <div key={f.q} className="py-3">
              <p className="text-sm font-bold text-gray-900">{f.q}</p>
              <p className="text-sm text-gray-600 mt-1">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="text-[11px] text-gray-400 mt-8">
        Results are the official finishing order as published after the race. Check your sweep&apos;s own rules for how it pays out.
      </p>
    </main>
  )
}
