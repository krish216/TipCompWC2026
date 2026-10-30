import { sendSweepJoined, sendSweepOrganiserWelcome } from '@/lib/sweep/emails'
import { loadField } from '@/lib/sweep/field'
import { isPracticeSlug } from '@/lib/sweep/practice'
import { getOrganiserDetails } from '@/lib/sweep/organiser'

// Who gets which "welcome" in a sweep. Sweeps never send the tournament welcome
// (lib/welcome-email.ts): an organiser gets the "how to run it" guide on their first sweep, and
// a joiner gets "you're in" for each sweep they join. Both never throw — a mail problem must
// not fail creating or joining a sweep.

// Once per organiser, on their first real sweep — practice runs get no welcome and don't use
// it up. Claimed before sending so two sweeps created at once can't both send it; before
// migration 204 the claim fails and nothing is sent.
export async function welcomeOrganiserIfFirst(admin: any, opts: { userId: string; compId: string }): Promise<void> {
  try {
    const { data: comp } = await (admin.from('comps') as any)
      .select('name, tournaments(slug)').eq('id', opts.compId).maybeSingle()
    const tourn = Array.isArray((comp as any)?.tournaments) ? (comp as any).tournaments[0] : (comp as any)?.tournaments
    if (!comp || isPracticeSlug(tourn?.slug)) return

    const { data: claimed } = await (admin.from('users') as any)
      .update({ sweep_organiser_welcomed_at: new Date().toISOString() })
      .eq('id', opts.userId).is('sweep_organiser_welcomed_at', null)
      .select('email, display_name').maybeSingle()
    if (!(claimed as any)?.email) return

    await sendSweepOrganiserWelcome({
      email:    (claimed as any).email,
      name:     (claimed as any).display_name,
      compName: (comp as any).name,
      compId:   opts.compId,
    })
  } catch (e: any) {
    console.error('[sweep/welcome] organiser welcome failed:', e?.message ?? e)
  }
}

// "You're in" — when someone newly joins a sweep's pool. Not for practice sweeps.
export async function sendJoinedEmail(admin: any, opts: { userId: string; compId: string }): Promise<void> {
  try {
    const [{ data: user }, { data: comp }] = await Promise.all([
      (admin.from('users') as any).select('email, display_name').eq('id', opts.userId).maybeSingle(),
      (admin.from('comps') as any)
        .select('name, owner_name, tournament_id, tournaments(name, slug, race_start_at)').eq('id', opts.compId).maybeSingle(),
    ])
    if (!(user as any)?.email || !comp) return
    const tourn = Array.isArray((comp as any).tournaments) ? (comp as any).tournaments[0] : (comp as any).tournaments
    if (isPracticeSlug(tourn?.slug)) return

    const [field, organiser] = await Promise.all([
      loadField(admin, (comp as any).tournament_id),
      getOrganiserDetails(admin, opts.compId),
    ])
    await sendSweepJoined({
      email:         (user as any).email,
      name:          (user as any).display_name,
      compName:      (comp as any).name,
      compId:        opts.compId,
      organiserName: organiser.contact_name ?? (comp as any).owner_name ?? null,
      raceName:      tourn?.name ?? null,
      raceStartAt:   tourn?.race_start_at ?? null,
      drawOpen:      field.drawOpen,
    })
  } catch (e: any) {
    console.error('[sweep/welcome] joined email failed:', e?.message ?? e)
  }
}
