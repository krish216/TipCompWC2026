// The 2-hour spin window (migration 205). A ticket's holder gets DRAW_GRACE_HOURS to spin it
// themselves before the organiser can "Draw for them". The clock starts when the ticket could
// first be spun: when it was granted, or when the draw opened, whichever is later. After that
// the organiser may draw for it; 30 minutes before the race TribePicks draws whatever's left
// (the sweep-auto-lock cron). Practice sweeps have no window — the organiser is testing alone
// with a pretend crew they draw for straight away.

export const DRAW_GRACE_HOURS = 2
const GRACE_MS = DRAW_GRACE_HOURS * 60 * 60 * 1000
const AUTO_DRAW_LEAD_MS = 30 * 60 * 1000

// When the organiser can first draw for this ticket. Null → straight away.
export function drawForUnlocksAt(ticketJoinedAt: string | null, drawOpenedAt: string | null): Date | null {
  const since = Math.max(
    ticketJoinedAt ? Date.parse(ticketJoinedAt) : 0,
    drawOpenedAt ? Date.parse(drawOpenedAt) : 0,
  )
  return since ? new Date(since + GRACE_MS) : null
}

// "1h 42m" / "12m" — the window counting down, on the pool page and in sweep-admin.
export function fmtLeft(ms: number): string {
  const mins = Math.max(1, Math.ceil(ms / 60_000))
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`
}

// When TribePicks draws every unspun ticket (the cron locks pools 30 minutes before the jump).
export const autoDrawAt = (raceStartAt: string | null) =>
  raceStartAt ? new Date(Date.parse(raceStartAt) - AUTO_DRAW_LEAD_MS) : null

// Before migration 205 the column doesn't exist — no opened-at time, so the window runs from
// each ticket's grant alone.
export async function loadDrawOpenedAt(admin: any, tournamentId: string): Promise<string | null> {
  const { data, error } = await (admin.from('tournaments') as any)
    .select('sweep_draw_opened_at').eq('id', tournamentId).maybeSingle()
  return error ? null : (data as any)?.sweep_draw_opened_at ?? null
}
