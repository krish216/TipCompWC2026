import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { APPROVAL_WINDOWS, getOrganiserDetails, normalisePayId, payIdKind, type PayIdKind } from '@/lib/sweep/organiser'
import { billingInfo } from '@/lib/sweep/billing'

export const dynamic = 'force-dynamic'

// Validates + normalises the organiser_details block. Blank strings clear a field.
function parseOrganiserDetails(raw: any): { value: Record<string, any> } | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'organiser_details must be an object' }
  const out: Record<string, any> = {}
  const text = (v: any, max: number) => {
    if (v === undefined) return undefined
    const s = String(v ?? '').trim()
    return s ? s.slice(0, max) : null
  }

  if (raw.approval_window_hours !== undefined) {
    if (!(APPROVAL_WINDOWS as readonly number[]).includes(raw.approval_window_hours)) {
      return { error: `Approval window must be one of ${APPROVAL_WINDOWS.join(', ')} hours.` }
    }
    out.approval_window_hours = raw.approval_window_hours
  }

  const bsb = text(raw.bank_bsb, 7)
  if (bsb !== undefined) {
    const digits = bsb?.replace(/\D/g, '') ?? null
    if (digits && digits.length !== 6) return { error: 'BSB must be 6 digits.' }
    out.bank_bsb = digits ? `${digits.slice(0, 3)}-${digits.slice(3)}` : null
  }
  const acct = text(raw.bank_account_number, 12)
  if (acct !== undefined) {
    const digits = acct?.replace(/\D/g, '') ?? null
    if (digits && (digits.length < 5 || digits.length > 10)) return { error: 'Account number must be 5–10 digits.' }
    out.bank_account_number = digits || null
  }
  const email = text(raw.contact_email, 120)
  if (email !== undefined) {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'That contact email doesn\'t look right.' }
    out.contact_email = email
  }
  // PayID: the client sends its chosen kind alongside, so "0412…" typed under Email is
  // caught rather than guessed at; with no kind given, infer it from the value.
  const payid = text(raw.payid, 120)
  if (payid !== undefined) {
    if (!payid) out.payid = null
    else {
      const kind: PayIdKind = ['mobile', 'email', 'abn'].includes(raw.payid_kind) ? raw.payid_kind : payIdKind(payid)!
      const norm = normalisePayId(kind, payid)
      if ('error' in norm) return { error: norm.error }
      out.payid = norm.value
    }
  }
  for (const [key, max] of [['bank_account_name', 80], ['contact_name', 60], ['contact_phone', 30]] as const) {
    const v = text(raw[key], max)
    if (v !== undefined) out[key] = v
  }
  return { value: out }
}

const APPROVAL_MODES = ['manual', 'auto']
const LEFTOVER_MODES = ['none', 'auto_assign_organiser']

async function authorize(admin: any, compId: string, userId: string) {
  const [{ data: comp }, { data: compAdminRow }, { data: platformAdmin }] = await Promise.all([
    (admin.from('comps') as any).select('created_by, tournament_id').eq('id', compId).maybeSingle(),
    (admin.from('comp_admins') as any).select('user_id').eq('user_id', userId).eq('comp_id', compId).maybeSingle(),
    (admin.from('admin_users') as any).select('user_id').eq('user_id', userId).maybeSingle(),
  ])
  if (!comp) return { ok: false as const, status: 404, error: 'Comp not found' }
  if ((comp as any).created_by !== userId && !compAdminRow && !platformAdmin) {
    return { ok: false as const, status: 403, error: 'Forbidden' }
  }
  const { data: tourn } = await (admin.from('tournaments') as any)
    .select('format').eq('id', (comp as any).tournament_id).maybeSingle()
  if ((tourn as any)?.format !== 'sweep') return { ok: false as const, status: 400, error: 'This comp is not a sweep' }
  return { ok: true as const, tournamentId: (comp as any).tournament_id as string }
}

