import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'
import { getTournamentBySlug } from '@/lib/content/wc'
import { FeedCtaLink } from '@/components/game/FeedCtaLink'

// The tournament "Wrapped" retro — served at the tournament root (e.g. /wc2026). Numbers come
// live from the leaderboard MV + counts, so the champions settle themselves once the final is
// scored. Cached an hour. Shown only once the tournament has real results.
export const revalidate = 3600

export async function generateMetadata({ params }: { params: { tournament: string } }): Promise<Metadata> {
  const t = await getTournamentBySlug(params.tournament)
  const name = (t as any)?.name ?? 'The tournament'
  const url = `https://tribepicks.com/${params.tournament}`
  return {
    title: `${name}, Wrapped — the TribePicks retro`,
    description: `The TribePicks ${name} in numbers: the tipsters, the predictions, the comps, and the champion podiums.`,
    alternates: { canonical: url },
    openGraph: { title: `${name}, Wrapped 🏆`, description: `The TribePicks ${name} in numbers — the tipster, bracket and comp-chief podiums.`, url, type: 'website' },
  }
}

type Row = { user_id: string; display_name: string; country: string | null; total_points: number; correct_count: number; predictions_made: number }
type PodiumEntry = { name: string; points: number; href: string | null }
type Chief = { name: string; href: string }
type Retro = {
  tipsters: number; predictions: number; comps: number; tribes: number
  top: Row[]
  bracket: { entrants: number; podium: PodiumEntry[] } | null
  chiefs: Chief[]
}

async function getRetro(tournamentId: string): Promise<Retro | null> {
  try {
    const admin = createAdminClient()
    const [{ data: lb }, { data: comps }] = await Promise.all([
      (admin.from('leaderboard') as any)
        .select('user_id, display_name, country, total_points, correct_count, predictions_made')
        .eq('tournament_id', tournamentId).order('total_points', { ascending: false }),
      (admin.from('comps') as any).select('id').eq('tournament_id', tournamentId),
    ])
    const rows = (lb ?? []) as Row[]
    if (!rows.length) return null
    // Users with a public tipster profile = those on the leaderboard (bracket-only entrants
    // may not have one, so we only link those that do).
    const profileIds = new Set(rows.map(r => r.user_id))
    const compIds = ((comps ?? []) as { id: string }[]).map(c => c.id)
    const { count: tribes } = compIds.length
      ? await (admin.from('tribes') as any).select('*', { count: 'exact', head: true }).in('comp_id', compIds)
      : { count: 0 }

    // Bracket Challenge — distinct entrants + the top-3 podium by best bracket score.
    let bracket: Retro['bracket'] = null
    const { data: be } = await (admin.from('bracket_entries') as any)
      .select('user_id, final_points, excluded').eq('tournament_id', tournamentId)
    const active = ((be ?? []) as { user_id: string; final_points: number | null; excluded: boolean }[]).filter(e => !e.excluded)
    if (active.length) {
      const entrants = new Set(active.map(e => e.user_id)).size
      // One bracket per person may enter several pools — keep each user's best score.
      const best = new Map<string, number>()
      for (const e of active) if (e.final_points != null && (!best.has(e.user_id) || e.final_points > best.get(e.user_id)!)) best.set(e.user_id, e.final_points)
      const top3 = [...best.entries()].map(([user_id, points]) => ({ user_id, points })).sort((a, b) => b.points - a.points).slice(0, 3)
      const { data: bu } = top3.length
        ? await (admin.from('users') as any).select('id, display_name').in('id', top3.map(t => t.user_id))
        : { data: [] }
      const nameById = new Map<string, string>(((bu ?? []) as any[]).map(u => [u.id, u.display_name]))
      const podium = top3.map(t => ({
        name: nameById.get(t.user_id) ?? 'Unknown',
        points: t.points,
        href: profileIds.has(t.user_id) ? `/tipster/${t.user_id}` : null,
      }))
      bracket = { entrants, podium }
    }

    // Comp-Chief podium — the composite chief_scores rating, excluding platform admins (the
    // tournament organiser). Tolerant: [] if the view isn't applied/refreshed.
    let chiefs: Chief[] = []
    try {
      const { data: admins } = await (admin.from('admin_users') as any).select('user_id')
      const adminSet = new Set(((admins ?? []) as any[]).map(a => a.user_id))
      const { data: cs } = await (admin.from('chief_scores') as any)
        .select('chief_id, score').not('rank_global', 'is', null).order('score', { ascending: false }).limit(12)
      const eligible = ((cs ?? []) as any[]).filter(r => !adminSet.has(r.chief_id)).slice(0, 3)
      if (eligible.length) {
        const { data: cu } = await (admin.from('users') as any).select('id, display_name').in('id', eligible.map(r => r.chief_id))
        const cname = new Map<string, string>(((cu ?? []) as any[]).map(u => [u.id, u.display_name]))
        chiefs = eligible.map(r => ({ name: cname.get(r.chief_id) ?? '', href: `/chief/${r.chief_id}` })).filter(c => c.name)
      }
    } catch { /* chief_scores view optional */ }

    return {
      tipsters: rows.length,
      predictions: rows.reduce((s, r) => s + (r.predictions_made || 0), 0),
      comps: compIds.length,
      tribes: tribes ?? 0,
      top: rows.slice(0, 5),
      bracket,
      chiefs,
    }
  } catch { return null }
}

