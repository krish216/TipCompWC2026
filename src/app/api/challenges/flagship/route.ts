import { NextRequest, NextResponse } from 'next/server'
import { getPrimaryTournament } from '@/lib/content/wc'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// WC brackets carry no per-challenge closes_at; entry closes at the first semi-final
// kick-off (mirrors /api/bracket/entry-status LOCK_MS and the how-it-works copy).
const BRACKET_LOCK_MS = new Date('2026-07-14T19:00:00Z').getTime()

// GET /api/challenges/flagship?tournament=<slug>
// Tournament-aware "which flagship challenge should we nudge, and should we?" — a league
// gets the quartered Table Predictor (top-5 / bottom-3), a knockout gets the Bracket.
// Scoped to the SELECTED tournament (by slug) so the nudge matches what the tipster is
// viewing — unlike /api/bracket/entry-status, which is pinned to the primary tournament
// and so wrongly surfaced the WC bracket while viewing EPL.
//   → { flagship: { type, href, label, blurb, entered, show } | null }
export async function GET(request: NextRequest) {
  const slug = new URL(request.url).searchParams.get('tournament')
  const admin = createAdminClient()
  const user = await getSessionUser()

  // select('*') so `format` (migration 159) flows through even before the column is applied.
  const t = slug
    ? (await (admin.from('tournaments') as any).select('*').eq('slug', slug).maybeSingle()).data
    : await getPrimaryTournament(admin)
  if (!t) return NextResponse.json({ flagship: null })
  const tid = (t as any).id, tslug = (t as any).slug, fmt = (t as any).format

  const [{ count: quarters }, { data: brackets }] = await Promise.all([
    (admin.from('standings_quarters') as any).select('id', { count: 'exact', head: true }).eq('tournament_id', tid),
    (admin.from('challenges') as any).select('id').eq('tournament_id', tid).eq('type', 'bracket').eq('enabled', true).limit(1),
  ])

  // Which flagship to show. Prefer the explicit format column; fall back to probing the
  // data (quarters present → predictor, else a bracket challenge → bracket).
  const kind = fmt === 'league'   ? 'predictor'
             : fmt === 'knockout' ? 'bracket'
             : (quarters ?? 0) > 0 ? 'predictor'
             : (brackets && brackets.length) ? 'bracket' : null

  // ── League → Table Predictor ────────────────────────────────────────────────
  if (kind === 'predictor') {
    const now = Date.now()
    const { data: qs } = await (admin.from('standings_quarters') as any)
      .select('locks_at').eq('tournament_id', tid)
    const openQuarter = ((qs ?? []) as any[]).some(q => new Date(q.locks_at).getTime() > now)
    let entered = false
    if (user) {
      const { data: sp } = await (admin.from('standings_predictions') as any)
        .select('id').eq('user_id', user.id).eq('tournament_id', tid).limit(1)
      entered = (((sp ?? []) as any[]).length) > 0
    }
    return NextResponse.json({ flagship: {
      type: 'predictor', href: `/${tslug}/predictor`, label: 'Table Predictor',
      blurb: 'Predict the top 5 & bottom 3 at four checkpoints through the season.',
      entered, show: !!user && !entered && openQuarter,
    } })
  }

  // ── Knockout → Bracket ──────────────────────────────────────────────────────
  if (kind === 'bracket') {
    const locked = Date.now() >= BRACKET_LOCK_MS
    let entered = false
    if (user) {
      // Fail SAFE on read error → treat as entered (nudge nothing).
      const { count, error } = await (admin.from('bracket_entries') as any)
        .select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('tournament_id', tid)
      entered = error ? true : (count ?? 0) > 0
    }
    return NextResponse.json({ flagship: {
      type: 'bracket', href: '/bracket', label: 'Bracket Challenge',
      blurb: 'Predict the winner of every knockout match to the final.',
      entered, show: !!user && !entered && !locked,
    } })
  }

  return NextResponse.json({ flagship: null })
}
