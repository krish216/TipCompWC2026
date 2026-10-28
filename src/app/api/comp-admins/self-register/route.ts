import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { createNotifications } from '@/lib/notifications'

// POST /api/comp-admins/self-register
// Assigns a user to an org using the org's invite code.
// Regular join: assigns org membership only (no org admin role).
// The invite code is proof of authorisation to join.
export async function POST(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { comp_id, invite_code } = await request.json()
  if (!comp_id || !invite_code) {
    return NextResponse.json({ error: 'comp_id and invite_code required' }, { status: 400 })
  }

  // Verify the invite code matches the org
  const { data: org } = await supabase
    .from('comps')
    .select('id, invite_code, name, email_domain, tournament_id, max_tribe_size, max_tribes, tribes_closed_at')
    .eq('id', comp_id)
    .eq('invite_code', invite_code.toUpperCase())
    .neq('slug', 'public')
    .maybeSingle()

  if (!org) return NextResponse.json({ error: 'Invalid comp code' }, { status: 403 })

  // Check email domain restriction if set
  const orgEmailDomain = (org as any).email_domain ?? null
  if (orgEmailDomain) {
    const userEmail  = user.email ?? ''
    const userDomain = userEmail.split('@')[1]?.toLowerCase() ?? ''
    if (userDomain !== orgEmailDomain.toLowerCase()) {
      return NextResponse.json({
        error: `This comp is restricted to ${orgEmailDomain} email addresses. Your email (${userEmail}) does not match.`
      }, { status: 403 })
    }
  }

  // Enrol in user_comps (multi-comp membership table)
  await (adminClient.from('user_comps') as any).upsert(
    { user_id: user.id, comp_id },
    { onConflict: 'user_id,comp_id' }
  )

  // Clean up any invitation row for this user's email — no longer needed
  if (user.email) {
    await (adminClient.from('comp_invitations') as any)
      .delete()
      .eq('comp_id', comp_id)
      .ilike('email', user.email)
  }

  // Auto-enrol in a tribe with room, oldest first. If every existing tribe is full, open a
  // new one — up to max_tribes, and only while the admin hasn't closed pool creation
  // (tribes_closed_at). Past that, no tribe is created or assigned; the admin gets a
  // notification instead so they can raise max_tribes or reopen if they want this person in.
  let tribeAssigned = false
  let compFull = false
  const { data: compTribes } = await (adminClient.from('tribes') as any)
    .select('id, is_default, created_at, sweep_locked_at').eq('comp_id', comp_id).order('created_at', { ascending: true })
  const tribes = (compTribes ?? []) as { id: string; is_default: boolean; created_at: string; sweep_locked_at: string | null }[]
  const compTribeIds = tribes.map(t => t.id)

  const { count: alreadyInTribe } = await (adminClient.from('tribe_members') as any)
    .select('*', { count: 'exact', head: true }).eq('user_id', user.id).in('tribe_id', compTribeIds)

  if (alreadyInTribe) {
    tribeAssigned = true   // already placed somewhere in this comp — idempotent re-join
  } else {
    const maxTribeSize = (org as any).max_tribe_size ?? 15
    const maxTribes     = (org as any).max_tribes ?? 10
    const closedAt       = (org as any).tribes_closed_at ?? null

    const { data: tourn } = (org as any).tournament_id
      ? await (adminClient.from('tournaments') as any).select('format').eq('id', (org as any).tournament_id).maybeSingle()
      : { data: null }
    const isSweep = (tourn as any)?.format === 'sweep'

    let targetTribeId: string | null = null
    if (tribes.length > 0) {
      // "Room" means different things per comp type. Football: fewer than max_tribe_size
      // members. Sweep: horses still unsold — one person can hold several tickets, so a
      // member count says nothing about whether a newcomer could actually buy in. Counted
      // exactly as the ticket-request oversell guard does (sold + pending vs field size),
      // so a joiner is never placed in a pool they'd then be refused tickets in.
      let hasRoom: (tribeId: string) => boolean
      if (isSweep) {
        const [{ count: fieldSize }, { data: entryRows }, { data: pendingRows }] = await Promise.all([
          (adminClient.from('sweep_horses') as any).select('id', { count: 'exact', head: true }).eq('tournament_id', (org as any).tournament_id),
          (adminClient.from('sweep_entries') as any).select('tribe_id').in('tribe_id', compTribeIds),
          (adminClient.from('sweep_payment_requests') as any).select('tribe_id, tickets_requested').in('tribe_id', compTribeIds).eq('status', 'pending'),
        ])
        const reservedByTribe: Record<string, number> = {}
        for (const e of (entryRows ?? []) as any[]) reservedByTribe[e.tribe_id] = (reservedByTribe[e.tribe_id] ?? 0) + 1
        for (const r of (pendingRows ?? []) as any[]) reservedByTribe[r.tribe_id] = (reservedByTribe[r.tribe_id] ?? 0) + r.tickets_requested
        // No field loaded yet → can't judge fullness, so every pool counts as open (joiners
        // fill the oldest first, same as before any tickets exist).
        hasRoom = id => !fieldSize || (reservedByTribe[id] ?? 0) < fieldSize
      } else {
        const { data: memberRows } = await (adminClient.from('tribe_members') as any)
          .select('tribe_id').in('tribe_id', compTribeIds)
        const countByTribe: Record<string, number> = {}
        for (const m of (memberRows ?? []) as any[]) countByTribe[m.tribe_id] = (countByTribe[m.tribe_id] ?? 0) + 1
        hasRoom = id => (countByTribe[id] ?? 0) < maxTribeSize
      }
      // A locked sweep pool (manually or via the 30-min auto-lock) never gets new joiners,
      // regardless of headroom — same as it rejects new picks/ticket requests.
      const roomy = tribes.find(t => !t.sweep_locked_at && hasRoom(t.id))
      targetTribeId = roomy?.id ?? null
    }

    if (!targetTribeId && !closedAt && tribes.length < maxTribes) {
      const { data: newTribe, error: newTribeErr } = await (adminClient.from('tribes') as any)
        .insert({
          name:          `${(org as any).name} Pool ${tribes.length + 1}`,
          created_by:    user.id,
          invite_code:   Math.random().toString(36).substring(2, 10).toUpperCase(),
          comp_id,
          tournament_id: (org as any).tournament_id ?? null,
          is_default:    false,
        })
        .select('id').single()
      if (!newTribeErr && newTribe) targetTribeId = (newTribe as any).id
    }

    if (targetTribeId) {
      await (adminClient.from('tribe_members') as any)
        .upsert({ user_id: user.id, tribe_id: targetTribeId }, { onConflict: 'user_id,tribe_id', ignoreDuplicates: true })
      tribeAssigned = true
    } else {
      // Every tribe full, and either closed or at the tribe-count cap — nowhere to put them.
      compFull = true
      const { data: admins } = await (adminClient.from('comp_admins') as any).select('user_id').eq('comp_id', comp_id)
      const { data: joiner } = await (adminClient.from('users') as any).select('display_name').eq('id', user.id).maybeSingle()
      await createNotifications(((admins ?? []) as any[]).map(a => ({
        user_id: a.user_id,
        type:    'comp_full_request' as const,
        title:   `${(joiner as any)?.display_name ?? 'Someone'} wants into ${(org as any).name} — every pool is full`,
        body:    closedAt
          ? 'Pool creation is closed for this comp. Reopen it, or raise the pool count, to let them in.'
          : isSweep
          ? `All ${maxTribes} pools are sold out. Add a pool in Organiser settings → Settings to let them in.`
          : `All ${maxTribes} pools have reached max_tribe_size. Raise max_tribes to open another pool for them.`,
        data:    { comp_id, user_id: user.id },
      })))
    }
  }

  // Default the joiner's app to this comp's tournament + comp, so the invite link lands
  // them here (e.g. the EPL co-design cohort opens straight on EPL, not the still-active
  // World Cup). They can switch tournaments anytime from the banner switcher.
  // Sweeps are the exception: they never join the global tournament rotation (migration
  // 188), so joining one must not overwrite the user's football selection — otherwise an
  // EPL user who follows a Melbourne Cup invite ends up with the sweep as their global
  // tournament. Only the per-tournament memory below is written for a sweep.
  const compTournId = (org as any).tournament_id ?? null
  let isSweepTourn = false
  if (compTournId) {
    const { data: tourn } = await (adminClient.from('tournaments') as any)
      .select('format').eq('id', compTournId).maybeSingle()
    isSweepTourn = (tourn as any)?.format === 'sweep'
  }
  if (compTournId) {
    if (!isSweepTourn) {
      await (adminClient.from('user_preferences') as any).upsert(
        { user_id: user.id, tournament_id: compTournId, comp_id },
        { onConflict: 'user_id' }
      )
    }
    // Per-tournament comp memory, so switching away and back restores this comp.
    await (adminClient.from('user_tournaments') as any).upsert(
      { user_id: user.id, tournament_id: compTournId, selected_comp_id: comp_id },
      { onConflict: 'user_id,tournament_id' }
    )
  }

  return NextResponse.json({
    success: true, comp_name: (org as any).name, tribe_assigned: tribeAssigned, comp_full: compFull,
  })
}
