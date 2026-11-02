import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

async function requireAdmin() {
  const user = await getSessionUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data } = await (admin.from('admin_users') as any).select('user_id').eq('user_id', user.id).maybeSingle()
  return data ? user.id : null
}

// Every row of a query, past PostgREST's 1,000-row page.
async function all<T>(query: () => any): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query().range(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return out
  }
}

// In chunks — a long .in() list overflows the request URL.
async function allIn<T>(ids: string[], query: (chunk: string[]) => any): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += 200) out.push(...await all<T>(() => query(ids.slice(i, i + 200))))
  return out
}

const melbDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' })   // YYYY-MM-DD
const DAYS = 14

// GET /api/admin/sweep-stats?tournament_id= — the sweep tournament's Stats tab on /admin:
// sweeps created, tipsters joining, tickets sold and spun, per day and per sweep. Read-only.
// "Members" and "buyers" never count a sweep's own organisers.
export async function GET(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const tournamentId = new URL(request.url).searchParams.get('tournament_id')
  if (!tournamentId) return NextResponse.json({ error: 'tournament_id required' }, { status: 400 })

  const admin = createAdminClient()
  try {
    const [comps, enrolled, platformAdmins] = await Promise.all([
      all<any>(() => (admin.from('comps') as any)
        .select('id, name, invite_code, created_at, created_by, sweep_ticket_price_cents').eq('tournament_id', tournamentId)),
      all<any>(() => (admin.from('user_tournaments') as any).select('user_id, enrolled_at').eq('tournament_id', tournamentId)),
      all<any>(() => (admin.from('admin_users') as any).select('user_id')),
    ])
    const compIds = comps.map(c => c.id)
    const [tribes, compAdmins] = await Promise.all([
      allIn<any>(compIds, ids => (admin.from('tribes') as any).select('id, comp_id').in('comp_id', ids)),
      allIn<any>(compIds, ids => (admin.from('comp_admins') as any).select('comp_id, user_id').in('comp_id', ids)),
    ])
    const tribeIds = tribes.map(t => t.id)
    const [members, entries, requests] = await Promise.all([
      allIn<any>(tribeIds, ids => (admin.from('tribe_members') as any).select('tribe_id, user_id').in('tribe_id', ids)),
      allIn<any>(tribeIds, ids => (admin.from('sweep_entries') as any).select('tribe_id, user_id, horse_id, joined_at').in('tribe_id', ids)),
      allIn<any>(tribeIds, ids => (admin.from('sweep_payment_requests') as any).select('tribe_id, status').in('tribe_id', ids)),
    ])

    const compOfTribe = new Map(tribes.map(t => [t.id, t.comp_id]))
    const organisers = new Map<string, Set<string>>()   // comp → its admins (creator included)
    for (const c of comps) organisers.set(c.id, new Set([c.created_by]))
    for (const a of compAdmins) organisers.get(a.comp_id)?.add(a.user_id)
    const isOrganiser = (tribeId: string, userId: string) => !!organisers.get(compOfTribe.get(tribeId))?.has(userId)

    const creatorIds = [...new Set(comps.map(c => c.created_by))]
    const users = await allIn<any>(creatorIds, ids => (admin.from('users') as any).select('id, display_name, email').in('id', ids))
    const userById = new Map(users.map(u => [u.id, u]))
    const adminIds = new Set(platformAdmins.map(a => a.user_id))

    const sweeps = comps.map(c => {
      const mine = (rows: any[]) => rows.filter(r => compOfTribe.get(r.tribe_id) === c.id)
      const t = mine(entries)
      const price = c.sweep_ticket_price_cents ?? 0
      return {
        id: c.id, name: c.name, invite_code: c.invite_code, created_at: c.created_at,
        organiser: userById.get(c.created_by)?.display_name ?? null,
        organiser_email: userById.get(c.created_by)?.email ?? null,
        by_platform_admin: adminIds.has(c.created_by),   // our own / test sweeps
        pools: tribes.filter(tr => tr.comp_id === c.id).length,
        members: new Set(mine(members).filter(m => !isOrganiser(m.tribe_id, m.user_id)).map(m => m.user_id)).size,
        buyers: new Set(t.filter(e => !isOrganiser(e.tribe_id, e.user_id)).map(e => e.user_id)).size,
        tickets: t.length,
        spun: t.filter(e => e.horse_id).length,
        pending: mine(requests).filter(r => r.status === 'pending').length,
        price_cents: price,
        pot_cents: price * t.length,
      }
    }).sort((a, b) => b.created_at.localeCompare(a.created_at))

    // The last DAYS days, Melbourne time, oldest first.
    const days = Array.from({ length: DAYS }, (_, i) => melbDay(new Date(Date.now() - (DAYS - 1 - i) * 86_400_000).toISOString()))
    const count = (isos: string[]) => { const m: Record<string, number> = {}; for (const d of isos) m[melbDay(d)] = (m[melbDay(d)] ?? 0) + 1; return m }
    const sweepsByDay = count(comps.map(c => c.created_at))
    const joinsByDay = count(enrolled.filter(e => e.enrolled_at).map(e => e.enrolled_at))
    const ticketsByDay = count(entries.filter(e => e.joined_at).map(e => e.joined_at))

    return NextResponse.json({
      summary: {
        sweeps: comps.length,
        sweeps_with_buyers: sweeps.filter(s => s.buyers > 0).length,
        tipsters_joined: enrolled.length,
        members: new Set(members.filter(m => !isOrganiser(m.tribe_id, m.user_id)).map(m => m.user_id)).size,
        buyers: new Set(entries.filter(e => !isOrganiser(e.tribe_id, e.user_id)).map(e => e.user_id)).size,
        tickets: entries.length,
        spun: entries.filter(e => e.horse_id).length,
        pending: requests.filter(r => r.status === 'pending').length,
        pot_cents: sweeps.reduce((sum, s) => sum + s.pot_cents, 0),
      },
      daily: days.map(d => ({ day: d, sweeps: sweepsByDay[d] ?? 0, joined: joinsByDay[d] ?? 0, tickets: ticketsByDay[d] ?? 0 })),
      sweeps,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Couldn’t load stats' }, { status: 500 })
  }
}
