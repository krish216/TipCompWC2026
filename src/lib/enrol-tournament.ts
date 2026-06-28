import { isBonusTeamLocked } from '@/lib/tournament-lock'
import { pickAliveTeam } from '@/lib/bonus-team'
import { sendWelcomeIfNeeded } from '@/lib/welcome-email'

// Single source of truth for enrolling a user into a tournament: writes the
// user_tournaments row (idempotent) so the player is fully tracked, assigning a
// favourite/bonus team per the lock rules.
//
// IMPORTANT: call this AWAITED and in-process. The bracket guest-entry path used
// to enrol via a fire-and-forget fetch() to /api/user-tournaments/enrol, which
// serverless can drop the instant the response returns — that left guest accounts
// without a user_tournaments row. Enrolment must be part of the awaited critical
// path. Returns { ok } so callers can log a failure without losing the user.
export async function enrolInTournament(
  admin: any,
  opts: { userId: string; tournamentId: string; favouriteTeam?: string | null; sendWelcome?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  const { userId, tournamentId } = opts
  if (!userId || !tournamentId) return { ok: false, error: 'user_id and tournament_id required' }

  const { data: tourn } = await admin.from('tournaments').select('id').eq('id', tournamentId).maybeSingle()
  if (!tourn) return { ok: false, error: 'Tournament not found' }

  // Bonus team freezes at the first real kickoff. Enrolment still succeeds after
  // that — we just auto-allocate a still-alive (R32) team instead of honouring a
  // (now-disallowed) chosen favourite, and never clobber an existing pick.
  const locked = await isBonusTeamLocked(admin, tournamentId)
  const row: any = { user_id: userId, tournament_id: tournamentId }
  if (!locked) {
    row.favourite_team = opts.favouriteTeam || null
  } else {
    const { data: existing } = await admin
      .from('user_tournaments').select('favourite_team')
      .eq('user_id', userId).eq('tournament_id', tournamentId).maybeSingle()
    if (!(existing as any)?.favourite_team) {
      const auto = await pickAliveTeam(admin, tournamentId)
      if (auto) { row.favourite_team = auto; row.favourite_team_auto = true }
    }
  }

  const { error } = await (admin.from('user_tournaments') as any)
    .upsert(row, { onConflict: 'user_id,tournament_id', ignoreDuplicates: false })
  if (error) return { ok: false, error: error.message }

  // Welcome email (idempotent). Best-effort — a mail hiccup must not fail enrolment.
  if (opts.sendWelcome !== false) {
    await sendWelcomeIfNeeded(userId, tournamentId).catch(() => {})
  }
  return { ok: true }
}
