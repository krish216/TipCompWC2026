import Link from 'next/link'
import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase'

export const revalidate = 900

const SLUG = 'epl-2026-27'
const PREDICTOR = `/${SLUG}/predictor`

async function getEpl() {
  try {
    const admin = createAdminClient()
    const { data } = await (admin.from('tournaments') as any)
      .select('name, slug, enrollment_open').eq('slug', SLUG).maybeSingle()
    return data as { name: string; slug: string; enrollment_open: boolean } | null
  } catch { return null }
}

export const metadata: Metadata = {
  title: 'Premier League 2026/27 Predictor — free to play | TribePicks',
  description: 'Predict the Premier League table, tip every matchweek, and climb a season-long leaderboard. Free to play — call the top 5 and bottom 3 at four checkpoints, and tip every matchweek where points rise each quarter (1→4) so a slow start is never fatal. No betting, no money.',
  alternates: { canonical: 'https://tribepicks.com/epl' },
  openGraph: {
    title: 'Premier League 2026/27 Predictor — free to play',
    description: 'Predict the table, tip every matchweek, climb the season leaderboard. Free to play on TribePicks.',
    url: 'https://tribepicks.com/epl',
    type: 'website',
  },
}

const WAYS = [
  { icon: '🪜', title: 'Table Predictor', body: 'Call the top 5 and bottom 3 of the Premier League at four checkpoints through the season. Join any quarter — start late and you\'re still in the running.' },
  { icon: '⚽', title: 'Matchweek tipping', body: 'Pick Home, Draw or Away on all 10 games each week — quick to play. Your bonus team\'s match unlocks an exact-score “focus pick” for extra points.' },
  { icon: '🆚', title: 'Match challenges', body: 'One-off score-prediction challenges on the biggest fixtures — many with sponsor prizes, all free to enter.' },
]

const CHECKPOINTS = [
  { q: 'Q1', mw: 'after MW9' },
  { q: 'Q2', mw: 'after MW19' },
  { q: 'Q3', mw: 'after MW28' },
  { q: 'Q4', mw: 'after MW38' },
]

// Matchweek points climb each quarter (mirrors the Predictor checkpoints) — a slow start
// isn't fatal, and the run-in matters most. Values track tournament_rounds.result_pts.
const SCORE_TIERS = [
  { q: 'Q1', mw: 'MW1–9', pts: '1 pt' },
  { q: 'Q2', mw: 'MW10–19', pts: '2 pts' },
  { q: 'Q3', mw: 'MW20–28', pts: '3 pts' },
  { q: 'Q4', mw: 'MW29–38', pts: '4 pts' },
]

