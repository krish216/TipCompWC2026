import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  getTournamentBySlug, getPublicTournaments, getTeamsAndFixtures, standingsFor, teamFixtures, teamForm,
  reachedKnockouts, ordinal, fmtDate, fmtKick, ROUND_LABEL, type Team, type Fixture, type TournamentRef,
} from '@/lib/content/wc'
import { TeamBadge } from '@/components/game/TeamBadge'

export const revalidate = 1800

export async function generateStaticParams() {
  const ts = await getPublicTournaments()
  const out: { tournament: string; code: string }[] = []
  for (const t of ts) {
    const { teams } = await getTeamsAndFixtures(t.id)
    for (const tm of teams) out.push({ tournament: t.slug, code: tm.code })
  }
  return out
}

async function load(slug: string, code: string): Promise<{ t: TournamentRef; team: Team; teams: Team[]; fixtures: Fixture[] } | null> {
  const t = await getTournamentBySlug(slug)
  if (!t) return null
  const { teams, fixtures } = await getTeamsAndFixtures(t.id)
  const team = teams.find(tm => tm.code === code.toLowerCase())
  return team ? { t, team, teams, fixtures } : null
}

export async function generateMetadata({ params }: { params: { tournament: string; code: string } }): Promise<Metadata> {
  const data = await load(params.tournament, params.code)
  if (!data) return { title: 'Team | TribePicks' }
  const { t, team } = data
  const rankBit = team.rank != null ? `Ranked ${ordinal(team.rank)}. ` : ''
  return {
    title: `${team.name} at ${t.name} — fixtures & results | TribePicks`,
    description: `${team.name} at ${t.name}${team.group ? ` in Group ${team.group}` : ''}. ${rankBit}Fixtures, results, form and progress. Predict ${team.name}'s run on TribePicks.`,
    alternates: { canonical: `https://tribepicks.com/${t.slug}/teams/${team.code}` },
  }
}

function narrative(tName: string, team: Team, fixtures: Fixture[]): string[] {
  const out: string[] = []
  const rankTier = team.rank == null ? ''
    : team.rank <= 5 ? 'one of the pre-tournament favourites'
    : team.rank <= 12 ? 'one of the strongest sides in the field'
    : team.rank <= 25 ? 'a well-fancied side'
    : 'an outsider hoping to upset the odds'
  out.push(
    `${team.name} are competing at ${tName}${team.group ? `, drawn into Group ${team.group}` : ''}.` +
    (team.rank != null ? ` Ranked ${ordinal(team.rank)}, they go in as ${rankTier}.` : '')
  )

  const played = teamFixtures(team.name, fixtures).filter(f => f.home_score != null && f.away_score != null)
  if (played.length) {
    const form = teamForm(team.name, fixtures)
    const w = form.filter(r => r === 'W').length, d = form.filter(r => r === 'D').length, l = form.filter(r => r === 'L').length
    const gf = played.reduce((s, f) => s + (f.home === team.name ? f.home_score! : f.away_score!), 0)
    const ga = played.reduce((s, f) => s + (f.home === team.name ? f.away_score! : f.home_score!), 0)
    out.push(
      `So far ${team.name} have played ${played.length} match${played.length === 1 ? '' : 'es'}, ` +
      `winning ${w}, drawing ${d} and losing ${l}, scoring ${gf} and conceding ${ga}.`
    )
  }

  if (reachedKnockouts(team.name, fixtures)) {
    out.push(`${team.name} have reached the knockout stage. Fancy them to go all the way? Map out their route in your bracket.`)
  } else if (played.length >= 3) {
    out.push(`${team.name}'s group campaign is complete. Follow the rest of the bracket and see how far your picks can go.`)
  } else {
    out.push(`${team.name}'s campaign is still unfolding — track every result here as it plays out.`)
  }
  return out
}

