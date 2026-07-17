import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase'
import { JsonLd } from '@/components/seo/JsonLd'
import { faqJsonLd } from '@/lib/seo'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Premier League 2026/27 — scoring rules & how to play | TribePicks',
  description: 'How the TribePicks Premier League 2026/27 game works: tip Home/Draw/Away every matchweek, pick a bonus team for an exact-score focus pick, and predict the top 5 & bottom 3 in the season-long Table Predictor. Free to play.',
  alternates: { canonical: 'https://tribepicks.com/rules/epl-2026-27' },
}

// Scoring values come straight from tournament_rounds (the scoring trigger's source of
// truth), so the rules always match live scoring. EPL rounds are uniform, so one row
// tells the whole story.
async function loadScoring() {
  const fallback = { result_pts: 3, fav_exact_bonus: 3 }
  try {
    const admin = createAdminClient()
    const { data: t } = await (admin as any).from('tournaments').select('id').eq('slug', 'epl-2026-27').single()
    if (!t) return fallback
    const { data: r } = await (admin as any).from('tournament_rounds')
      .select('result_pts, fav_exact_bonus').eq('tournament_id', t.id).order('round_order').limit(1).maybeSingle()
    return { result_pts: r?.result_pts ?? 3, fav_exact_bonus: r?.fav_exact_bonus ?? 3 }
  } catch { return fallback }
}

const FAQS = [
  { q: 'When do my tips lock?', a: 'Each match locks at kick-off. You can edit any pick right up until then. New matchweeks open for tipping in advance.' },
  { q: 'What if I don’t tip a match?', a: 'Untipped matches score 0 — there’s no default. Blank means nothing, so get your picks in before kick-off.' },
  { q: 'How does the bonus team / focus pick work?', a: 'Pick one bonus team. For that team’s match each week you predict the exact score instead of just the result — nail it and you bank bonus points on top of the result points. Your other nine picks stay simple Home/Draw/Away.' },
  { q: 'Do I have to predict exact scores for every game?', a: 'No — only for your bonus team’s match (and only if you want the bonus). Every other game is a quick Home/Draw/Away, so a full matchweek takes seconds.' },
  { q: 'What is the Table Predictor?', a: 'A separate season-long game: predict which 5 clubs finish top and which 3 finish bottom of the table, at four checkpoints through the season. You score for every club you place in the right bucket, and you can join any quarter.' },
  { q: 'Can I join partway through the season?', a: 'Yes. Matchweek tips score from whenever you start, and the Table Predictor is split into four independently-scored quarters — so a mid-season joiner is never out of it.' },
  { q: 'Is it free?', a: 'Completely. Tipping, the Table Predictor, joining comps and entering challenges are all free — no stake, no gambling.' },
  { q: 'How are leaderboard ties broken?', a: 'By bonus points earned, then total correct results, then alphabetically.' },
]

export default async function EplRulesPage() {
  const { result_pts, fav_exact_bonus } = await loadScoring()

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <JsonLd data={faqJsonLd(FAQS)} />
      <div className="flex items-center gap-2 mb-1">
        <h1 className="text-lg font-semibold text-gray-900">How to play</h1>
        <span className="text-[11px] font-semibold px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Premier League 2026/27</span>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Two ways to score all season: tip <strong>Home, Draw or Away</strong> on every matchweek, and predict the <strong>top 5 &amp; bottom 3</strong> of the table in the Table Predictor. Pick a bonus team for an exact-score focus pick. Free to play — no betting.
      </p>

      {/* Matchweek scoring */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Matchweek tipping ⚽</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-700">
            Every matchweek, pick the result of all 10 games — just <span className="font-medium text-blue-600">Home (1)</span>, <span className="font-medium text-blue-600">Draw (X)</span> or <span className="font-medium text-blue-600">Away (2)</span>. Quick to play, so you never fall behind.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
              <p className="text-2xl font-black text-green-700">{result_pts}</p>
              <p className="text-[11px] text-green-800 font-semibold mt-0.5">pts · correct result</p>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-center">
              <p className="text-2xl font-black text-purple-700">+{fav_exact_bonus}</p>
              <p className="text-[11px] text-purple-800 font-semibold mt-0.5">bonus · exact focus pick</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3">Wrong result → 0 pts. Untipped match → 0 pts.</p>
        </div>
      </section>

      {/* Focus pick */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Bonus team · focus pick ⭐</h2>
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <p className="text-sm text-gray-700 mb-3">
            Pick one <strong className="text-purple-700">bonus team</strong>. For that team’s match each week you don’t just pick the result — you predict the <strong>exact score</strong>. Get it spot on and you earn <strong className="text-purple-700">+{fav_exact_bonus} bonus points</strong> on top of the {result_pts} for the result. It rewards knowing your own club, without asking you to score-predict all 10 games.
          </p>
          <div className="space-y-2">
            {[
              { pred: '2–1', result: '2–1', note: `Exact score → ${result_pts} + ${fav_exact_bonus} = ${result_pts + fav_exact_bonus} pts`, good: true },
              { pred: '2–1', result: '3–0', note: `Right result (home win), wrong score → ${result_pts} pts`, good: false },
              { pred: '2–1', result: '0–1', note: 'Wrong result → 0 pts', good: false },
            ].map(ex => (
              <div key={ex.pred + ex.result} className="flex items-start gap-3 bg-white rounded-lg border border-purple-100 px-3 py-2">
                <span className="text-base flex-shrink-0">{ex.good ? '✅' : '➖'}</span>
                <div>
                  <p className="text-xs font-medium text-gray-800">Predict <strong>{ex.pred}</strong> · Result <strong>{ex.result}</strong></p>
                  <p className="text-xs text-gray-500 mt-0.5">{ex.note}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-3">You can change your bonus team on the My Tips page any time before the season starts.</p>
        </div>
      </section>

      {/* Table Predictor */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Table Predictor 🪜</h2>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <p className="text-sm text-gray-700 mb-3">
            A season-long game running alongside your matchweek tips. Predict which <strong>5 clubs finish top</strong> and which <strong>3 finish bottom</strong> of the table — at <strong>four checkpoints</strong> through the season. You score for every club you place in the right bucket.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {[['Q1', 'after MW9'], ['Q2', 'after MW19'], ['Q3', 'after MW28'], ['Q4', 'after MW38']].map(([q, mw]) => (
              <div key={q} className="rounded-lg border border-emerald-200 bg-white px-2 py-2 text-center">
                <p className="text-sm font-black text-emerald-700">{q}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">{mw}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500">Each quarter is scored on its own, so you can join at Q2, Q3 or Q4 and still win it. Points add up into one season leaderboard.</p>
        </div>
      </section>

      {/* Comps & Tribes */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Comps &amp; Tribes</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          {[
            { icon: '👥', text: 'Join or create a comp for your mates, workplace or group chat — everyone tips once and competes on your own leaderboard.' },
            { icon: '🏆', text: 'Your tribe has its own private leaderboard, updated as results come in.' },
            { icon: '💬', text: 'Chat with your tribe — trash talk, predictions and reactions.' },
            { icon: '🎯', text: 'Enter sponsored match challenges for the biggest fixtures, often with real prizes — free to enter.' },
          ].map(item => (
            <div key={item.icon} className="flex gap-3 items-start">
              <span className="text-base flex-shrink-0">{item.icon}</span>
              <p className="text-sm text-gray-600">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">FAQ</h2>
        <div className="space-y-3">
          {FAQS.map(faq => (
            <div key={faq.q} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm font-medium text-gray-800 mb-1">{faq.q}</p>
              <p className="text-sm text-gray-500">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
