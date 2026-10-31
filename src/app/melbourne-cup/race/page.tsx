import Link from 'next/link'
import type { Metadata } from 'next'
import { DemoRace } from './DemoRace'

// Public demo of a practice sweep's race (no sign-in) — the link for Reddit and socials.
// Everything runs in the browser on the made-up practice field; nothing is saved.
const DESC = 'Spin for a horse and watch a practice race, fully called — then run your own office Melbourne Cup sweep free on TribePicks.'

export const metadata: Metadata = {
  title: 'Run a practice Melbourne Cup race | TribePicks',
  description: DESC,
  alternates: { canonical: 'https://tribepicks.com/melbourne-cup/race' },
  openGraph: {
    title: 'Run a practice Melbourne Cup race 🏇',
    description: DESC,
    url: 'https://tribepicks.com/melbourne-cup/race',
    siteName: 'TribePicks',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: 'Run a practice Melbourne Cup race 🏇', description: DESC },
}

export default function DemoRacePage() {
  return (
    <main className="max-w-xl mx-auto px-4 py-8">
      <div className="text-center">
        <div className="text-5xl mb-2">🏇</div>
        <h1 className="text-2xl font-black text-gray-900">Run a practice Cup race</h1>
        <p className="text-sm text-gray-500 mt-2 leading-relaxed">
          You&apos;re in a pretend 12-person office sweep, $5 a ticket. Spin for your horse, then watch them
          race — called by Vicky, with Gordo in her ear backing the wrong horse. Sound on 🔊.
        </p>
      </div>

      <div className="mt-6">
        <DemoRace />
      </div>

      <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-4">
        <p className="text-sm font-bold text-gray-900">Running the real sweep at work?</p>
        <ul className="mt-2 space-y-1.5 text-sm text-gray-600">
          <li>🔗 Share one link. Everyone spins the wheel for their horse.</li>
          <li>💸 They pay you directly (cash, bank transfer or PayID). TribePicks never touches the money.</li>
          <li>📋 See who&apos;s paid and who still owes, and draw for anyone who doesn&apos;t spin.</li>
          <li>🏆 Prizes roll down to the best-placed horses if a pool doesn&apos;t sell out.</li>
        </ul>
        <Link href="/melbourne-cup?src=race_demo"
          className="mt-4 block text-center bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold py-2.5 rounded-xl">
          Start your Melbourne Cup sweep — free →
        </Link>
      </div>

      <p className="mt-8 text-center text-[11px] text-gray-400 leading-relaxed">
        A practice race on a made-up field of past Cup winners. The result is random, nothing is
        saved, and it&apos;s not this year&apos;s runners or a prediction. The real Cup has no animated race:
        results come from the official finishing order.
      </p>
      <p className="mt-2 text-center text-[10px] text-gray-300">
        Horse graphic: <a href="https://github.com/jdecked/twemoji" className="underline" rel="noopener noreferrer" target="_blank">Twemoji</a>, CC-BY 4.0.
      </p>
    </main>
  )
}
