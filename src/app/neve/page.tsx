import Link from 'next/link'
import { NeveAvatar } from '@/components/NeveAvatar'

export const metadata = {
  title: 'Queen Neve — Chief Morale Officer · TribePicks',
  description: 'Meet Queen Neve: TribePicks Chief Morale Officer, die-hard Socceroos tragic, and known tipsheet thief. Upgrades to Tipster Pro keep her in kibble.',
  alternates: { canonical: 'https://tribepicks.com/neve' },
  openGraph: {
    title: 'Queen Neve — Chief Morale Officer · TribePicks',
    description: 'Die-hard Socceroos tragic. Known tipsheet thief. Powered by Tipster Pro kibble.',
    images: ['/QueenNeve.jpeg'],
  },
}

const DUTIES = [
  { icon: '💚💛', title: 'Die-hard Socceroos tragic', detail: 'Green and gold to the bone. Watches every match from the good cushion. Howls at VAR.' },
  { icon: '📋', title: 'Known tipsheet thief', detail: 'If your tips went missing before a deadline, she has an alibi. It is not a good one.' },
  { icon: '🦴', title: 'Chief Morale Officer', detail: 'Keeps the tiny team shipping by enforcing strict pat breaks and aggressive napping.' },
]

export default function NevePage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-4">
        <Link href="/" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700">← Back to TribePicks</Link>
      </div>

      <NeveAvatar />

      <div className="mt-5 text-center">
        <h1 className="text-2xl sm:text-3xl font-black text-gray-900">Queen Neve 👑</h1>
        <p className="text-sm font-semibold text-emerald-700 mt-1">Chief Morale Officer · TribePicks</p>
        <p className="text-xs text-gray-500 mt-2">The real reason the features keep shipping. Also: a menace to tipsheets.</p>
      </div>

      <div className="mt-6 space-y-3">
        {DUTIES.map(d => (
          <div key={d.title} className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <span className="text-2xl leading-none flex-shrink-0">{d.icon}</span>
            <div>
              <p className="text-sm font-bold text-gray-900">{d.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{d.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Fund the kibble — the soft Pro nudge */}
      <div className="mt-6 rounded-2xl bg-green-900 px-5 py-6 text-center">
        <p className="text-lg font-black text-white">Fund the kibble 🦴</p>
        <p className="text-sm text-green-200 mt-1.5">
          Every <strong className="text-amber-300">Tipster Pro</strong> upgrade keeps a tiny indie team
          building new features — and keeps Her Majesty in the manner to which she has become accustomed.
        </p>
        <Link
          href="/pro/tipster"
          className="inline-block mt-4 px-5 py-2.5 rounded-xl text-sm font-bold bg-amber-400 hover:bg-amber-300 text-green-950 transition-colors">
          Explore Tipster Pro →
        </Link>
      </div>

      <p className="text-center text-[11px] text-gray-400 mt-5">
        No dogs were made to actually predict matches. She is, however, undefeated at predicting dinner. 🐶
      </p>
    </div>
  )
}
