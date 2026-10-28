import { sendSweepResultsReady } from '@/lib/sweep/emails'

// Called (fire-and-forget) whenever a horse's finish_position is set via
// /api/admin/sweep-horses PATCH. Once all three placegetters are recorded for a
// tournament, emails every member of every tribe under it that hasn't been notified yet
// (tribes.sweep_results_sent_at guards against re-sending on a later correction).
export async function checkAndSendSweepResults(admin: any, tournamentId: string): Promise<void> {
  try {
    const { data: horses } = await (admin.from('sweep_horses') as any)
      .select('id, number, name, finish_position').eq('tournament_id', tournamentId)
    const placegetters = [1, 2, 3].map(place => (horses ?? []).find((h: any) => h.finish_position === place))
    if (placegetters.some(h => !h)) return   // not all three recorded yet

    const { data: tribes } = await (admin.from('tribes') as any)
      .select('id, name, comp_id').eq('tournament_id', tournamentId).is('sweep_results_sent_at', null)
    if (!tribes?.length) return

    for (const tribe of tribes as any[]) {
      const [{ data: entries }, { data: memberRows }, { data: comp }] = await Promise.all([
        (admin.from('sweep_entries') as any).select('user_id, horse_id').eq('tribe_id', tribe.id),
        (admin.from('tribe_members') as any).select('user_id').eq('tribe_id', tribe.id),
        (admin.from('comps') as any).select('name').eq('id', tribe.comp_id).maybeSingle(),
      ])
      const memberIds = ((memberRows ?? []) as any[]).map(m => m.user_id)
      if (!memberIds.length) { await markSent(admin, tribe.id); continue }

      const { data: users } = await (admin.from('users') as any).select('id, email, display_name').in('id', memberIds)
      const horseById = Object.fromEntries(((horses ?? []) as any[]).map(h => [h.id, h]))

      const podium = placegetters.map((h: any, i: number) => {
        const entry = ((entries ?? []) as any[]).find(e => e.horse_id === h.id)
        const winner = entry ? (users ?? []).find((u: any) => u.id === entry.user_id) : null
        return { place: i + 1, horse: { number: h.number, name: h.name }, winner: winner ? { display_name: winner.display_name } : null }
      })

      for (const userId of memberIds) {
        const u = (users ?? []).find((x: any) => x.id === userId)
        if (!u?.email) continue
        const myHorses = ((entries ?? []) as any[])
          .filter(e => e.user_id === userId && e.horse_id)
          .map(e => horseById[e.horse_id]).filter(Boolean).map((h: any) => ({ number: h.number, name: h.name }))
        sendSweepResultsReady({
          email: u.email, name: u.display_name,
          compName: (comp as any)?.name ?? 'your sweep', tribeName: tribe.name,
          podium, myHorses,
        }).catch(() => {})
      }

      await markSent(admin, tribe.id)
    }
  } catch (e: any) {
    console.error('[sweep/results] error:', e?.message ?? e)
  }
}

async function markSent(admin: any, tribeId: string): Promise<void> {
  await (admin.from('tribes') as any).update({ sweep_results_sent_at: new Date().toISOString() }).eq('id', tribeId)
}
