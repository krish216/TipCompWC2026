import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'
import { z } from 'zod'
import { buyPools, SWEEP_PRICING, sweepBillingEnabled } from '@/lib/sweep/billing'

const CreateSchema = z.object({
  name:        z.string().min(2).max(80).trim(),
  tournament_id: z.string().uuid().optional(),
  owner_name:  z.string().optional(),
  owner_phone: z.string().optional(),
  owner_email: z.string().optional(),
  user_id:     z.string().uuid(),
  // Optional user profile fields — upserted if user row doesn't exist yet
  display_name:   z.string().optional(),
  email:          z.string().email().optional(),
  country:        z.string().optional(),
  timezone:       z.string().optional(),
  // Open comp fields
  visibility:        z.enum(['private', 'open']).optional(),
  is_discoverable:   z.boolean().optional(),
  comp_category:     z.string().optional(),
  team_affiliation:  z.string().optional(),
  description:       z.string().max(300).optional(),
  prize_type:        z.enum(['none', 'chief_offers', 'pool']).optional(),
  prize_description: z.string().max(120).optional(),
  member_cap:        z.number().int().min(2).max(500).optional(),
  // Pool overflow cap (migration 189) — set at creation time so a sweep organiser doesn't
  // need a separate trip to comp-admin settings right after creating. Generic to every comp
  // type, but most relevant for sweeps, where each pool only holds as many tickets as the
  // race has horses, so a bigger event needs multiple pools from the start. Capped at 5 —
  // 5 pools x a typical ~20-24 horse field already covers well over 100 people.
  max_tribes:        z.number().int().min(1).max(5).optional(),
})

