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

// ── Derived team stats (all facts come straight from the match data) ────────────
interface Played { us: number; them: number; opp: string; r: 'W' | 'D' | 'L'; margin: number }
interface TeamStats {
  played: number; w: number; d: number; l: number; gf: number; ga: number; gd: number; gpg: string
  cleanSheets: number; failedToScore: number
  biggestWin?: Played; heaviestLoss?: Played; highestScoring?: Played
  streak?: string
  next?: { opp: string; home: boolean; round: string; kickoff: string | null }
  pos?: number; groupSize?: number; points?: number
  reachedKO: boolean; form: ('W' | 'D' | 'L')[]
}

function computeStats(team: Team, fixtures: Fixture[], table: { team: string; points: number }[]): TeamStats {
  const fxs = teamFixtures(team.name, fixtures)
  const results: Played[] = fxs
    .filter(f => f.home_score != null && f.away_score != null)
    .map(f => {
      const us = f.home === team.name ? f.home_score! : f.away_score!
      const them = f.home === team.name ? f.away_score! : f.home_score!
      return { us, them, opp: f.home === team.name ? f.away : f.home, r: us > them ? 'W' : us < them ? 'L' : 'D', margin: us - them }
    })
  const w = results.filter(r => r.r === 'W').length
  const d = results.filter(r => r.r === 'D').length
  const l = results.filter(r => r.r === 'L').length
  const gf = results.reduce((s, r) => s + r.us, 0)
  const ga = results.reduce((s, r) => s + r.them, 0)
  const wins = results.filter(r => r.r === 'W')
  const losses = results.filter(r => r.r === 'L')

  // Trailing streak: winning/losing run, else unbeaten/winless run (whichever is notable).
  let streak: string | undefined
  if (results.length) {
    const last = results[results.length - 1].r
    let n = 1
    for (let i = results.length - 2; i >= 0; i--) { if (results[i].r === last) n++; else break }
    if (last === 'W' && n >= 2) streak = `on a ${n}-match winning run`
    else if (last === 'L' && n >= 2) streak = `on a ${n}-match losing run`
    else {
      let ub = 0; for (let i = results.length - 1; i >= 0; i--) { if (results[i].r !== 'L') ub++; else break }
      let wl = 0; for (let i = results.length - 1; i >= 0; i--) { if (results[i].r !== 'W') wl++; else break }
      if (ub >= 3) streak = `unbeaten in ${ub}`
      else if (wl >= 3) streak = `without a win in ${wl}`
    }
  }

  const nextFx = fxs.find(f => f.home_score == null)
  const idx = table.findIndex(r => r.team === team.name)
  return {
    played: results.length, w, d, l, gf, ga, gd: gf - ga,
    gpg: results.length ? (gf / results.length).toFixed(1) : '0',
    cleanSheets: results.filter(r => r.them === 0).length,
    failedToScore: results.filter(r => r.us === 0).length,
    biggestWin: wins.length ? wins.reduce((a, b) => (b.margin > a.margin ? b : a)) : undefined,
    heaviestLoss: losses.length ? losses.reduce((a, b) => (b.margin < a.margin ? b : a)) : undefined,
    highestScoring: results.length ? results.reduce((a, b) => (b.us + b.them > a.us + a.them ? b : a)) : undefined,
    streak,
    next: nextFx ? { opp: nextFx.home === team.name ? nextFx.away : nextFx.home, home: nextFx.home === team.name, round: ROUND_LABEL[nextFx.round] ?? nextFx.round, kickoff: nextFx.kickoff_utc } : undefined,
    pos: idx >= 0 ? idx + 1 : undefined, groupSize: table.length || undefined, points: idx >= 0 ? table[idx].points : undefined,
    reachedKO: reachedKnockouts(team.name, fixtures),
    form: teamForm(team.name, fixtures).slice(-6) as ('W' | 'D' | 'L')[],
  }
}

export async function generateMetadata({ params }: { params: { tournament: string; code: string } }): Promise<Metadata> {
  const data = await load(params.tournament, params.code)
  if (!data) return { title: 'Team | TribePicks' }
  const { t, team, teams, fixtures } = data
  const s = computeStats(team, fixtures, team.group ? standingsFor(team.group, teams, fixtures) : [])
  const rankBit = team.rank != null ? `Ranked ${ordinal(team.rank)}. ` : ''
  const recordBit = s.played ? `${s.w}W-${s.d}D-${s.l}L, ${s.gf} scored. ` : ''
  return {
    title: `${team.name} at ${t.name} — fixtures, results & form | TribePicks`,
    description: `${team.name} at ${t.name}${team.group ? ` in Group ${team.group}` : ''}. ${rankBit}${recordBit}Fixtures, results, form guide and knockout outlook. Predict ${team.name}'s run free on TribePicks.`,
    alternates: { canonical: `https://tribepicks.com/${t.slug}/teams/${team.code}` },
  }
}

