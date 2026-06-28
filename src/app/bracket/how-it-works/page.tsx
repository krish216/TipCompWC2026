import Link from 'next/link'

export const metadata = {
  title: 'Bracket Challenge — How it works · TribePicks',
  description: 'Predict the entire World Cup 2026 knockout bracket — Round of 32 to the Final — and score points all tournament. Free to play, with sponsor prize challenges.',
}

// Scoring mirrors src/lib/bracket-scoring.ts (BRACKET_SLOT_POINTS, max 80).
const SCORING = [
  { round: 'Round of 32',      each: 1,  matches: 16, total: 16 },
  { round: 'Round of 16',      each: 2,  matches: 8,  total: 16 },
  { round: 'Quarter-finals',   each: 4,  matches: 4,  total: 16 },
  { round: 'Semi-finals',      each: 8,  matches: 2,  total: 16 },
  { round: '3rd-place',        each: 4,  matches: 1,  total: 4,  badge: '🥉' },
  { round: 'Final · Champion', each: 12, matches: 1,  total: 12, badge: '🏆', highlight: true },
]
const MAX = 80

const STEPS = [
  { n: 1, title: 'Build your bracket',  detail: 'Pick the winner of every knockout match — Round of 32 all the way to the Final — plus the 3rd-place play-off.' },
  { n: 2, title: 'Enter a challenge',   detail: 'Join the free Global Bracket Challenge, or a sponsor’s prize draw. One bracket can enter as many challenges as you like.' },
  { n: 3, title: 'Score all tournament', detail: 'As results come in, correct picks earn points — worth more in later rounds — and your name climbs the live leaderboard.' },
]

// 32 → 1 funnel for the "predict the whole path" visual.
const PATH = [
  { label: 'R32', teams: 32 }, { label: 'R16', teams: 16 }, { label: 'QF', teams: 8 },
  { label: 'SF', teams: 4 }, { label: 'Final', teams: 2 }, { label: '🏆', teams: 1 },
]

const FAQS = [
  { q: 'Do I have to enter to be on the leaderboard?', a: 'Yes — building a bracket isn’t enough. You must enter a challenge to appear on its leaderboard. The good news: one bracket can enter many challenges.' },
  { q: 'When do my picks lock?', a: 'Each match locks at its own kick-off — you can edit that pick right up until the match starts. Once a result is in, the winner carries forward so you can keep building. New entries stay open all the way until the semi-finals.' },
  { q: 'Can I change my bracket after entering?', a: 'Yes. Edit any pick or tie-breaker until that match kicks off — changes apply to every challenge you’ve entered, automatically.' },
  { q: 'What if my champion gets knocked out?', a: 'You keep every point you’ve already banked from correct earlier-round picks. Only future picks that involve the eliminated team miss out.' },
  { q: 'What about penalty shootouts?', a: 'You’re picking who advances, so the shootout winner is the correct pick. (This is different from the main prediction game, where a penalty shootout scores as a draw.)' },
  { q: 'Is it free?', a: 'Yes — the Global Bracket Challenge is free, and sponsor challenges are free to enter too. A sponsor simply puts up a prize for their challenge.' },
  { q: 'Can I be in more than one challenge?', a: 'Absolutely — one bracket, many draws. Enter the Global Bracket Challenge and any sponsor challenge with the very same bracket.' },
  { q: 'How are ties broken?', a: 'By your predicted total goals in the Final, then the 3rd-place match, then earliest entry.' },
]

