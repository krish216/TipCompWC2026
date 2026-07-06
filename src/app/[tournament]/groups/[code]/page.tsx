import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  getTournamentBySlug, getPublicTournaments, getTeamsAndFixtures, groupLetters, standingsFor,
  ROUND_LABEL, type Team, type Fixture, type TournamentRef,
} from '@/lib/content/wc'

export const revalidate = 1800

export async function generateStaticParams() {
  const ts = await getPublicTournaments()
  const out: { tournament: string; code: string }[] = []
  for (const t of ts) {
    const { teams } = await getTeamsAndFixtures(t.id)
    for (const g of groupLetters(teams)) out.push({ tournament: t.slug, code: g.toLowerCase() })
  }
  return out
}

async function load(slug: string, code: string): Promise<{ t: TournamentRef; group: string; teams: Team[]; fixtures: Fixture[] } | null> {
  const t = await getTournamentBySlug(slug)
  if (!t) return null
  const { teams, fixtures } = await getTeamsAndFixtures(t.id)
  const group = groupLetters(teams).find(g => g.toLowerCase() === code.toLowerCase())
  return group ? { t, group, teams, fixtures } : null
}

export async function generateMetadata({ params }: { params: { tournament: string; code: string } }): Promise<Metadata> {
  const data = await load(params.tournament, params.code)
  if (!data) return { title: 'Group | TribePicks' }
  const names = data.teams.filter(t => t.group === data.group).map(t => t.name).join(', ')
  return {
    title: `${data.t.name} Group ${data.group} — table, fixtures & results | TribePicks`,
    description: `Group ${data.group} at ${data.t.name}: ${names}. Live table, standings, fixtures and results. Predict who advances on TribePicks.`,
    alternates: { canonical: `https://tribepicks.com/${data.t.slug}/groups/${data.group.toLowerCase()}` },
  }
}

export default async function GroupPage({ params }: { params: { tournament: string; code: string } }) {
  const data = await load(params.tournament, params.code)
  if (!data) notFound()
  const { t, group, teams, fixtures } = data
  const base = `/${t.slug}`
  const table = standingsFor(group, teams, fixtures)
  const groupTeams = teams.filter(tm => tm.group === group)
  const codeOf = (name: string) => groupTeams.find(tm => tm.name === name)?.code
  const fxs = fixtures
    .filter(f => f.round.startsWith('gs') && f.grp === group)
    .sort((a, b) => (a.kickoff_utc ?? '').localeCompare(b.kickoff_utc ?? ''))
  const played = fxs.filter(f => f.home_score != null).length
  const complete = fxs.length > 0 && played === fxs.length

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <nav className="text-xs text-gray-400 mb-3">
        <Link href="/" className="hover:text-gray-600">Home</Link> <span className="mx-1">/</span>
        <Link href={`${base}/groups`} className="hover:text-gray-600">{t.name} Groups</Link> <span className="mx-1">/</span> Group {group}
      </nav>

      <h1 className="text-2xl sm:text-3xl font-black text-gray-900">{t.name} — Group {group}</h1>
      <p className="mt-3 text-sm text-gray-600 leading-relaxed">
        Group {group} of {t.name} features {groupTeams.map((tm, i) => (
          <span key={tm.code}>
            {i > 0 && (i === groupTeams.length - 1 ? ' and ' : ', ')}
            <Link href={`${base}/teams/${tm.code}`} className="text-emerald-700 font-semibold underline">{tm.name}</Link>
          </span>
        ))}. {complete
          ? `All ${fxs.length} group matches have been played — the top teams carry on into the knockout stage.`
          : `The teams play a single round-robin; the top finishers advance to the knockout stage.`}
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
                    <td className="px-3 py-2"><span className="text-gray-400 mr-1.5">{i + 1}</span>{r.flag} {code ? <Link href={`${base}/teams/${code}`} className="hover:text-emerald-700 hover:underline">{r.team}</Link> : r.team}</td>
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
      </section>

      {/* Fixtures */}
      <section className="mt-8">
        <h2 className="text-lg font-bold text-gray-900 mb-2">Group {group} fixtures &amp; results</h2>
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
          {fxs.map(f => {
            const isPlayed = f.home_score != null && f.away_score != null
            return (
              <li key={f.id} className="flex items-center gap-2 px-3 py-2.5 bg-white text-sm">
                <span className="text-[10px] font-semibold text-gray-400 w-16 flex-shrink-0">{ROUND_LABEL[f.round] ?? f.round}</span>
                <span className="min-w-0 flex-1 text-right truncate">{f.home}</span>
                <span className="flex-shrink-0 font-bold w-14 text-center">{isPlayed ? `${f.home_score}–${f.away_score}` : 'v'}</span>
                <span className="min-w-0 flex-1 truncate">{f.away}</span>
              </li>
            )
          })}
        </ul>
      </section>

      <div className="mt-10 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5 text-center">
        <p className="text-sm font-bold text-emerald-900">Call the knockouts</p>
        <p className="text-xs text-emerald-700 mt-1 mb-3">Predict who escapes Group {group} and every tie to the final — free to play.</p>
        <Link href="/bracket" className="inline-block px-5 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white">🏆 Play free</Link>
      </div>

      <p className="mt-6 text-xs text-gray-400"><Link href={`${base}/groups`} className="hover:text-gray-600">← All {t.name} groups</Link></p>
    </main>
  )
}