// ── Editorial narrative — varies by each team's actual data ──────────────────────
function narrative(tName: string, team: Team, s: TeamStats): string[] {
  const paras: string[] = []
  const rankTier = team.rank == null ? ''
    : team.rank <= 5 ? 'one of the pre-tournament favourites'
    : team.rank <= 12 ? 'one of the stronger sides in the field'
    : team.rank <= 25 ? 'a well-fancied outfit'
    : 'an outsider hoping to upset the odds'

  // 1 — Who they are + where they stand
  let p1 = `${team.name} are competing at ${tName}${team.group ? `, drawn into Group ${team.group}` : ''}.`
  if (team.rank != null) p1 += ` Ranked ${ordinal(team.rank)} in the world, they arrive as ${rankTier}.`
  if (s.pos && s.points != null) {
    // Group standing is group-games-only; don't tie it to total games played (which
    // can include knockout matches) to avoid a misleading "after N games / P points".
    const where = s.pos === 1 ? 'top of Group ' + team.group : `${ordinal(s.pos)} in Group ${team.group}`
    const verb = (s.reachedKO || !s.next) ? 'finished' : 'sit'
    p1 += ` They ${verb} ${where} on ${s.points} point${s.points === 1 ? '' : 's'}.`
  }
  paras.push(p1)

  // 2 — The campaign & form so far
  if (s.played) {
    let p2 = `So far ${team.name} have won ${s.w}, drawn ${s.d} and lost ${s.l}, scoring ${s.gf} and conceding ${s.ga} — ${s.gpg} goals a game.`
    if (s.streak) p2 += ` They head into their next match ${s.streak}.`
    if (s.biggestWin && s.biggestWin.margin >= 2) p2 += ` Their standout display was a ${s.biggestWin.us}–${s.biggestWin.them} win over ${s.biggestWin.opp}.`
    else if (s.highestScoring && s.highestScoring.us + s.highestScoring.them >= 4) p2 += ` Their liveliest game was a ${s.highestScoring.us}–${s.highestScoring.them} affair with ${s.highestScoring.opp}.`
    if (s.cleanSheets >= 2) p2 += ` At the back they've been miserly, keeping ${s.cleanSheets} clean sheets.`
    else if (s.heaviestLoss && s.heaviestLoss.margin <= -2) p2 += ` The one to forget was a ${s.heaviestLoss.us}–${s.heaviestLoss.them} loss to ${s.heaviestLoss.opp}.`
    else if (s.failedToScore >= 2) p2 += ` Goals have been the issue — they've been shut out ${s.failedToScore} times.`
    paras.push(p2)
  } else {
    paras.push(`${team.name}'s ${tName} campaign is still to kick off — every fixture, result and form update will land on this page as it happens.`)
  }

  // 3 — What's next / how far can they go
  let p3 = ''
  if (s.reachedKO) p3 += `Having come through the group, ${team.name} are into the knockout rounds, where one bad night ends it all. `
  if (s.next) {
    p3 += `Next up, ${team.name} ${s.next.home ? 'host' : 'take on'} ${s.next.opp} in the ${s.next.round} (${fmtDate(s.next.kickoff)}).`
  } else if (s.played && !s.reachedKO) {
    p3 += `Their group programme is complete — follow the rest of the bracket to see how the tournament unfolds.`
  }
  if (p3) paras.push(p3.trim())

  // 4 — Prediction hook
  paras.push(`Fancy ${team.name} to go far at ${tName}? Put them in your free bracket, predict their route to the final, and track how the crowd rates their chances.`)
  return paras
}

const FORM_TONE: Record<string, string> = {
  W: 'bg-emerald-500 text-white', D: 'bg-gray-300 text-gray-700', L: 'bg-rose-400 text-white',
}

export default async function TeamPage({ params }: { params: { tournament: string; code: string } }) {
  const data = await load(params.tournament, params.code)
  if (!data) notFound()
  const { t, team, teams, fixtures } = data
  const base = `/${t.slug}`
  const fxs = teamFixtures(team.name, fixtures)
  const table = team.group ? standingsFor(team.group, teams, fixtures) : []
  const s = computeStats(team, fixtures, table)
  const paras = narrative(t.name, team, s)

  const stat = (label: string, value: string) => (
    <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-2 py-2.5">
      <span className="text-lg font-black text-gray-900 tabular-nums leading-none">{value}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mt-1">{label}</span>
    </div>
  )

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

      {/* Stat highlights */}
      {s.played > 0 && (
        <section className="mt-6">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {stat('Played', String(s.played))}
            {stat('Record', `${s.w}-${s.d}-${s.l}`)}
            {stat('For', String(s.gf))}
            {stat('Against', String(s.ga))}
            {stat('Diff', `${s.gd > 0 ? '+' : ''}${s.gd}`)}
            {stat('Clean', String(s.cleanSheets))}
          </div>
          {s.form.length > 0 && (
            <div className="flex items-center gap-1.5 mt-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mr-1">Form</span>
              {s.form.map((r, i) => (
                <span key={i} className={`w-6 h-6 rounded-md text-[11px] font-black flex items-center justify-center ${FORM_TONE[r]}`}>{r}</span>
              ))}
            </div>
          )}
        </section>
      )}

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