export default async function TeamPage({ params }: { params: { tournament: string; code: string } }) {
  const data = await load(params.tournament, params.code)
  if (!data) notFound()
  const { t, team, teams, fixtures } = data
  const base = `/${t.slug}`
  const fxs = teamFixtures(team.name, fixtures)
  const table = team.group ? standingsFor(team.group, teams, fixtures) : []
  const paras = narrative(t.name, team, fixtures)

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <nav className="text-xs text-gray-400 mb-3">
        <Link href="/" className="hover:text-gray-600">Home</Link> <span className="mx-1">/</span>
        <Link href={`${base}/teams`} className="hover:text-gray-600">{t.name} Teams</Link> <span className="mx-1">/</span> {team.name}
      </nav>

      <div className="flex items-center gap-3">
        <TeamBadge flag={team.flag} logo={team.logo} name={team.name} size={56} />
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900">{team.name}</h1>
          <p className="text-sm text-gray-500">
            {team.group && <>Group {team.group}</>}
            {team.group && team.rank != null && ' · '}
            {team.rank != null && <>Ranked {ordinal(team.rank)}</>}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {paras.map((p, i) => <p key={i} className="text-sm text-gray-700 leading-relaxed">{p}</p>)}
      </div>

      {/* Fixtures & results */}
      <section className="mt-8">
        <h2 className="text-lg font-bold text-gray-900 mb-2">{team.name} — fixtures &amp; results</h2>
        {fxs.length === 0 ? <p className="text-sm text-gray-500">Fixtures to be confirmed.</p> : (
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
            {fxs.map(f => {
              const opp = f.home === team.name ? f.away : f.home
              const played = f.home_score != null && f.away_score != null
              const us = f.home === team.name ? f.home_score : f.away_score
              const them = f.home === team.name ? f.away_score : f.home_score
              const res = played ? (us! > them! ? 'W' : us! < them! ? 'L' : 'D') : null
              return (
                <li key={f.id} className="flex items-center gap-3 px-3 py-2.5 bg-white">
                  <span className="text-[10px] font-semibold text-gray-400 w-20 flex-shrink-0">{ROUND_LABEL[f.round] ?? f.round}</span>
                  <span className="min-w-0 flex-1 text-sm text-gray-800 truncate">{f.home === team.name ? 'vs' : 'at'} {opp}</span>
                  {played ? (
                    <span className={`text-sm font-bold ${res === 'W' ? 'text-emerald-600' : res === 'L' ? 'text-rose-500' : 'text-gray-500'}`}>{us}–{them} {res}</span>
                  ) : (
                    <span className="text-[11px] text-gray-400 whitespace-nowrap">{fmtDate(f.kickoff_utc)}{fmtKick(f.kickoff_utc) ? ` · ${fmtKick(f.kickoff_utc)}` : ''}</span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Group table */}
      {team.group && table.length > 0 && (
        <section className="mt-8">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-lg font-bold text-gray-900">Group {team.group} table</h2>
            <Link href={`${base}/groups/${team.group.toLowerCase()}`} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800">Full group →</Link>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase text-gray-400">
                <tr><th className="text-left px-3 py-2 font-semibold">Team</th><th className="px-2 py-2">P</th><th className="px-2 py-2">W</th><th className="px-2 py-2">D</th><th className="px-2 py-2">L</th><th className="px-2 py-2">GD</th><th className="px-2 py-2">Pts</th></tr>
              </thead>
              <tbody>
                {table.map((r, i) => (
                  <tr key={r.team} className={`border-t border-gray-100 ${r.team === team.name ? 'bg-emerald-50/60 font-semibold' : ''}`}>
                    <td className="px-3 py-2"><span className="text-gray-400 mr-1">{i + 1}</span>{r.flag} {r.team}</td>
                    <td className="text-center px-2 py-2">{r.played}</td>
                    <td className="text-center px-2 py-2">{r.won}</td>
                    <td className="text-center px-2 py-2">{r.drawn}</td>
                    <td className="text-center px-2 py-2">{r.lost}</td>
                    <td className="text-center px-2 py-2">{r.gd > 0 ? '+' : ''}{r.gd}</td>
                    <td className="text-center px-2 py-2 font-bold">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="mt-10 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5 text-center">
        <p className="text-sm font-bold text-emerald-900">Backing {team.name}?</p>
        <p className="text-xs text-emerald-700 mt-1 mb-3">Put them in your bracket and predict their run — free to play.</p>
        <Link href="/bracket" className="inline-block px-5 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white">🏆 Play free</Link>
      </div>

      <p className="mt-6 text-xs text-gray-400"><Link href={`${base}/teams`} className="hover:text-gray-600">← All {t.name} teams</Link></p>
    </main>
  )
}