export default async function EplLanding() {
  const epl = await getEpl()
  const open = epl?.enrollment_open === true
  const ctaLabel = open ? 'Play the predictor →' : 'Preview the predictor →'

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 pb-20">
      {/* Hero */}
      <section className="rounded-3xl overflow-hidden shadow-lg" style={{ background: 'linear-gradient(160deg,#052e1c 0%,#0b3d27 55%,#04231a 100%)' }}>
        <div className="px-6 py-10 sm:px-10 sm:py-12 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-emerald-300">Premier League 2026/27</p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-black text-white leading-tight">The Premier League Predictor</h1>
          <p className="mt-3 text-sm sm:text-base text-white/75 max-w-xl mx-auto leading-relaxed">
            Predict the table, tip every matchweek, and climb a season-long leaderboard against friends and fans. Free to play — no betting, no money.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href={PREDICTOR} className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold px-6 py-3 rounded-xl transition-colors">{ctaLabel}</Link>
            <Link href="/challenges" className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white text-sm font-bold px-6 py-3 rounded-xl transition-colors">See all challenges</Link>
          </div>
          <p className="mt-4 text-xs text-emerald-200/80">
            {open ? '✅ Enrolment open — join any quarter, free to play' : '🔒 Enrolment opens right after the World Cup final — get your squad ready'}
          </p>
        </div>
      </section>

      {/* Three ways to play */}
      <section className="mt-10">
        <h2 className="text-xl font-black text-gray-900 text-center">Three ways to play</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {WAYS.map(w => (
            <div key={w.title} className="rounded-2xl border border-gray-200 bg-white px-4 py-5">
              <div className="text-3xl">{w.icon}</div>
              <p className="mt-2 text-sm font-bold text-gray-900">{w.title}</p>
              <p className="mt-1 text-[13px] text-gray-600 leading-relaxed">{w.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Table Predictor — the flagship */}
      <section className="mt-10 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white px-5 py-6 sm:px-7">
        <h2 className="text-lg font-black text-gray-900">🪜 How the Table Predictor works</h2>
        <p className="mt-2 text-sm text-gray-700 leading-relaxed">
          A 38-week season is a long time to wait for one result. So the Premier League Table Predictor is split into <strong>four quarters</strong>, each with its own deadline and its own points. At every checkpoint you predict which five clubs finish <strong>top</strong> and which three finish <strong>bottom</strong> of the table at that point — and you score for every club you place in the right bucket.
        </p>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {CHECKPOINTS.map(c => (
            <div key={c.q} className="rounded-xl border border-emerald-200 bg-white px-3 py-3 text-center">
              <p className="text-sm font-black text-emerald-700">{c.q}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">locks {c.mw}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-gray-700 leading-relaxed">
          Because each quarter is scored on its own, a mid-season joiner is never out of it — you can jump in at Q2, Q3 or Q4 and still win that quarter. Points add up across the season into one overall leaderboard.
        </p>
      </section>

      {/* Matchweek + focus pick */}
      <section className="mt-8 rounded-2xl border border-gray-200 bg-white px-5 py-6 sm:px-7">
        <h2 className="text-lg font-black text-gray-900">⚽ Tip every matchweek</h2>
        <p className="mt-2 text-sm text-gray-700 leading-relaxed">
          Alongside the table prediction, tip all 10 matches each week — just pick Home, Draw or Away, so it takes seconds. Get the result right and you score; simple and quick, so casual fans stay in the mix all season.
        </p>
        <p className="mt-3 text-sm text-gray-700 leading-relaxed">
          Here&apos;s the twist: <strong>a correct tip is worth more the deeper into the season you go.</strong> Points climb each quarter — mirroring the Table Predictor checkpoints — so a slow start never buries you, and the run-in is where titles are won.
        </p>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SCORE_TIERS.map(t => (
            <div key={t.q} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-center">
              <p className="text-lg font-black text-emerald-700">{t.pts}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">{t.mw}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-gray-400 text-center">per correct Home / Draw / Away result</p>
        <p className="mt-4 text-sm text-gray-700 leading-relaxed">
          Want an edge? Choose a <strong>bonus team</strong> — usually the club you support, since you know them best. For your bonus team&apos;s match each week you don&apos;t just pick the result — you predict the <strong>exact score</strong>. Nail it and you bank bonus points.
        </p>
        <p className="mt-2 text-sm text-gray-600 leading-relaxed">
          <span className="font-semibold text-gray-700">For example:</span> a Liverpool fan sets Liverpool as their bonus team. Each week they call the <em>exact</em> Liverpool scoreline — say <strong>2–1</strong> — on top of the quick Home/Draw/Away pick on the other nine games. It rewards knowing your own club inside out, without asking you to score-predict all 10 matches.
        </p>
      </section>

      {/* Why join */}
      <section className="mt-8">
        <h2 className="text-lg font-black text-gray-900 text-center">Why play on TribePicks</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {[
            ['🆓', 'Completely free', 'Every game mode is free to play. No stake, no gambling — just bragging rights and prizes.'],
            ['👥', 'Play with your tribe', 'Set up a private comp for your mates, workplace or group chat and battle it out on your own leaderboard.'],
            ['🏆', 'Sponsor prizes', 'Selected match challenges put up real prizes from sponsors — free to enter.'],
            ['📅', 'Never too late', 'Quarter-based scoring means you can join mid-season and still compete for silverware.'],
          ].map(([icon, title, body]) => (
            <li key={title} className="flex gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
              <span className="text-2xl flex-shrink-0">{icon}</span>
              <span><span className="block text-sm font-bold text-gray-900">{title}</span><span className="block text-[13px] text-gray-600 leading-snug mt-0.5">{body}</span></span>
            </li>
          ))}
        </ul>
      </section>

      {/* Final CTA */}
      <section className="mt-10 rounded-2xl bg-emerald-600 px-6 py-8 text-center">
        <p className="text-lg font-black text-white">Ready for 2026/27?</p>
        <p className="text-sm text-emerald-50/90 mt-1 mb-4">
          {open ? 'Make your first prediction now — it\'s free.' : 'Preview the predictor now, and enrol the moment the World Cup wraps.'}
        </p>
        <Link href={PREDICTOR} className="inline-block bg-white text-emerald-700 hover:bg-emerald-50 text-sm font-bold px-6 py-3 rounded-xl transition-colors">{ctaLabel}</Link>
        <p className="mt-4 text-[11px] text-emerald-100/80">Free-to-play football prediction game · no real-money betting · tribepicks.com</p>
      </section>
    </main>
  )
}