export default function BracketHowItWorksPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Hero */}
      <div className="flex items-center gap-2 mb-1">
        <h1 className="text-lg font-semibold text-gray-900">🏆 The Bracket Challenge</h1>
        <span className="text-[11px] font-semibold px-2 py-0.5 bg-green-100 text-green-700 rounded-full">WC 2026</span>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Predict the entire knockout path — from the Round of 32 all the way to the champion — and score points as
        the tournament unfolds. Build one bracket, enter as many challenges as you like, and climb the live leaderboard.
      </p>

      {/* How to play */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">How to play</h2>
        <div className="space-y-2.5">
          {STEPS.map(s => (
            <div key={s.n} className="flex items-start gap-3 bg-white rounded-xl border border-gray-200 px-4 py-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-600 text-white text-sm font-bold flex items-center justify-center">{s.n}</span>
              <div>
                <p className="text-sm font-bold text-gray-900">{s.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.detail}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[12px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mt-3">
          💡 <strong>Building your bracket doesn’t put you on the leaderboard on its own</strong> — you have to <strong>enter a challenge</strong> with it. One bracket can enter several.
        </p>
      </section>

      {/* Predict the path */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Predict the whole path</h2>
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-4">
          <div className="flex items-center justify-between gap-1">
            {PATH.map((p, i) => (
              <div key={p.label} className="flex items-center gap-1 min-w-0">
                <div className="text-center">
                  <div className="text-sm font-black text-gray-900">{p.teams}</div>
                  <div className="text-[10px] text-gray-400 font-semibold">{p.label}</div>
                </div>
                {i < PATH.length - 1 && <span className="text-gray-300">→</span>}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-3">32 teams, one champion. You call every winner along the way — plus the 3rd-place play-off.</p>
        </div>
      </section>

      {/* Scoring */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Scoring — 80 points up for grabs</h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-[1fr_64px_64px_56px] text-[10px] font-semibold text-gray-500 uppercase tracking-wide px-4 py-2 bg-gray-50 border-b border-gray-200">
            <span>Round</span>
            <div className="text-right">Pts each</div>
            <div className="text-right">Matches</div>
            <div className="text-right text-green-700">Total</div>
          </div>
          {SCORING.map(r => (
            <div key={r.round} className={`grid grid-cols-[1fr_64px_64px_56px] items-center px-4 py-3 border-b border-gray-100 last:border-0 ${r.highlight ? 'bg-amber-50' : ''}`}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-800">{r.round}</span>
                {r.badge && <span className="text-sm">{r.badge}</span>}
              </div>
              <div className="text-right text-sm font-semibold text-gray-700">{r.each}</div>
              <div className="text-right text-sm text-gray-500">{r.matches}</div>
              <div className="text-right text-sm font-bold text-green-700">{r.total}</div>
            </div>
          ))}
          <div className="grid grid-cols-[1fr_64px_64px_56px] px-4 py-2.5 bg-gray-50 border-t border-gray-200">
            <span className="text-sm font-bold text-gray-900">Maximum</span>
            <span /><span />
            <div className="text-right text-sm font-black text-green-700">{MAX}</div>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Later rounds are worth more — calling the <strong>champion</strong> alone is worth <strong>12 pts</strong>. A wrong pick simply scores 0;
          there’s no penalty. And if your champion is knocked out, you <strong>keep every point</strong> you’ve already earned.
        </p>
      </section>

      {/* Tie-breakers */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Tie-breakers</h2>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-gray-700">
          Level on points? You’re separated by your predicted <strong>total goals in the Final</strong>, then the
          <strong> 3rd-place match</strong>, then who entered earliest. You set both goal totals when you enter — count goals up to
          the end of extra time (penalty shootouts don’t count).
        </div>
      </section>

      {/* Prizes & sponsors */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Prizes &amp; sponsors</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm text-gray-700 space-y-2">
          <p>The <strong>Global Bracket Challenge</strong> is the leaderboard for everyone — free to play.</p>
          <p><strong>Sponsor challenges</strong> are branded prize draws you enter with the same bracket — a sponsor puts up the prize, and the challenge gets its own co-branded leaderboard.</p>
          <p className="text-[13px] text-gray-500">Want your brand on a challenge? See <a href="/sponsor" className="text-emerald-700 font-semibold underline">tribepicks.com/sponsor</a>.</p>
        </div>
      </section>

      {/* FAQ */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">FAQ</h2>
        <div className="space-y-2">
          {FAQS.map(f => (
            <details key={f.q} className="group bg-white rounded-xl border border-gray-200 px-4 py-3">
              <summary className="text-sm font-semibold text-gray-900 cursor-pointer list-none flex items-center justify-between gap-2">
                {f.q}
                <span className="text-gray-400 group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <p className="text-sm text-gray-600 mt-2">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <Link href="/bracket" className="block text-center px-4 py-3 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white">
        Build your bracket →
      </Link>
    </div>
  )
}
