import { createNotifications } from '@/lib/notifications'
import { getPrimaryTournament } from '@/lib/content/wc'

// Auto Round Debrief — posts the satirical per-round tribe wrap-up automatically
// once a knockout round is fully scored, off the 5-min scores cron. Group-stage
// debriefs are handled separately (a one-off combined GS post), so only knockout
// rounds are auto-posted here. Idempotent per (tribe, round).

const MIN_MEMBERS = 4
const APP = process.env.NEXT_PUBLIC_APP_URL || 'https://www.tribepicks.com'

// Knockout rounds in order, with a human label for the chat message / notification.
const KO_ROUNDS: [string, string][] = [
  ['r32', 'Round of 32'], ['r16', 'Round of 16'], ['qf', 'Quarter-finals'],
  ['sf', 'Semi-finals'], ['tp', 'Third-place Playoff'], ['final', 'Final'],
]

// Post the debrief for one round into every eligible tribe (>=4 members) of a
// tournament. Idempotent: skips tribes whose chat already has this round's link.
export async function postRoundDebriefToTribes(
  admin: any,
  opts: { tournamentId: string; round: string; label?: string },
): Promise<{ posted: number; notified: number; skipped: number }> {
  const { tournamentId, round, label } = opts
  const noun = `${label ?? 'Round'} Debrief`
  const seen = new RegExp(`round=${round}(?!\\d)`)   // round=r16 must not match r161 etc.

  const { data: tribes } = await admin.from('tribes').select('id, name').eq('tournament_id', tournamentId)
  let posted = 0, notified = 0, skipped = 0
  for (const tribe of (tribes ?? []) as any[]) {
    // Members via tribe_members (users.tribe_id was dropped in migration 044).
    const { data: tm } = await admin.from('tribe_members').select('user_id').eq('tribe_id', tribe.id)
    const ids = new Set<string>()
    ;(tm ?? []).forEach((r: any) => r.user_id && ids.add(r.user_id))
    if (ids.size < MIN_MEMBERS) { skipped++; continue }

    const { data: sys } = await admin.from('chat_messages').select('content')
      .eq('tribe_id', tribe.id).eq('is_system', true).ilike('content', '%round-debrief%')
    if ((sys ?? []).some((m: any) => seen.test(m.content || ''))) { skipped++; continue }

    // Tracked redirect → logs the click in report_link_clicks, then forwards to the
    // members-only debrief page. source distinguishes chat clicks from the card.
    const link = `${APP}/api/r/round-debrief?tribe_id=${tribe.id}&round=${round}&source=debrief_chat`
    const content = `🕵️ The ${noun} is in 👀 (members only) — who topped the tribe, and who bagged the Wooden Spoon? 🥄\n${link}`
    const { error } = await admin.from('chat_messages').insert({ tribe_id: tribe.id, user_id: null, is_system: true, content, round_code: null })
    if (error) { skipped++; continue }
    posted++

    await createNotifications([...ids].map(uid => ({
      user_id: uid, type: 'round_complete' as const,
      title: `🕵️ ${noun} is in`,
      body: 'See who topped your tribe — and who got the Wooden Spoon 🥄. Tap to open your tribe chat.',
      data: { href: '/tribe?tab=chat', tribe_id: tribe.id },
    })))
    notified += ids.size
  }
  return { posted, notified, skipped }
}

// For the active tournament, auto-post debriefs for every knockout round that is
// now fully scored. Idempotent — safe to call every cron tick.
export async function autoPostRoundDebriefs(admin: any): Promise<{ rounds: string[]; posted: number; notified: number }> {
  const out = { rounds: [] as string[], posted: 0, notified: 0 }
  const t = await getPrimaryTournament(admin)
  if (!t) return out

  for (const [round, label] of KO_ROUNDS) {
    const { data: fx } = await admin.from('fixtures').select('home_score').eq('tournament_id', t.id).eq('round', round)
    const fixtures = (fx ?? []) as any[]
    if (!fixtures.length || !fixtures.every(f => f.home_score != null)) continue   // round not fully scored
    const r = await postRoundDebriefToTribes(admin, { tournamentId: t.id, round, label })
    if (r.posted > 0) { out.rounds.push(round); out.posted += r.posted; out.notified += r.notified }
  }
  return out
}
