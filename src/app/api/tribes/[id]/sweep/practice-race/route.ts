import { NextRequest, NextResponse } from 'next/server'
import { randomInt } from 'crypto'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { isPracticeTournament } from '@/lib/sweep/practice'

export const dynamic = 'force-dynamic'

// POST /api/tribes/:id/sweep/practice-race — the organiser of a PRACTICE sweep runs its race:
// three random non-scratched horses become 1st/2nd/3rd for this pool only (stored on
// tribes.practice_results — the practice field is shared, so sweep_horses.finish_position
// can't be used), and the pool locks, which also reveals the full draw. Running it again
// re-rolls the result. DELETE clears the result and reopens the pool to try again.
async function gate(tribeId: string) {
  const user = await getSessionUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const admin = createAdminClient()
  const { data: tribe } = await (admin.from('tribes') as any)
    .select('id, comp_id, tournament_id').eq('id', tribeId).maybeSingle()
  if (!tribe) return { error: NextResponse.json({ error: 'Pool not found' }, { status: 404 }) }
  if (!(await isPracticeTournament(admin, tribe.tournament_id))) {
    return { error: NextResponse.json({ error: 'Only practice sweeps can run a pretend race' }, { status: 400 }) }
  }
  const { data: isAdmin } = await (admin.from('comp_admins') as any)
    .select('user_id').eq('comp_id', tribe.comp_id).eq('user_id', user.id).maybeSingle()
  if (!isAdmin) return { error: NextResponse.json({ error: 'Only the organiser can run the race' }, { status: 403 }) }
  return { admin, tribe }
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gate(params.id)
  if ('error' in g) return g.error
  const { admin, tribe } = g

  const { data: horses } = await (admin.from('sweep_horses') as any)
    .select('id').eq('tournament_id', tribe.tournament_id).eq('scratched', false)
  const field = ((horses ?? []) as any[]).map(h => h.id)
  if (field.length < 3) return NextResponse.json({ error: 'The practice field needs at least 3 horses' }, { status: 400 })

  for (let i = field.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[field[i], field[j]] = [field[j], field[i]]
  }
  const { error } = await (admin.from('tribes') as any)
    .update({ practice_results: field.slice(0, 3), sweep_locked_at: new Date().toISOString() })
    .eq('id', tribe.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gate(params.id)
  if ('error' in g) return g.error
  const { error } = await (g.admin.from('tribes') as any)
    .update({ practice_results: null, sweep_locked_at: null }).eq('id', g.tribe.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