const fmt = (n: number) => n.toLocaleString('en-US')
const MEDAL = ['🥇', '🥈', '🥉']

export default async function TournamentRetroPage({ params }: { params: { tournament: string } }) {
  const t = await getTournamentBySlug(params.tournament)
  if (!t) notFound()
  // The "Wrapped" retro only exists once the tournament is OVER. Without this, the generic
  // [tournament] route renders a premature "that's a wrap" for an in-progress season — e.g.
  // /epl-2026-27, whose warm-up fixtures are already scored. end_date is the completion signal.
  const end = (t as any).end_date as string | null
  const ended = !!end && new Date(`${end}T23:59:59Z`).getTime() < Date.now()
  if (!ended) notFound()
  const r = await getRetro((t as any).id)

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 pb-20">
      {/* Hero */}
      <section className="rounded-3xl overflow-hidden shadow-lg" style={{ background: 'linear-gradient(160deg,#052e1c 0%,#0b3d27 55%,#04231a 100%)' }}>
        <div className="px-6 py-11 sm:px-10 sm:py-14 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-emerald-300">TribePicks · {(t as any).name}</p>
          <h1 className="mt-2 text-3xl sm:text-5xl font-black text-white leading-tight">That&apos;s a wrap. 🏆</h1>
          <p className="mt-4 text-sm sm:text-base text-white/80 max-w-xl mx-auto leading-relaxed">
            The first-ever TribePicks tournament — five weeks, 104 matches, and one very good crowd. Here&apos;s how it went.
          </p>
        </div>
      </section>

      {r ? (
        <>
          {/* Big numbers */}
          <section className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              [fmt(r.tipsters), 'Tipsters'],
              [fmt(r.predictions), 'Predictions'],
              [fmt(r.comps), 'Comps'],
              [fmt(r.tribes), 'Tribes'],
            ].map(([n, label]) => (
              <div key={label} className="rounded-2xl border border-gray-200 bg-white px-3 py-5 text-center">
                <p className="text-2xl sm:text-3xl font-black text-emerald-600 tabular-nums">{n}</p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
              </div>
            ))}
          </section>

          {/* Completionists — final WC figures (computed 2026-07-23). Gated to wc2026: these
              per-match / per-round coverage counts are tournament-specific, and deriving them
              live would mean scanning all ~69k predictions on every render. Mock accounts excluded. */}
          {params.tournament === 'wc2026' && (
            <section className="mt-6 rounded-2xl border border-gray-200 bg-white px-5 py-4 sm:px-6">
              <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-2 text-center">
                <div>
                  <p className="text-2xl font-black text-emerald-600 tabular-nums">122</p>
                  <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Tipped all 104 matches</p>
                </div>
                <div>
                  <p className="text-2xl font-black text-emerald-600 tabular-nums">215</p>
                  <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Tipped every round</p>
                </div>
              </div>
            </section>
          )}

          {/* Champion */}
          {r.top[0] && (
            <section className="mt-8 rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-white px-6 py-7 text-center">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-600">🏆 {(t as any).name} Champion Tipster</p>
              <p className="mt-2 text-2xl sm:text-3xl font-black text-gray-900">
                <Link href={`/tipster/${r.top[0].user_id}`} className="hover:underline">{r.top[0].display_name}</Link>
              </p>
              <p className="mt-1 text-sm text-gray-600">
                <span className="font-bold text-amber-700 tabular-nums">{fmt(r.top[0].total_points)} pts</span>
                {' · '}{r.top[0].correct_count}/{r.top[0].predictions_made} correct
                {r.top[0].predictions_made ? ` (${Math.round((r.top[0].correct_count / r.top[0].predictions_made) * 100)}%)` : ''}
              </p>
            </section>
          )}

          {/* Podium chasers (ranks 2–5) */}
          {r.top.length > 1 && (
            <section className="mt-6">
              <h2 className="text-sm font-black text-gray-900 uppercase tracking-wide">The podium chasers</h2>
              <div className="mt-3 divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
                {r.top.slice(1).map((row, i) => (
                  <div key={row.user_id + i} className="flex items-center gap-3 px-4 py-3">
                    <span className="w-6 text-center text-sm font-black text-gray-400 tabular-nums">{i + 2}</span>
                    <Link href={`/tipster/${row.user_id}`} className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800 hover:underline">{row.display_name}</Link>
                    <span className="text-sm font-bold text-emerald-600 tabular-nums">{fmt(row.total_points)} pts</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Bracket Challenge podium */}
          {r.bracket && (
            <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/40 px-5 py-5 sm:px-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-600">🗺️ The Bracket Challenge</p>
              <p className="mt-1 text-sm text-gray-700">
                <strong className="text-gray-900 tabular-nums">{fmt(r.bracket.entrants)}</strong> brackets called — group stage all the way to the final.
              </p>
              {r.bracket.podium.length > 0 && (
                <div className="mt-3 divide-y divide-emerald-100 rounded-xl border border-emerald-100 bg-white">
                  {r.bracket.podium.map((p, i) => (
                    <div key={p.name + i} className="flex items-center gap-3 px-4 py-3">
                      <span className="w-6 text-center text-lg leading-none">{MEDAL[i]}</span>
                      {p.href
                        ? <Link href={p.href} className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800 hover:underline">{p.name}</Link>
                        : <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">{p.name}</span>}
                      <span className="text-sm font-bold text-emerald-600 tabular-nums">{fmt(p.points)} pts</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Comp-Chief podium */}
          {r.chiefs.length > 0 && (
            <section className="mt-6 rounded-2xl border border-violet-200 bg-violet-50/40 px-5 py-5 sm:px-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-600">👑 Top Comp-Chiefs</p>
              <p className="mt-1 text-sm text-gray-700">
                The organisers who ran the best comps — by the TribePicks Comp-Chief rating (tipsters led, kept active, and brought back).
              </p>
              <div className="mt-3 divide-y divide-violet-100 rounded-xl border border-violet-100 bg-white">
                {r.chiefs.map((c, i) => (
                  <div key={c.name + i} className="flex items-center gap-3 px-4 py-3">
                    <span className="w-6 text-center text-lg leading-none">{MEDAL[i]}</span>
                    <Link href={c.href} className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800 hover:underline">{c.name}</Link>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <p className="mt-8 text-center text-sm text-gray-500">The wrap lands once the tournament&apos;s done and the final numbers are in — check back soon.</p>
      )}

      {/* Thanks + what's next */}
      <section className="mt-9 rounded-2xl bg-emerald-600 px-6 py-8 text-center">
        <p className="text-lg font-black text-white">Every one of you made it happen 🙌</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-emerald-50/90">
          Thank you for tipping the very first TribePicks tournament. You&apos;re a Founding Tipster — that badge is yours forever.
        </p>
        <div className="mt-5 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/epl" className="inline-block bg-white text-emerald-700 hover:bg-emerald-50 text-sm font-bold px-6 py-3 rounded-xl transition-colors">The Premier League is next →</Link>
          <Link href="/polls?topic=wrapup-general" className="inline-block bg-white/10 hover:bg-white/20 text-white text-sm font-bold px-6 py-3 rounded-xl transition-colors">Tell us what you thought</Link>
        </div>
        <div className="mt-3">
          <FeedCtaLink source="wrapped" className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-100/90 hover:text-white">
            🐾 Or feed the doggies →
          </FeedCtaLink>
        </div>
      </section>

      <p className="mt-6 text-center text-xs text-gray-400">
        A free-to-play football prediction game · no real-money betting · <Link href="/" className="underline hover:text-gray-600">tribepicks.com</Link>
      </p>
    </main>
  )
}
