import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getTipsterStats } from '@/lib/tipster-trophies'

export const dynamic = 'force-dynamic'

// GET /api/tipster/summary?u=<userId>
// Compact identity + cabinet highlights for the chat/member popover — so a tap shows a card
// without a full-page nav that might 404. Always returns identity when the user exists (their
// name/avatar are already visible in chat anyway); `exists` gates whether a public cabinet is
// reachable (has a record AND hasn't opted out) — the popover only shows "View cabinet" then.

// ISO-3166 alpha-2 → flag emoji.
function flagEmoji(cc: string | null): string {
  if (!cc || cc.length !== 2) return ''
  return String.fromCodePoint(...[...cc.toUpperCase()].map(c => 127397 + c.charCodeAt(0)))
}

export async function GET(request: NextRequest) {
  const u = new URL(request.url).searchParams.get('u') || ''
  if (!u) return NextResponse.json({ ok: false }, { status: 400 })

  const admin = createAdminClient()
  const { data: user } = await (admin.from('users') as any)
    .select('*').eq('id', u).maybeSingle()
  if (!user || !user.display_name) return NextResponse.json({ ok: true, exists: false, name: null })

  const identity = {
    id: user.id,
    name: user.display_name as string,
    avatar: (user.avatar_url ?? null) as string | null,
    flag: flagEmoji(user.country ?? null),
  }

  // Opted out or no record → identity only, no cabinet link.
  if (user.hide_tipster_profile) return NextResponse.json({ ok: true, exists: false, ...identity })

  const s = await getTipsterStats(admin, u)
  if (!s.hasRecord) return NextResponse.json({ ok: true, exists: false, ...identity })

  // Up to three earned trophies as highlights (icon + label only).
  const highlights = s.trophies.filter(t => t.earned).slice(0, 3).map(t => ({ icon: t.icon, label: t.label }))

  return NextResponse.json({
    ok: true, exists: true, ...identity,
    title: s.title,
    showRank: s.showRank,
    bestRank: s.showRank && s.bestRank ? { rank: s.bestRank.rank, total: s.bestRank.totalPlayers, top: s.bestRank.topPercent } : null,
    nuggets: s.showRank ? [] : s.nuggets,
    highlights,
  })
}
