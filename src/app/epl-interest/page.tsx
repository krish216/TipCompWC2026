import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'EPL interest — TribePicks', robots: { index: false, follow: false } }

const COPY: Record<string, { emoji: string; head: string; sub: string }> = {
  yes:   { emoji: '🎉', head: "You're in!",       sub: "We've noted your tribe's keen on the English Premier League 2026/27. We'll be in touch before kick-off." },
  maybe: { emoji: '🤔', head: 'Noted — a maybe.', sub: "Thanks. We'll keep you posted as EPL 2026/27 firms up." },
  no:    { emoji: '👌', head: 'All good.',         sub: 'Thanks for letting us know. You can jump in later if you change your mind.' },
}

const OPTS: { v: string; label: string }[] = [
  { v: 'yes',   label: 'Yes, count us in' },
  { v: 'maybe', label: 'Maybe' },
  { v: 'no',    label: 'Not for us' },
]

export default function EplInterestPage({ searchParams }: { searchParams: { v?: string; u?: string } }) {
  const v = (searchParams.v || '').toLowerCase()
  const u = searchParams.u || ''
  const c = COPY[v] ?? { emoji: '⚽', head: 'Thanks!', sub: 'Your response has been noted.' }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-sm w-full text-center">
        <div className="text-5xl mb-3">{c.emoji}</div>
        <h1 className="text-xl font-black text-gray-900">{c.head}</h1>
        <p className="text-sm text-gray-500 mt-2">{c.sub}</p>

        {/* Positive responders (yes/maybe) are invited straight into the co-design crew —
            joining the comp surfaces the 3 co-design polls on their home screen. */}
        {(v === 'yes' || v === 'maybe') && (
          <div className="mt-6">
            <Link href="/join?code=FXAZQXWW"
              className="inline-block px-5 py-3 rounded-xl bg-purple-600 text-white text-sm font-bold hover:bg-purple-700 transition-colors">
              ⚽ Join the EPL co-design crew →
            </Link>
            <p className="text-[11px] text-gray-400 mt-2">Help shape the game before launch — a few quick questions await on your home screen.</p>
          </div>
        )}

        {u && (
          <div className="mt-6">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Change your answer</p>
            <div className="flex flex-col gap-2">
              {OPTS.map(o => (
                <a key={o.v} href={`/api/epl-interest?v=${o.v}&u=${encodeURIComponent(u)}`}
                  className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                    v === o.v ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-emerald-300'
                  }`}>
                  {v === o.v ? '✓ ' : ''}{o.label}
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="mt-7 flex items-center justify-center gap-4 text-sm">
          <Link href="/epl" className="font-semibold text-emerald-700 hover:text-emerald-800">About EPL 2026/27 →</Link>
          <Link href="/" className="text-gray-400 hover:text-gray-600">Home</Link>
        </div>
      </div>
    </main>
  )
}
