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
    description: `The TribePicks ${name} in numbers: the tipsters, the predictions, the comps, and the crowned champion tipster.`,
    alternates: { canonical: url },
    openGraph: { title: `${name}, Wrapped 🏆`, description: `The TribePicks ${name} in numbers — and the champion tipster who called it best.`, url, type: 'website' },
  }
}

type Row = { display_name: string; country: string | null; total_points: number; correct_count: number; predictions_made: number }
type Bracket = { entrants: number; champion: { name: string; points: number } | null }
type Retro = { tipsters: number; predictions: number; comps: number; tribes: number; top: Row[]; bracket: Bracket | null }

async function getRetro(tournamentId: string): Promise<Retro | null> {
  try {
    const admin = createAdminClient()
    const [{ data: lb }, { data: comps }] = await Promise.all([
      (admin.from('leaderboard') as any)
        .select('display_name, country, total_points, correct_count, predictions_made')
        .eq('tournament_id', tournamentId).order('total_points', { ascending: false }),
      (admin.from('comps') as any).select('id').eq('tournament_id', tournamentId),
    ])
    const rows = (lb ?? []) as Row[]
    if (!rows.length) return null
    const compIds = ((comps ?? []) as { id: string }[]).map(c => c.id)
    const { count: tribes } = compIds.length
      ? await (admin.from('tribes') as any).select('*', { count: 'exact', head: true }).in('comp_id', compIds)
      : { count: 0 }

    // Bracket Challenge — count distinct entrants; champion = highest bracket score (final_points).
    let bracket: Bracket | null = null
    const { data: be } = await (admin.from('bracket_entries') as any)
      .select('user_id, final_points, excluded').eq('tournament_id', tournamentId)
    const active = ((be ?? []) as { user_id: string; final_points: number | null; excluded: boolean }[]).filter(e => !e.excluded)
    if (active.length) {
      const entrants = new Set(active.map(e => e.user_id)).size
      const scored = active.filter(e => e.final_points != null)
      let champion: Bracket['champion'] = null
      if (scored.length) {
        const top = scored.reduce((a, b) => ((b.final_points as number) > (a.final_points as number) ? b : a))
        const { data: cu } = await (admin.from('users') as any).select('display_name').eq('id', top.user_id).maybeSingle()
        if (cu?.display_name) champion = { name: cu.display_name, points: top.final_points as number }
      }
      bracket = { entrants, champion }
    }

    return {
      tipsters: rows.length,
      predictions: rows.reduce((s, r) => s + (r.predictions_made || 0), 0),
      comps: compIds.length,
      tribes: tribes ?? 0,
      top: rows.slice(0, 5),
      bracket,
    }
  } catch { return null }
}

const fmt = (n: number) => n.toLocaleString('en-US')

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

          {/* Champion */}
          {r.top[0] && (
            <section className="mt-8 rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-white px-6 py-7 text-center">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-600">🏆 {(t as any).name} Champion Tipster</p>
              <p className="mt-2 text-2xl sm:text-3xl font-black text-gray-900">{r.top[0].display_name}</p>
              <p className="mt-1 text-sm text-gray-600">
                <span className="font-bold text-amber-700 tabular-nums">{fmt(r.top[0].total_points)} pts</span>
                {' · '}{r.top[0].correct_count}/{r.top[0].predictions_made} correct
                {r.top[0].predictions_made ? ` (${Math.round((r.top[0].correct_count / r.top[0].predictions_made) * 100)}%)` : ''}
              </p>
            </section>
          )}

          {/* Podium / top 5 */}
          {r.top.length > 1 && (
            <section className="mt-6">
              <h2 className="text-sm font-black text-gray-900 uppercase tracking-wide">The podium chasers</h2>
              <div className="mt-3 divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
                {r.top.slice(1).map((row, i) => (
                  <div key={row.display_name + i} className="flex items-center gap-3 px-4 py-3">
                    <span className="w-6 text-center text-sm font-black text-gray-400 tabular-nums">{i + 2}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">{row.display_name}</span>
                    <span className="text-sm font-bold text-emerald-600 tabular-nums">{fmt(row.total_points)} pts</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Bracket Challenge */}
          {r.bracket && (
            <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/50 px-5 py-5 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-600">🗺️ The Bracket Challenge</p>
                  <p className="mt-1 text-sm text-gray-700">
                    <strong className="text-gray-900 tabular-nums">{fmt(r.bracket.entrants)}</strong> brackets called — group stage all the way to the final.
                  </p>
                </div>
                {r.bracket.champion && (
                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Bracket champion</p>
                    <p className="text-base font-black text-gray-900">{r.bracket.champion.name}</p>
                    <p className="text-xs font-bold text-emerald-600 tabular-nums">{fmt(r.bracket.champion.points)} pts</p>
                  </div>
                )}
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
