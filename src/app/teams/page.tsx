import Link from 'next/link'
import type { Metadata } from 'next'
import { getActiveTournament, getTeamsAndFixtures, groupLetters, reachedKnockouts, ordinal } from '@/lib/content/wc'

export const revalidate = 1800

export const metadata: Metadata = {
  title: 'World Cup 2026 Teams — all 48 nations, groups & FIFA rankings | TribePicks',
  description: 'Browse all 48 teams at the FIFA World Cup 2026: group, FIFA world ranking, fixtures, results and knockout progress for every nation. Build your bracket on TribePicks.',
  alternates: { canonical: 'https://tribepicks.com/teams' },
}

export default async function TeamsPage() {
  const t = await getActiveTournament()
  if (!t) return <Empty />
  const { teams, fixtures } = await getTeamsAndFixtures(t.id)
  const groups = groupLetters(teams)
  const qualified = teams.filter(tm => reachedKnockouts(tm.name, fixtures)).length

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <nav className="text-xs text-gray-400 mb-3">
        <Link href="/" className="hover:text-gray-600">Home</Link> <span className="mx-1">/</span> Teams
      </nav>

      <h1 className="text-2xl sm:text-3xl font-black text-gray-900">World Cup 2026 Teams</h1>
      <p className="mt-3 text-sm text-gray-600 leading-relaxed">
        All <strong>48 nations</strong> at the FIFA World Cup 2026 — the first World Cup to feature an
        expanded 48-team field across {groups.length} groups, co-hosted by the United States, Canada and
        Mexico. Below you&apos;ll find every team sorted into its group, with current FIFA world ranking and a
        link to each nation&apos;s full profile: fixtures, results, form and knockout progress.
        {qualified > 0 && <> So far <strong>{qualified}</strong> teams have booked their place in the Round of 32.</>}
      </p>
      <p className="mt-2 text-sm text-gray-600 leading-relaxed">
        Think you can call the winner? <Link href="/bracket" className="text-emerald-700 font-semibold underline">Build your free bracket</Link> and
        predict every knockout tie all the way to the Final.
      </p>

      {groups.map(g => {
        const inGroup = teams.filter(tm => tm.group === g)
        return (
          <section key={g} className="mt-7">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-bold text-gray-900">Group {g}</h2>
              <Link href={`/groups/${g.toLowerCase()}`} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800">Group {g} table &amp; fixtures →</Link>
            </div>
            <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {inGroup.map(tm => (
                <li key={tm.code}>
                  <Link href={`/teams/${tm.code}`}
                    className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 hover:border-emerald-300 hover:bg-emerald-50/40 transition-colors">
                    <span className="text-2xl leading-none">{tm.flag}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-gray-900 truncate">{tm.name}</span>
                      {tm.rank != null && <span className="block text-[11px] text-gray-500">FIFA {ordinal(tm.rank)} in the world</span>}
                    </span>
                    {reachedKnockouts(tm.name, fixtures) && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 rounded-full px-1.5 py-0.5">R32</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      <div className="mt-10 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5 text-center">
        <p className="text-sm font-bold text-emerald-900">Who lifts the trophy?</p>
        <p className="text-xs text-emerald-700 mt-1 mb-3">Pick the winner of every knockout match — no account needed to start.</p>
        <Link href="/bracket" className="inline-block px-5 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white">🏆 Build your bracket</Link>
      </div>
    </main>
  )
}

function Empty() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-16 text-center">
      <h1 className="text-xl font-bold text-gray-900">Teams</h1>
      <p className="text-sm text-gray-500 mt-2">No active tournament right now — check back soon.</p>
    </main>
  )
}
