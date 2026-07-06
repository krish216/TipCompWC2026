import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTournamentBySlug, getPublicTournaments, getTeamsAndFixtures, groupLetters, reachedKnockouts, ordinal } from '@/lib/content/wc'

export const revalidate = 1800

export async function generateStaticParams() {
  const ts = await getPublicTournaments()
  return ts.map(t => ({ tournament: t.slug }))
}

export async function generateMetadata({ params }: { params: { tournament: string } }): Promise<Metadata> {
  const t = await getTournamentBySlug(params.tournament)
  if (!t) return { title: 'Teams | TribePicks' }
  return {
    title: `${t.name} Teams — squads, groups & rankings | TribePicks`,
    description: `Browse every team at ${t.name}: group, ranking, fixtures, results and knockout progress. Play free and predict the winners on TribePicks.`,
    alternates: { canonical: `https://tribepicks.com/${t.slug}/teams` },
  }
}

export default async function TeamsPage({ params }: { params: { tournament: string } }) {
  const t = await getTournamentBySlug(params.tournament)
  if (!t) notFound()
  const { teams, fixtures } = await getTeamsAndFixtures(t.id)
  if (!teams.length) notFound()
  const groups = groupLetters(teams)
  const qualified = teams.filter(tm => reachedKnockouts(tm.name, fixtures)).length
  const base = `/${t.slug}`

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <nav className="text-xs text-gray-400 mb-3">
        <Link href="/" className="hover:text-gray-600">Home</Link> <span className="mx-1">/</span> {t.name} Teams
      </nav>

      <h1 className="text-2xl sm:text-3xl font-black text-gray-900">{t.name} Teams</h1>
      <p className="mt-3 text-sm text-gray-600 leading-relaxed">
        All <strong>{teams.length} teams</strong> at {t.name}
        {groups.length > 0 && <> across {groups.length} groups</>}. Below you&apos;ll find every team
        {groups.length > 0 && <> sorted into its group</>}, with current ranking and a link to each
        team&apos;s full profile: fixtures, results, form and progress.
        {qualified > 0 && <> So far <strong>{qualified}</strong> teams have reached the knockout stage.</>}
      </p>
      <p className="mt-2 text-sm text-gray-600 leading-relaxed">
        Think you can call the winner? <Link href="/bracket" className="text-emerald-700 font-semibold underline">Play free</Link> and
        predict your way to the final.
      </p>

      {groups.length > 0 ? groups.map(g => {
        const inGroup = teams.filter(tm => tm.group === g)
        return (
          <section key={g} className="mt-7">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-bold text-gray-900">Group {g}</h2>
              <Link href={`${base}/groups/${g.toLowerCase()}`} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800">Group {g} table &amp; fixtures →</Link>
            </div>
            <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {inGroup.map(tm => <TeamRow key={tm.code} base={base} tm={tm} qualified={reachedKnockouts(tm.name, fixtures)} />)}
            </ul>
          </section>
        )
      }) : (
        <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {teams.map(tm => <TeamRow key={tm.code} base={base} tm={tm} qualified={reachedKnockouts(tm.name, fixtures)} />)}
        </ul>
      )}

      <div className="mt-10 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5 text-center">
        <p className="text-sm font-bold text-emerald-900">Who comes out on top?</p>
        <p className="text-xs text-emerald-700 mt-1 mb-3">Make your picks — no account needed to start.</p>
        <Link href="/bracket" className="inline-block px-5 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white">🏆 Play free</Link>
      </div>
    </main>
  )
}

function TeamRow({ base, tm, qualified }: { base: string; tm: { code: string; name: string; flag: string; rank: number | null }; qualified: boolean }) {
  return (
    <li>
      <Link href={`${base}/teams/${tm.code}`}
        className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 hover:border-emerald-300 hover:bg-emerald-50/40 transition-colors">
        <span className="text-2xl leading-none">{tm.flag}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-gray-900 truncate">{tm.name}</span>
          {tm.rank != null && <span className="block text-[11px] text-gray-500">Ranked {ordinal(tm.rank)}</span>}
        </span>
        {qualified && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 rounded-full px-1.5 py-0.5">KO</span>}
      </Link>
    </li>
  )
}