// GET /api/comps/:id/sweep-settings — the organiser's own settings for their sweep comp.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const gate = await authorize(admin, params.id, user.id)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { data, error } = await (admin.from('comps') as any)
    .select('allow_iou, sweep_approval_mode, sweep_leftover_mode, max_tribes, owner_name, created_by').eq('id', params.id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // For now the pool count can only go up — the floor is the current setting itself.
  const minMaxTribes = Math.max((data as any)?.max_tribes ?? 1, await usedPoolCount(admin, params.id))

  // Contact name defaults to the comp's owner name, else the creator's display name, so the
  // organiser rarely has to type it.
  const details = await getOrganiserDetails(admin, params.id)
  if (!details.contact_name) {
    const { data: creator } = await (admin.from('users') as any).select('display_name').eq('id', (data as any)?.created_by).maybeSingle()
    details.contact_name = (data as any)?.owner_name ?? (creator as any)?.display_name ?? null
  }
  const { owner_name: _o, created_by: _c, ...settings } = (data ?? {}) as any
  return NextResponse.json({ data: settings, min_max_tribes: minMaxTribes, organiser_details: details, billing: billingInfo() })
}

// A pool counts as "used" (filled or partially filled) once it has at least one ticket —
// max_tribes can never drop below however many of those exist, since each one represents a
// real commitment; pools with zero tickets are just unused capacity and can be given up.
async function usedPoolCount(admin: any, compId: string): Promise<number> {
  const { data: tribes } = await admin.from('tribes').select('id').eq('comp_id', compId)
  const tribeIds = ((tribes ?? []) as any[]).map(t => t.id)
  if (!tribeIds.length) return 0
  const { data: entries } = await admin.from('sweep_entries').select('tribe_id').in('tribe_id', tribeIds)
  return new Set(((entries ?? []) as any[]).map(e => e.tribe_id)).size
}

// PATCH /api/comps/:id/sweep-settings — organiser-only, sweep-specific comp settings.
// Kept separate from /api/comps/create's generic PATCH (shared by every comp type) so these
// enums can be hard-validated and the route can hard-gate on format==='sweep'. Same
// partial-update idiom: only fields present in the body are touched.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const gate = await authorize(admin, params.id, user.id)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const body = await request.json().catch(() => null)
  // (reveal_mode is gone — every sweep now works one way: you see only your own horses until
  // the pool closes. The comps.sweep_reveal_mode column is left in place but no longer read.)
  const { allow_iou, approval_mode, leftover_horse_mode, max_tribes } = body ?? {}

  if (approval_mode !== undefined && !APPROVAL_MODES.includes(approval_mode)) {
    return NextResponse.json({ error: `approval_mode must be one of: ${APPROVAL_MODES.join(', ')}` }, { status: 400 })
  }
  if (leftover_horse_mode !== undefined && !LEFTOVER_MODES.includes(leftover_horse_mode)) {
    return NextResponse.json({ error: `leftover_horse_mode must be one of: ${LEFTOVER_MODES.join(', ')}` }, { status: 400 })
  }
  // Pool count isn't settable here any more — adding pools is a purchase (even while billing
  // is off, when it's a free one), via POST /api/comps/:id/sweep/pools/purchase. See
  // src/lib/sweep/billing.ts. Pools can't be removed.
  if (max_tribes !== undefined) {
    return NextResponse.json({ error: 'Add pools via /api/comps/:id/sweep/pools/purchase.' }, { status: 400 })
  }

  // Payment + contact details go to sweep_organiser_details, not comps (see migration 195).
  let details: Record<string, any> | null = null
  if (body?.organiser_details !== undefined) {
    const parsed = parseOrganiserDetails(body.organiser_details)
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
    details = parsed.value
  }

  const update: Record<string, any> = {}
  if (allow_iou !== undefined) update.allow_iou = !!allow_iou
  if (approval_mode !== undefined) update.sweep_approval_mode = approval_mode
  if (leftover_horse_mode !== undefined) update.sweep_leftover_mode = leftover_horse_mode
  if (Object.keys(update).length === 0 && !details) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  if (Object.keys(update).length > 0) {
    const { error } = await (admin.from('comps') as any).update(update).eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (details) {
    const { error } = await (admin.from('sweep_organiser_details') as any)
      .upsert({ comp_id: params.id, ...details, updated_at: new Date().toISOString() }, { onConflict: 'comp_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
