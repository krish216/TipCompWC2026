import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  getTournamentBySlug, getPublicTournaments, getTeamsAndFixtures, getPickStats,
  playedRounds, buildRoundRecap, roundSlug, roundFromSlug,
  type RecapFixture,
} from '@/lib/content/wc'

export const revalidate = 1800

export async function generateStaticParams() {
  const ts = await getPublicTournaments()
  const out: { tournament: string; round: string }[] = []
  for (const t of ts) {
    const { fixtures } = await getTeamsAndFixtures(t.id)
    for (const r of playedRounds(fixtures)) out.push({ tournament: t.slug, round: roundSlug(r) })
  }
  return out
}

async function load(slug: string, roundParam: string) {
  const t = await getTournamentBySlug(slug)
  if (!t) return null
  const code = roundFromSlug(roundParam)
  const { teams, fixtures } = await getTeamsAndFixtures(t.id)
  if (!playedRounds(fixtures).includes(code)) return null
  const fixtureIds = fixtures.filter(f => f.round === code).map(f => f.id)
  const picks = await getPickStats(fixtureIds)
  return { t, recap: buildRoundRecap(code, teams, fixtures, picks) }
}

export async function generateMetadata({ params }: { params: { tournament: string; round: string } }): Promise<Metadata> {
  const data = await load(params.tournament, params.round)
  if (!data) return { title: 'Round recap | TribePicks' }
  const { t, recap } = data
  return {
    title: `${t.name} ${recap.round_name} — results, recap & how fans tipped | TribePicks`,
    description: `${recap.round_name} at ${t.name}: all ${recap.played} results, ${recap.totalGoals} goals, the biggest upsets and how the field tipped each match. Predict the next round on TribePicks.`,
    alternates: { canonical: `https://tribepicks.com/${t.slug}/recaps/${roundSlug(recap.round_code)}` },
  }
}

function Scoreline({ f }: { f: RecapFixture }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{f.homeFlag} {f.home}</span>
      <strong className="mx-0.5">{f.home_score}–{f.away_score}</strong>
      <span>{f.awayFlag} {f.away}</span>
      {f.pen_winner && <span className="text-[11px] text-gray-400">({f.pen_winner} on pens)</span>}
    </span>
  )
}

export default async function RecapPage({ params }: { params: { tournament: string; round: string } }) {
  const data = await load(params.tournament, params.round)
  if (!data) notFound()
  const { t, recap } = data
  const avg = recap.played ? (recap.totalGoals / recap.played).toFixed(1) : '0'

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <nav className="text-xs text-gray-400 mb-3">
        <Link href="/" className="hover:text-gray-600">Home</Link> <span className="mx-1">/</span>
        <Link href={`/${t.slug}/recaps`} className="hover:text-gray-600">{t.name} Recaps</Link> <span className="mx-1">/</span> {recap.round_name}
      </nav>

      <h1 className="text-2xl sm:text-3xl font-black text-gray-900">{t.name}: {recap.round_name} recap</h1>
      <p className="mt-3 text-sm text-gray-600 leading-relaxed">
        The {recap.round_name} of {t.name} served up <strong>{recap.played} matches</strong> and
        <strong> {recap.totalGoals} goals</strong> ({avg} per game).
        {recap.upsets.length > 0
          ? ` And the crowd didn't see all of it coming — ${recap.upsets.length} result${recap.upsets.length === 1 ? '' : 's'} went against the way most fans tipped.`
          : ' The favourites largely held serve this time.'}
      </p>

      {/* Against the crowd */}
      {recap.upsets.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold text-gray-900 mb-2">😱 Against the crowd</h2>
          <ul className="space-y-2">
            {recap.upsets.slice(0, 5).map(u => (
              <li key={u.fx.id} className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
                <p className="text-sm font-semibold text-gray-900"><Scoreline f={u.fx} /></p>
                <p className="text-xs text-amber-800 mt-1">{u.note}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* All results + how fans tipped */}
      <section className="mt-8">
        <h2 className="text-lg font-bold text-gray-900 mb-2">All results — and how fans tipped</h2>
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
          {recap.results.map(f => {
            const c = f.crowd
            const pct = c && c.total > 0
              ? { h: Math.round((c.h / c.total) * 100), d: Math.round((c.d / c.total) * 100), a: Math.round((c.a / c.total) * 100) }
              : null
            return (
              <li key={f.id} className="px-4 py-3 bg-white">
                <p className="text-sm text-gray-900"><Scoreline f={f} /></p>
                {pct ? (
                  <p className="text-[11px] text-gray-500 mt-1">
                    Fans tipped: <strong>{f.home}</strong> {pct.h}% · Draw {pct.d}% · <strong>{f.away}</strong> {pct.a}%
                    <span className="text-gray-400"> ({c!.total.toLocaleString()} tips)</span>
                  </p>
                ) : (
                  <p className="text-[11px] text-gray-400 mt-1">Not enough tips to show the split.</p>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {recap.topMatch && (
        <p className="mt-6 text-sm text-gray-600">
          <strong>Match of the round:</strong> <Scoreline f={recap.topMatch} /> — {recap.topMatch.home_score + recap.topMatch.away_score} goals.
        </p>
      )}

      <div className="mt-10 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5 text-center">
        <p className="text-sm font-bold text-emerald-900">Fancy your chances next round?</p>
        <p className="text-xs text-emerald-700 mt-1 mb-3">Make your picks — free to play, no account needed to start.</p>
        <Link href="/bracket" className="inline-block px-5 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white">🏆 Play free</Link>
      </div>

      <p className="mt-6 text-xs text-gray-400"><Link href={`/${t.slug}/recaps`} className="hover:text-gray-600">← All {t.name} recaps</Link></p>
    </main>
  )
}
