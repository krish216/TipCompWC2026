import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTournamentBySlug, getPublicTournaments, getTeamsAndFixtures, groupLetters, standingsFor } from '@/lib/content/wc'

export const revalidate = 1800

export async function generateStaticParams() {
  const ts = await getPublicTournaments()
  return ts.map(t => ({ tournament: t.slug }))
}

export async function generateMetadata({ params }: { params: { tournament: string } }): Promise<Metadata> {
  const t = await getTournamentBySlug(params.tournament)
  if (!t) return { title: 'Groups | TribePicks' }
  return {
    title: `${t.name} Groups — tables, standings & fixtures | TribePicks`,
    description: `All groups at ${t.name} with live tables, standings and fixtures. See who tops each group and who advances, then play free on TribePicks.`,
    alternates: { canonical: `https://tribepicks.com/${t.slug}/groups` },
  }
}

export default async function GroupsPage({ params }: { params: { tournament: string } }) {
  const t = await getTournamentBySlug(params.tournament)
  if (!t) notFound()
  const { teams, fixtures } = await getTeamsAndFixtures(t.id)
  const groups = groupLetters(teams)
  if (!groups.length) notFound()   // group-less formats (e.g. a league) have no group pages
  const base = `/${t.slug}`

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <nav className="text-xs text-gray-400 mb-3">
        <Link href="/" className="hover:text-gray-600">Home</Link> <span className="mx-1">/</span> {t.name} Groups
      </nav>
      <h1 className="text-2xl sm:text-3xl font-black text-gray-900">{t.name} Groups &amp; Tables</h1>
      <p className="mt-3 text-sm text-gray-600 leading-relaxed">
        The {t.name} group stage spans <strong>{groups.length} groups</strong>. Tap any group below for its
        full table, fixtures and results — and each team&apos;s profile.
      </p>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {groups.map(g => {
          const table = standingsFor(g, teams, fixtures)
          return (
            <Link key={g} href={`${base}/groups/${g.toLowerCase()}`}
              className="block rounded-2xl border border-gray-200 bg-white p-4 hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors">
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="text-base font-bold text-gray-900">Group {g}</h2>
                <span className="text-xs font-semibold text-emerald-700">View →</span>
              </div>
              <ol className="space-y-1">
                {table.map((r, i) => (
                  <li key={r.team} className="flex items-center justify-between text-sm">
                    <span className="truncate"><span className="text-gray-400 mr-1.5">{i + 1}</span>{r.flag} {r.team}</span>
                    <span className="text-gray-500 font-semibold tabular-nums">{r.points}</span>
                  </li>
                ))}
              </ol>
            </Link>
          )
        })}
      </div>

      <div className="mt-10 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5 text-center">
        <p className="text-sm font-bold text-emerald-900">Know who&apos;s going through?</p>
        <p className="text-xs text-emerald-700 mt-1 mb-3">Predict the whole knockout bracket to the final.</p>
        <Link href="/bracket" className="inline-block px-5 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white">🏆 Play free</Link>
      </div>
    </main>
  )
}
