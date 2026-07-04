import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/my-challenges — the signed-in user's entered sponsor challenges
// (Match + Bracket), newest first. Thin: just {type, slug, name}; the UI fetches
// each challenge's own leaderboard for status / pick / rank detail.
export async function GET() {
  const user = await getSessionUser().catch(() => null)
  if (!user) return NextResponse.json({ challenges: [] })
  const admin = createAdminClient()

  const [{ data: me }, { data: be }] = await Promise.all([
    (admin.from('match_entries')   as any).select('challenge_id, entered_at').eq('user_id', user.id),
    (admin.from('bracket_entries') as any).select('challenge_id, entered_at').eq('user_id', user.id),
  ])

  const rows: { id: string; type: 'match' | 'bracket'; entered_at: string }[] = []
  for (const r of (me ?? []) as any[]) if (r.challenge_id) rows.push({ id: r.challenge_id, type: 'match',   entered_at: r.entered_at })
  for (const r of (be ?? []) as any[]) if (r.challenge_id) rows.push({ id: r.challenge_id, type: 'bracket', entered_at: r.entered_at })
  if (!rows.length) return NextResponse.json({ challenges: [] })

  const ids = [...new Set(rows.map(r => r.id))]
  const { data: chs } = await (admin.from('challenges') as any).select('id, slug, name').in('id', ids)
  const byId = new Map(((chs ?? []) as any[]).map(c => [c.id, c]))

  const challenges = rows
    .map(r => { const c = byId.get(r.id); return c ? { type: r.type, slug: c.slug, name: c.name, entered_at: r.entered_at } : null })
    .filter((x): x is { type: 'match' | 'bracket'; slug: string; name: string; entered_at: string } => !!x)
    .sort((a, b) => String(b.entered_at).localeCompare(String(a.entered_at)))

  return NextResponse.json({ challenges })
}
