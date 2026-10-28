// Shared ticket-granting logic — inserts N unclaimed sweep_entries rows (horse_id null) for
// a tribe member, capped so a tribe's total tickets can never exceed its field size (a
// ticket with no horse left to possibly win isn't a ticket). Used by grant-tickets (the
// organiser granting directly), and by the ticket-purchase-request flow (approve, and
// auto-approve on receipt attach) — kept as one function so the cap check can't drift
// between call sites.
//
// The cap is: tickets already out + tickets other PENDING requests have reserved + this
// grant <= non-scratched horses. Counting pending requests means a direct organiser grant
// can't squeeze out someone who's already paid and is waiting on approval. `requestId` is the
// request being approved, if any — excluded so it doesn't reserve against itself.
export async function grantTickets(
  admin: any,
  opts: { tribeId: string; tournamentId: string; userId: string; count: number; requestId?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  let pendingQuery = (admin.from('sweep_payment_requests') as any)
    .select('tickets_requested').eq('tribe_id', opts.tribeId).eq('status', 'pending')
  if (opts.requestId) pendingQuery = pendingQuery.neq('id', opts.requestId)

  const [{ count: horseCount }, { count: existingTickets }, { data: pendingRows }] = await Promise.all([
    (admin.from('sweep_horses') as any).select('id', { count: 'exact', head: true })
      .eq('tournament_id', opts.tournamentId).eq('scratched', false),
    (admin.from('sweep_entries') as any).select('id', { count: 'exact', head: true }).eq('tribe_id', opts.tribeId),
    pendingQuery,
  ])
  const field = horseCount ?? 0
  const existing = existingTickets ?? 0
  const reserved = ((pendingRows ?? []) as any[]).reduce((sum, r) => sum + r.tickets_requested, 0)
  if (existing + reserved + opts.count > field) {
    const left = Math.max(0, field - existing - reserved)
    return {
      ok: false,
      error: `This pool has ${existing} of ${field} tickets out${reserved ? ` and ${reserved} held by pending requests` : ''}`
        + ` — only ${left} left, so ${opts.count} would oversell it.`,
    }
  }

  const rows = Array.from({ length: opts.count }, () => ({ tribe_id: opts.tribeId, user_id: opts.userId, horse_id: null }))
  const { data: inserted, error } = await (admin.from('sweep_entries') as any).insert(rows).select('id')
  if (error) return { ok: false, error: error.message }

  // Count-then-insert isn't atomic: two approvals landing together could both pass the check
  // above. Recount after inserting and back ours out if the pool went over.
  const { count: after } = await (admin.from('sweep_entries') as any)
    .select('id', { count: 'exact', head: true }).eq('tribe_id', opts.tribeId)
  if ((after ?? 0) > field) {
    await (admin.from('sweep_entries') as any).delete().in('id', ((inserted ?? []) as any[]).map(r => r.id))
    return { ok: false, error: 'Another ticket was granted at the same moment and this pool is now full — refresh and try again.' }
  }
  return { ok: true }
}