// POST /api/comps/create — self-service org creation
// Uses admin client throughout — no session required.
// user_id is passed explicitly because the browser session is not yet
// established when this is called immediately after signUp.
export async function POST(request: NextRequest) {
  const body   = await request.json().catch(() => null)
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Comp name and user_id are required' }, { status: 422 })
  }

  const {
    name, owner_name, owner_phone, owner_email, user_id,
    display_name, email, country, timezone,
    visibility, is_discoverable, comp_category, team_affiliation,
    description, prize_type, prize_description, member_cap, max_tribes,
  } = parsed.data

  const adminClient = createAdminClient()

  // Step 1: check org name is unique before doing anything
  const { data: existing } = await (adminClient.from('comps') as any)
    .select('id').ilike('name', name).single()
  if (existing) {
    return NextResponse.json({ error: 'An comp with this name already exists' }, { status: 409 })
  }

  // Step 2: upsert user row FIRST and wait for it to fully commit
  // This must happen before the org insert because of the FK constraint
  const { data: publicOrg } = await (adminClient.from('comps') as any)
    .select('id').eq('slug', 'public').single()
  const publicOrgId = (publicOrg as any)?.id ?? null

  const { error: userError } = await (adminClient.from('users') as any).upsert({
    id:             user_id,
    email:          email          ?? '',
    display_name:   display_name  ?? email?.split('@')[0] ?? 'Player',
    country:        country        || null,
    timezone:       timezone       || 'UTC',
    comp_id:         publicOrgId,
  }, { onConflict: 'id', ignoreDuplicates: false })

  if (userError) {
    console.error('[org/create] user upsert error:', userError)
    // Continue anyway — user may already exist from the trigger
  }

  // Is this a sweep? Decided before the insert because a sweep's pool count is bought: with
  // billing on, it starts with the free allowance and the rest goes through checkout below.
  let isSweepComp = false
  if (parsed.data.tournament_id) {
    const { data: tourn } = await (adminClient.from('tournaments') as any)
      .select('format, enrollment_open').eq('id', parsed.data.tournament_id).maybeSingle()
    isSweepComp = (tourn as any)?.format === 'sweep'
    // New sweeps can be paused per tournament (admin → Tournament → "New sweeps"), e.g. until
    // the race field is announced. Platform admins can still create one, for testing.
    if (isSweepComp && (tourn as any)?.enrollment_open === false) {
      const { data: platformAdmin } = await (adminClient.from('admin_users') as any)
        .select('user_id').eq('user_id', user_id).maybeSingle()
      if (!platformAdmin) {
        return NextResponse.json({ error: 'New sweeps open on Saturday 31 October, once the final field is declared — register your interest at /melbourne-cup.' }, { status: 403 })
      }
    }
  }
  const requestedPools = isSweepComp ? Math.max(1, Math.min(SWEEP_PRICING.maxPools, max_tribes ?? 1)) : 1
  const poolCount = isSweepComp && sweepBillingEnabled() ? Math.min(requestedPools, SWEEP_PRICING.includedPools) : requestedPools
  const poolsToBuy = requestedPools - poolCount

  // Step 3: create the org — user row is now guaranteed to exist
  const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const slug     = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`
  const code     = (Math.random().toString(36).substring(2, 6) +
                    Math.random().toString(36).substring(2, 6)).toUpperCase()

  const { data: org, error } = await (adminClient.from('comps') as any)
    .insert({
      name, slug,
      invite_code:       code,
      created_by:        user_id,
      owner_name:        owner_name  || null,
      owner_phone:       owner_phone || null,
      owner_email:       owner_email || null,
      is_self_created:   true,
      approved:          true,
      tournament_id:     parsed.data.tournament_id ?? null,
      visibility:        visibility        ?? 'private',
      is_discoverable:   is_discoverable   ?? false,
      comp_category:     comp_category     ?? null,
      team_affiliation:  team_affiliation  ?? null,
      description:       description       ?? null,
      prize_type:        prize_type        ?? 'none',
      prize_description: prize_description ?? null,
      member_cap:        member_cap        ?? null,
      ...(isSweepComp ? { max_tribes: poolCount } : max_tribes !== undefined ? { max_tribes } : {}),
    })
    .select().single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'An comp with this name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const compId = (org as any).id

  // Step 4: assign user to new comp, enrol in user_comps, and grant comp admin
  await Promise.all([
    (adminClient.from('comp_admins') as any).upsert({ comp_id: compId, user_id }),
    (adminClient.from('user_comps') as any).upsert(
      { user_id, comp_id: compId },
      { onConflict: 'user_id,comp_id' }
    ),
  ])

  // Step 5: auto-create the comp's tribe(s). For a sweep, the organiser said upfront how
  // many pools this sweep needs (max_tribes) — create all of them now rather than relying
  // on self-register to lazily add one once the first fills, so "My Pools" shows the full
  // set (as pills) from the moment the sweep exists, matching what the organiser configured.
  const tribeRows = Array.from({ length: poolCount }, (_, i) => ({
    name: isSweepComp
      ? (poolCount > 1 ? `Pool ${i + 1}` : 'Pool')
      : `${name} Tribe`,
    created_by:    user_id,
    invite_code:   (Math.random().toString(36).substring(2, 10) + i).toUpperCase().slice(0, 10),
    comp_id:       compId,
    tournament_id: parsed.data.tournament_id ?? null,
    is_default:    i === 0,
  }))
  const { data: createdTribes, error: tribeError } = await (adminClient.from('tribes') as any)
    .insert(tribeRows).select('id, is_default')

  if (tribeError) {
    console.error('[comps/create] tribe auto-create failed (non-fatal):', tribeError)
  } else if (createdTribes?.length) {
    // Creator only joins the default (first) pool as a member — they're already admin of
    // every pool under the comp via comp_admins, no need to be a "buyer" in all of them.
    const defaultTribe = (createdTribes as any[]).find(t => t.is_default) ?? createdTribes[0]
    await (adminClient.from('tribe_members') as any)
      .insert({ user_id, tribe_id: (defaultTribe as any).id })
  }

  // Default the creator's app onto this comp's tournament, same as self-register already
  // does when joining via a code — otherwise the creator of a brand-new sweep (or any comp
  // for a tournament they weren't already in) never gets a user_preferences/user_tournaments
  // row for it, and the nav has nothing to pick up even after a reload.
  const tournId = parsed.data.tournament_id ?? null
  if (tournId) {
    await (adminClient.from('user_preferences') as any).upsert(
      { user_id, tournament_id: tournId, comp_id: compId },
      { onConflict: 'user_id' }
    )
    await (adminClient.from('user_tournaments') as any).upsert(
      { user_id, tournament_id: tournId, selected_comp_id: compId },
      { onConflict: 'user_id,tournament_id' }
    )
  }

  // Extra pools beyond the free allowance: hand back a checkout URL for the client to follow.
  // The sweep already exists with its free pool(s) — if checkout is abandoned, the organiser
  // can add pools later from Settings.
  if (poolsToBuy > 0) {
    const checkout = await buyPools(adminClient, { compId, userId: user_id, pools: poolsToBuy })
    if ('error' in checkout) {
      return NextResponse.json({ data: org, pool_purchase_error: checkout.error }, { status: 201 })
    }
    if (checkout.kind === 'redirect') {
      return NextResponse.json({ data: org, checkout_url: checkout.url }, { status: 201 })
    }
  }

  return NextResponse.json({ data: org }, { status: 201 })
}

// PATCH /api/comps/create — update comp settings
export async function PATCH(request: NextRequest) {
  createServerSupabaseClient()
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const {
    comp_id, logo_url, min_age, name, requires_payment_fee, entry_fee_amount, max_tribe_size,
    max_tribes, tribes_closed,
    visibility, is_discoverable, comp_category, team_affiliation,
    description, prize_type, prize_description, member_cap, auto_reminder, featured,
  } = body ?? {}
  // auto_reminder: 'off', legacy 'both', or a comma list of lead hours from {48,24,3}.
  const validReminder = typeof auto_reminder === 'string' && (
    auto_reminder === 'off' || auto_reminder === 'both' ||
    auto_reminder.split(',').every((p: string) => ['48', '24', '3'].includes(p.trim()))
  )
  if (!comp_id) {
    return NextResponse.json({ error: 'comp_id required' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Verify caller is comp admin, tournament admin, or created the comp
  const [{ data: org }, { data: compAdminRow }, { data: tournAdmin }] = await Promise.all([
    (adminClient.from('comps') as any).select('created_by, tournament_id').eq('id', comp_id).single(),
    (adminClient.from('comp_admins') as any).select('user_id').eq('user_id', user.id).eq('comp_id', comp_id).single(),
    adminClient.from('admin_users').select('user_id').eq('user_id', user.id).single(),
  ])
  if (!org || ((org as any).created_by !== user.id && !compAdminRow && !tournAdmin)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // A sweep's pool count is bought, not set (src/lib/sweep/billing.ts) — don't let this
  // generic route raise it around the purchase.
  if (max_tribes !== undefined && (org as any).tournament_id) {
    const { data: tourn } = await (adminClient.from('tournaments') as any)
      .select('format').eq('id', (org as any).tournament_id).maybeSingle()
    if ((tourn as any)?.format === 'sweep') {
      return NextResponse.json({ error: 'Add sweep pools from the sweep organiser page.' }, { status: 400 })
    }
  }

  await (adminClient.from('comps') as any)
    .update({
      ...(name                 !== undefined ? { name:                 name ?? null                  } : {}),
      ...(logo_url             !== undefined ? { logo_url }                                           : {}),
      ...(min_age              !== undefined ? { min_age:              min_age ?? null               } : {}),
      ...(requires_payment_fee !== undefined ? { requires_payment_fee: requires_payment_fee ?? false } : {}),
      ...(entry_fee_amount     !== undefined ? { entry_fee_amount:     entry_fee_amount ?? null      } : {}),
      ...(max_tribe_size       !== undefined ? { max_tribe_size:       max_tribe_size ?? 15          } : {}),
      ...(max_tribes           !== undefined ? { max_tribes:           max_tribes ?? 10              } : {}),
      // tribes_closed is a boolean toggle from the client; stored as a timestamp (set = closed,
      // null = open) so the overflow logic in self-register can tell closed-and-reopened apart
      // from never-touched without a separate flag.
      ...(tribes_closed        !== undefined ? { tribes_closed_at: tribes_closed ? new Date().toISOString() : null } : {}),
      ...(visibility           !== undefined ? { visibility }                                         : {}),
      ...(is_discoverable      !== undefined ? { is_discoverable }                                    : {}),
      ...(comp_category        !== undefined ? { comp_category }                                      : {}),
      ...(team_affiliation     !== undefined ? { team_affiliation }                                   : {}),
      ...(description          !== undefined ? { description }                                        : {}),
      ...(prize_type           !== undefined ? { prize_type }                                         : {}),
      ...(prize_description    !== undefined ? { prize_description }                                  : {}),
      ...(member_cap           !== undefined ? { member_cap }                                         : {}),
      ...(validReminder                      ? { auto_reminder }                                       : {}),
      ...(featured             !== undefined ? { featured: !!featured }                               : {}),
    }).eq('id', comp_id)

  return NextResponse.json({ success: true })
}

// DELETE /api/comps/create — comp admin permanently deletes their comp
export async function DELETE(request: NextRequest) {
  createServerSupabaseClient()
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { comp_id } = await request.json().catch(() => ({}))
  if (!comp_id) return NextResponse.json({ error: 'comp_id required' }, { status: 400 })

  const adminClient = createAdminClient()

  const [{ data: compAdminRow }, { data: tournAdmin }] = await Promise.all([
    (adminClient.from('comp_admins') as any).select('user_id').eq('user_id', user.id).eq('comp_id', comp_id).single(),
    adminClient.from('admin_users').select('user_id').eq('user_id', user.id).single(),
  ])
  if (!compAdminRow && !tournAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Cascade: remove tribe members then tribes before deleting the comp (FK constraints)
  const { data: tribeRows } = await (adminClient.from('tribes') as any)
    .select('id').eq('comp_id', comp_id)
  const tribeIds = (tribeRows ?? []).map((t: any) => t.id)

  // Sweep-specific safety check: tribes cascade-deletes sweep_entries and
  // sweep_payment_requests (migrations 188/193), so deleting a sweep that's already sold
  // tickets would silently wipe real money/stake records, not just an empty shell comp.
  // Blocked here rather than only relying on UI — this route is shared by every comp type.
  if (tribeIds.length > 0) {
    const [{ count: ticketCount }, { count: requestCount }] = await Promise.all([
      (adminClient.from('sweep_entries') as any).select('id', { count: 'exact', head: true }).in('tribe_id', tribeIds),
      (adminClient.from('sweep_payment_requests') as any).select('id', { count: 'exact', head: true }).in('tribe_id', tribeIds),
    ])
    if ((ticketCount ?? 0) > 0 || (requestCount ?? 0) > 0) {
      return NextResponse.json({
        error: 'This sweep already has tickets or requests — it can’t be deleted once selling has started.',
      }, { status: 409 })
    }
  }

  if (tribeIds.length > 0) {
    await (adminClient.from('tribe_members') as any).delete().in('tribe_id', tribeIds)
    await (adminClient.from('tribes') as any).delete().eq('comp_id', comp_id)
  }

  const { error } = await (adminClient.from('comps') as any).delete().eq('id', comp_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
