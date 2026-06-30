#!/usr/bin/env node
/**
 * export-comp-chiefs.js — CSV of comp chiefs whose comp has MORE THAN ONE tipster
 * (real members only; mock seed accounts excluded), for the active tournament.
 * One row per chief (deduped by email); aggregates if they run several comps.
 *
 * Output: broadcast-comp-chiefs.csv (PII — gitignored, do not commit).
 * Usage: node scripts/export-comp-chiefs.js
 */
const { createClient } = require('@supabase/supabase-js')
const { readFileSync, writeFileSync } = require('fs')
const { join } = require('path')
for (const l of readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function pageAll(table, cols, filter) {
  const out = []
  for (let from = 0; from < 200000; from += 1000) {
    let q = a.from(table).select(cols).range(from, from + 999)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

;(async () => {
  const { data: t } = await a.from('tournaments').select('id, name').eq('is_active', true).maybeSingle()
  console.log(`Active tournament: ${t.name}`)

  // Users → email/name + mock flag
  const users = await pageAll('users', 'id, email, display_name')
  const byId = new Map(users.map(u => [u.id, u]))
  const isMock = u => !u || /^mockuser/i.test(u.email || '')

  // Comps for this tournament
  const comps = await pageAll('comps', 'id, name, created_by, tournament_id', q => q.eq('tournament_id', t.id))
  const compById = new Map(comps.map(c => [c.id, c]))

  // Members per comp (exclude mock)
  const memberships = await pageAll('user_comps', 'comp_id, user_id')
  const membersByComp = new Map()
  for (const m of memberships) {
    if (!compById.has(m.comp_id)) continue
    if (isMock(byId.get(m.user_id))) continue
    if (!membersByComp.has(m.comp_id)) membersByComp.set(m.comp_id, new Set())
    membersByComp.get(m.comp_id).add(m.user_id)
  }

  // Qualifying comps: >1 real tipster
  const qualifying = comps
    .map(c => ({ comp: c, members: (membersByComp.get(c.id)?.size) || 0 }))
    .filter(x => x.members > 1)

  // Aggregate by chief (created_by), dedupe, skip mock/missing chiefs
  const byChief = new Map()
  for (const { comp, members } of qualifying) {
    const chief = byId.get(comp.created_by)
    if (isMock(chief) || !chief?.email) continue
    if (!byChief.has(chief.id)) byChief.set(chief.id, { name: chief.display_name || '', email: chief.email, comps: [], totalTippers: 0 })
    const e = byChief.get(chief.id)
    e.comps.push(`${comp.name} (${members})`)
    e.totalTippers += members
  }

  const rows = [...byChief.values()].sort((x, y) => y.totalTippers - x.totalTippers)
  const esc = s => `"${String(s ?? '').replace(/"/g, '""')}"`
  const csv = ['chief_name,chief_email,comps_count,total_tippers,comps',
    ...rows.map(r => [esc(r.name), esc(r.email), r.comps.length, r.totalTippers, esc(r.comps.join(' | '))].join(','))].join('\n')

  const outPath = join(__dirname, '..', 'broadcast-comp-chiefs.csv')
  writeFileSync(outPath, csv)
  console.log(`\nQualifying comps (>1 tipster): ${qualifying.length}`)
  console.log(`Unique chiefs: ${rows.length}`)
  console.log(`Wrote ${outPath}`)
})().catch(e => { console.error(e); process.exit(1) })
