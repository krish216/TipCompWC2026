import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { DRAW_OPENS_LABEL, loadField } from '@/lib/sweep/field'
import { drawUnspunTickets } from '@/lib/sweep/draw'
import { DRAW_GRACE_HOURS } from '@/lib/sweep/grace'
import { isPracticeSlug } from '@/lib/sweep/practice'

export const dynamic = 'force-dynamic'

// POST /api/tribes/:id/sweep/draw-unspun — comp-admin only. Draws a horse, at random, for
// every ticket in the pool its holder hasn't spun yet, so one slow member can't hold the pool
// back; each holder is emailed their horse(s). The organiser never chooses a horse. Works on a
// locked pool too — that's exactly when an unspun ticket is stuck (holders can't spin then).
// Body { user_id } (optional) narrows it to one member's tickets — "draw for them".
// Holders get 2 hours to spin a ticket themselves first (lib/sweep/grace.ts); tickets still
// inside that window are left alone, except in a practice sweep.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const tribeId = params.id

  const { data: tribe } = await (admin.from('tribes') as any)
    .select('id, comp_id, tournament_id').eq('id', tribeId).maybeSingle()
  if (!tribe) return NextResponse.json({ error: 'Tribe not found' }, { status: 404 })

  const { data: isAdmin } = await (admin.from('comp_admins') as any)
    .select('user_id').eq('comp_id', tribe.comp_id).eq('user_id', user.id).maybeSingle()
  if (!isAdmin) return NextResponse.json({ error: 'Only a comp admin can draw for unspun tickets' }, { status: 403 })

  if (!(await loadField(admin, tribe.tournament_id)).drawOpen) {
    return NextResponse.json({ error: `The draw opens ${DRAW_OPENS_LABEL}, once the final field is declared.` }, { status: 409 })
  }

  const body = await req.json().catch(() => null)
  const userId = typeof body?.user_id === 'string' ? body.user_id : undefined

  const { data: tourn } = await (admin.from('tournaments') as any).select('slug').eq('id', tribe.tournament_id).maybeSingle()
  const { drawn, failed, waiting, nextUnlock } = await drawUnspunTickets(admin, {
    tribeId, tournamentId: tribe.tournament_id, userId, respectGrace: !isPracticeSlug((tourn as any)?.slug),
  })
  if (failed > 0 && drawn === 0) return NextResponse.json({ error: 'Couldn’t draw for those tickets — try again in a moment.' }, { status: 409 })
  if (drawn === 0 && waiting > 0) {
    const at = nextUnlock!.toLocaleString('en-AU', {
      weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Melbourne',
    })
    return NextResponse.json({
      error: `${userId ? 'They have' : 'Everyone has'} ${DRAW_GRACE_HOURS} hours to spin for themselves — you can draw for ${userId ? 'them' : 'the first of them'} from ${at}.`,
      unlocks_at: nextUnlock!.toISOString(),
    }, { status: 409 })
  }
  if (userId && drawn === 0) return NextResponse.json({ error: 'They have no tickets left to draw for in this pool.' }, { status: 409 })
  return NextResponse.json({ ok: true, drawn, failed, waiting })
}
