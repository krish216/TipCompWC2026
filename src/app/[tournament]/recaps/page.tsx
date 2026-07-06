import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTournamentBySlug, getPublicTournaments, getTeamsAndFixtures, playedRounds, roundSlug, ROUND_LABEL } from '@/lib/content/wc'

export const revalidate = 1800

export async function generateStaticParams() {
  const ts = await getPublicTournaments()
  return ts.map(t => ({ tournament: t.slug }))
}

export async function generateMetadata({ params }: { params: { tournament: string } }): Promise<Metadata> {
  const t = await getTournamentBySlug(params.tournament)
  if (!t) return { title: 'Recaps | TribePicks' }
  return {
    title: `${t.name} Round Recaps — results, upsets & how fans tipped | TribePicks`,
    description: `Round-by-round recaps of ${t.name}: results, biggest upsets, and how the field tipped every match. Play free and predict the next round on TribePicks.`,
    alternates: { canonical: `https://tribepicks.com/${t.slug}/recaps` },
  }
}

export default async function RecapsIndex({ params }: { params: { tournament: string } }) {
  const t = await getTournamentBySlug(params.tournament)
  if (!t) notFound()
  const { fixtures } = await getTeamsAndFixtures(t.id)
  const rounds = playedRounds(fixtures)

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <nav className="text-xs text-gray-400 mb-3">
        <Link href="/" className="hover:text-gray-600">Home</Link> <span className="mx-1">/</span> {t.name} Recaps
      </nav>
      <h1 className="text-2xl sm:text-3xl font-black text-gray-900">{t.name} Round Recaps</h1>
      <p className="mt-3 text-sm text-gray-600 leading-relaxed">
        Round-by-round recaps of {t.name} — every result, the biggest upsets, and how the field tipped
        each match. New recaps drop as each round wraps up.
      </p>

      {rounds.length === 0 ? (
        <p className="mt-8 text-sm text-gray-500">No rounds have finished yet — check back once the action starts.</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {rounds.map(r => (
            <Link key={r} href={`/${t.slug}/recaps/${roundSlug(r)}`}
              className="block rounded-2xl border border-gray-200 bg-white p-4 hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors">
              <div className="flex items-baseline justify-between">
                <h2 className="text-base font-bold text-gray-900">{ROUND_LABEL[r] ?? r}</h2>
                <span className="text-xs font-semibold text-emerald-700">Read the recap →</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-10 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5 text-center">
        <p className="text-sm font-bold text-emerald-900">Think you can do better?</p>
        <p className="text-xs text-emerald-700 mt-1 mb-3">Predict the next round — free to play, no account needed to start.</p>
        <Link href="/bracket" className="inline-block px-5 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white">🏆 Play free</Link>
      </div>
    </main>
  )
}
