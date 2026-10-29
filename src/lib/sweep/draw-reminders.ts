import { createNotifications } from '@/lib/notifications'
import { sendSweepDrawReminder } from '@/lib/sweep/emails'
import { loadField, overFieldTicketIds } from '@/lib/sweep/field'

// "Spin for your horse" reminders for one sweep tournament (migration 201). kind 'open' goes
// out when an admin opens the draw; 'nudge' on race morning (the sweep-auto-lock cron). Both
// reach everyone holding at least one ticket they can still spin — not tickets over a short
// field (those are refunds, not spins) — with one email + one in-app notification per
// person covering all their sweeps. Locked pools are skipped: nobody there can spin anymore.
// dryRun counts who WOULD be reminded without sending anything (the admin's preview).
export async function sendDrawReminders(
  admin: any, tournamentId: string, kind: 'open' | 'nudge', opts: { dryRun?: boolean } = {},
): Promise<{ people: number; tickets: number }> {
  const [{ data: tourn }, field, { data: tribes }] = await Promise.all([
    (admin.from('tournaments') as any).select('name, race_start_at').eq('id', tournamentId).maybeSingle(),
    loadField(admin, tournamentId),
    (admin.from('tribes') as any).select('id, comp_id, comps(name)').eq('tournament_id', tournamentId).is('sweep_locked_at', null),
  ])
  const tribeRows = (tribes ?? []) as any[]
  if (!tribeRows.length) return { people: 0, tickets: 0 }

  const { data: entries } = await (admin.from('sweep_entries') as any)
    .select('id, tribe_id, user_id, horse_id, joined_at').in('tribe_id', tribeRows.map(t => t.id))
  const byTribe: Record<string, any[]> = {}
  for (const e of (entries ?? []) as any[]) (byTribe[e.tribe_id] ??= []).push(e)

  // user → comp → spinnable tickets
  const waiting: Record<string, Record<string, { compId: string; compName: string; tickets: number }>> = {}
  for (const t of tribeRows) {
    const rows = byTribe[t.id] ?? []
    const over = overFieldTicketIds(rows, field)
    const comp = Array.isArray(t.comps) ? t.comps[0] : t.comps
    for (const e of rows) {
      if (e.horse_id || over.has(e.id)) continue
      const slot = ((waiting[e.user_id] ??= {})[t.comp_id] ??= { compId: t.comp_id, compName: comp?.name ?? 'your sweep', tickets: 0 })
      slot.tickets++
    }
  }
  const userIds = Object.keys(waiting)
  if (!userIds.length) return { people: 0, tickets: 0 }
  if (opts.dryRun) {
    const tickets = Object.values(waiting).reduce((n, comps) => n + Object.values(comps).reduce((m, s) => m + s.tickets, 0), 0)
    return { people: userIds.length, tickets }
  }

  const { data: users } = await (admin.from('users') as any).select('id, email, display_name').in('id', userIds)
  let tickets = 0
  const notes = []
  for (const u of (users ?? []) as any[]) {
    const sweeps = Object.values(waiting[u.id] ?? {})
    const n = sweeps.reduce((s, x) => s + x.tickets, 0)
    tickets += n
    if (u.email) {
      await sendSweepDrawReminder({
        email: u.email, name: u.display_name, kind,
        raceName: (tourn as any)?.name ?? null, raceStartAt: (tourn as any)?.race_start_at ?? null, sweeps,
      })
    }
    notes.push({
      user_id: u.id,
      type: 'sweep_draw_open' as const,
      title: kind === 'open' ? "🐎 The field's in — spin for your horse" : `⏰ Race day — ${n} ticket${n === 1 ? '' : 's'} still to spin`,
      body: sweeps.map(s => `${s.tickets} in ${s.compName}`).join(' · '),
      data: { href: `/tribe?comp_id=${sweeps[0].compId}`, comp_id: sweeps[0].compId, kind },
    })
  }
  await createNotifications(notes)
  return { people: notes.length, tickets }
}
