import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  getActiveTournament, getTeamsAndFixtures, groupLetters, standingsFor,
  fmtDate, fmtKick, ROUND_LABEL, type Team, type Fixture,
} from '@/lib/content/wc'

export const revalidate = 1800

export async function generateStaticParams() {
  const t = await getActiveTournament()
  if (!t) return []
  const { teams } = await getTeamsAndFixtures(t.id)
  return groupLetters(teams).map(g => ({ code: g.toLowerCase() }))
}

async function load(code: string): Promise<{ group: string; teams: Team[]; fixtures: Fixture[] } | null> {
  const t = await getActiveTournament()
  if (!t) return null
  const { teams, fixtures } = await getTeamsAndFixtures(t.id)
  const group = groupLetters(teams).find(g => g.toLowerCase() === code.toLowerCase())
  return group ? { group, teams, fixtures } : null
}

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const data = await load(params.code)
  if (!data) return { title: 'Group — World Cup 2026 | TribePicks' }
  const names = data.teams.filter(t => t.group === data.group).map(t => t.name).join(', ')
  return {
    title: `World Cup 2026 Group ${data.group} — table, fixtures & results | TribePicks`,
    description: `Group ${data.group} at the FIFA World Cup 2026: ${names}. Live table, standings, fixtures and results. Predict who advances on TribePicks.`,
    alternates: { canonical: `https://tribepicks.com/groups/${data.group.toLowerCase()}` },
  }
}

export default async function GroupPage({ params }: { params: { code: string } }) {
  const data = await load(params.code)
  if (!data) notFound()
  const { group, teams, fixtures } = data
  const table = standingsFor(group, teams, fixtures)
  const groupTeams = teams.filter(t => t.group === group)
  const codeOf = (name: string) => groupTeams.find(t => t.name === name)?.code
  const fxs = fixtures
    .filter(f => f.round.startsWith('gs') && f.grp === group)
    .sort((a, b) => (a.kickoff_utc ?? '').localeCompare(b.kickoff_utc ?? ''))
  const played = fxs.filter(f => f.home_score != null).length
  const complete = fxs.length > 0 && played === fxs.length

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <nav className="text-xs text-gray-400 mb-3">
        <Link href="/" className="hover:text-gray-600">Home</Link> <span className="mx-1">/</span>
        <Link href="/groups" className="hover:text-gray-600">Groups</Link> <span className="mx-1">/</span> Group {group}
      </nav>

      <h1 className="text-2xl sm:text-3xl font-black text-gray-900">World Cup 2026 — Group {group}</h1>
      <p className="mt-3 text-sm text-gray-600 leading-relaxed">
        Group {group} of the FIFA World Cup 2026 features {groupTeams.map((t, i) => (
          <span key={t.code}>
            {i > 0 && (i === groupTeams.length - 1 ? ' and ' : ', ')}
            <Link href={`/teams/${t.code}`} className="text-emerald-700 font-semibold underline">{t.name}</Link>
          </span>
        ))}. {complete
          ? `All ${fxs.length} group matches have been played — the top two (plus a possible best third-placed finish) carry on into the Round of 32.`
          : `The four nations play a single round-robin; the top two advance directly to the Round of 32, with third place still in with a shout via the best-third-placed spots.`}
      </p>

      {/* Standings */}
      <section className="mt-6">
        <h2 className="text-lg font-bold text-gray-900 mb-2">Group {group} table</h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase text-gray-400">
              <tr><th className="text-left px-3 py-2 font-semibold">Team</th><th className="px-2 py-2">P</th><th className="px-2 py-2">W</th><th className="px-2 py-2">D</th><th className="px-2 py-2">L</th><th className="px-2 py-2">GF</th><th className="px-2 py-2">GA</th><th className="px-2 py-2">GD</th><th className="px-2 py-2">Pts</th></tr>
            </thead>
            <tbody>
              {table.map((r, i) => {
                const code = codeOf(r.team)
                return (
                  <tr key={r.team} className={`border-t border-gray-100 ${i < 2 ? 'bg-emerald-50/40' : ''}`}>
                    <td className="px-3 py-2"><span className="text-gray-400 mr-1.5">{i + 1}</span>{r.flag} {code ? <Link href={`/teams/${code}`} className="hover:text-emerald-700 hover:underline">{r.team}</Link> : r.team}</td>
                    <td className="text-center px-2 py-2">{r.played}</td>
                    <td className="text-center px-2 py-2">{r.won}</td>
                    <td className="text-center px-2 py-2">{r.drawn}</td>
                    <td className="text-center px-2 py-2">{r.lost}</td>
                    <td className="text-center px-2 py-2">{r.gf}</td>
                    <td className="text-center px-2 py-2">{r.ga}</td>
                    <td className="text-center px-2 py-2">{r.gd > 0 ? '+' : ''}{r.gd}</td>
                    <td className="text-center px-2 py-2 font-bold">{r.points}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5">Top two (highlighted) advance to the Round of 32; third place can still qualify among the best third-placed teams.</p>
      </section>

      {/* Fixtures */}
      <section className="mt-8">
        <h2 className="text-lg font-bold text-gray-900 mb-2">Group {group} fixtures &amp; results</h2>
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
          {fxs.map(f => {
            const played = f.home_score != null && f.away_score != null
            return (
              <li key={f.id} className="flex items-center gap-2 px-3 py-2.5 bg-white text-sm">
                <span className="text-[10px] font-semibold text-gray-400 w-16 flex-shrink-0">{ROUND_LABEL[f.round] ?? f.round}</span>
                <span className="min-w-0 flex-1 text-right truncate">{f.home}</span>
                <span className="flex-shrink-0 font-bold w-14 text-center">{played ? `${f.home_score}–${f.away_score}` : 'v'}</span>
                <span className="min-w-0 flex-1 truncate">{f.away}</span>
              </li>
            )
          })}
        </ul>
        {fxs.some(f => f.home_score == null) && (
          <p className="text-[11px] text-gray-400 mt-1.5">Kick-off times shown in your local timezone on each match.</p>
        )}
      </section>

      <div className="mt-10 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5 text-center">
        <p className="text-sm font-bold text-emerald-900">Call the knockouts</p>
        <p className="text-xs text-emerald-700 mt-1 mb-3">Predict who escapes Group {group} and every tie to the Final — free to play.</p>
        <Link href="/bracket" className="inline-block px-5 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white">🏆 Build your bracket</Link>
      </div>

      <p className="mt-6 text-xs text-gray-400"><Link href="/groups" className="hover:text-gray-600">← All groups</Link></p>
    </main>
  )
}
