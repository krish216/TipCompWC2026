import Link from 'next/link'
import type { Metadata } from 'next'
import { CodesignFeedbackSections } from '@/components/game/CodesignFeedbackSections'

// Crew-facing co-design brief (not public marketing — that's /epl). Draws the line between
// what's decided and what the co-design crew actually gets to shape. Noindex.
export const metadata: Metadata = {
  title: 'EPL Co-Design — the lay of the land | TribePicks',
  description: 'The TribePicks Premier League co-design brief: what already works, what’s new for EPL, and where the co-design crew’s input lands.',
  robots: { index: false, follow: false },
  // og:title/description/url for the WhatsApp crew-chat preview. Deliberately NO openGraph.images
  // so the segment's own opengraph-image.tsx (the co-design card) still applies — setting images
  // here would suppress the static file (Next merges the static image only when images is unset).
  openGraph: {
    title: 'EPL Co-Design — the lay of the land 🗺️',
    description: 'Help shape TribePicks’ Premier League before it launches — what carries over, what’s new for EPL, and where your input lands.',
    url: 'https://tribepicks.com/epl/guide',
    type: 'website',
  },
}

// EPL Co-Design crew WhatsApp group.
const CREW_CHAT_URL = 'https://chat.whatsapp.com/G3LdKklggNrE6Zapcj0gUz?mode=gi_t'

// What already exists (carried over from the World Cup game).
const CARRIES_OVER = [
  ['⚽', 'Predictions & live scoring', 'Tip, then watch points land as results come in.'],
  ['👥', 'Tribes & private comps', 'Play with mates, work or a group chat on your own leaderboard.'],
  ['📊', 'ScoreBoards & leaderboards', 'You vs your tribe, your comp, and the whole world.'],
  ['🆚', 'Challenges', 'Bracket & Match challenges — some with sponsor prizes.'],
  ['📰', 'Weekly & end-of-round reports', 'Recaps that keep casual fans in the loop.'],
  ['🏆', 'Trophy cabinet & tipster stats', 'A permanent record of how you did.'],
]

export default function EplCodesignGuide() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-8 pb-20">
      {/* Hero */}
      <section className="rounded-3xl overflow-hidden shadow-lg" style={{ background: 'linear-gradient(160deg,#2e1065 0%,#4c1d95 55%,#1e1b4b 100%)' }}>
        <div className="px-6 py-9 sm:px-10 sm:py-11">
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-purple-300">EPL Co-Design Crew</p>
          <h1 className="mt-2 text-2xl sm:text-3xl font-black text-white leading-tight">The lay of the land 🗺️</h1>
          <p className="mt-3 text-sm sm:text-base text-white/80 max-w-xl leading-relaxed">
            You&apos;re helping shape TribePicks&apos; Premier League before it launches. Here&apos;s what already works, what&apos;s
            new for EPL, and — the bit that matters most — <strong className="text-white">where your input actually lands.</strong>
          </p>
        </div>
      </section>

      {/* 1 — Carries over */}
      <section className="mt-9">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-black text-gray-900">✅ Already there</h2>
          <span className="text-xs text-gray-400">— carried over from the World Cup</span>
        </div>
        <p className="mt-1 text-sm text-gray-600">The foundation EPL builds on. It works today — help us make it better, not rebuild it.</p>
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {CARRIES_OVER.map(([icon, title, body]) => (
            <div key={title} className="flex gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
              <span className="text-xl flex-shrink-0" aria-hidden>{icon}</span>
              <span><span className="block text-sm font-bold text-gray-900">{title}</span><span className="block text-[13px] text-gray-600 leading-snug mt-0.5">{body}</span></span>
            </div>
          ))}
        </div>
      </section>

      {/* 2 & 3 — New with EPL + Your call, each with inline per-item feedback (client) */}
      <CodesignFeedbackSections />

      {/* How to weigh in */}
      <section className="mt-9 rounded-2xl bg-purple-700 px-6 py-7 text-center">
        <p className="text-lg font-black text-white">Ready to weigh in?</p>
        <p className="text-sm text-purple-100/90 mt-1 mb-4">Two minutes now genuinely steers what we build before launch.</p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/polls?topic=codesign" className="inline-block bg-white text-purple-700 hover:bg-purple-50 text-sm font-bold px-6 py-3 rounded-xl transition-colors">Answer the co-design questions →</Link>
          <Link href="/predict" className="inline-block bg-white/10 hover:bg-white/20 text-white text-sm font-bold px-6 py-3 rounded-xl transition-colors">Try the warm-up round</Link>
        </div>
        <a href={CREW_CHAT_URL} target="_blank" rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-2 bg-[#25D366] hover:bg-[#1ebe5b] text-white text-sm font-bold px-6 py-3 rounded-xl transition-colors">
          💬 Join the crew chat on WhatsApp →
        </a>
        <p className="mt-3 text-xs text-purple-200/80">The chat is where the day-to-day back-and-forth happens — jump in and say hello.</p>
      </section>

      <p className="mt-6 text-center text-xs text-gray-400">
        You&apos;re seeing this as a member of the EPL Co-Design crew. <Link href="/epl" className="underline hover:text-gray-600">The public EPL page →</Link>
      </p>
    </main>
  )
}
