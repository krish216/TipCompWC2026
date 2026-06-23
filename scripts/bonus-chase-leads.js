#!/usr/bin/env node
/**
 * bonus-chase-leads.js — read-only. Ranks comp-admins to email about chasing up
 * members who haven't picked a Bonus Team. Prioritises LIVE comps (members who've
 * actually tipped) with the most missing-bonus members.
 *
 * Usage: node scripts/bonus-chase-leads.js
 */
const { createClient } = require('@supabase/supabase-js')
const { readFileSync } = require('fs')
const { join } = require('path')

// .env.local parse (dotenv not installed)
const env = {}
try {
  readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  })
} catch {}
const url = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

async function main() {
  // 1. Active tournament = the one with the most comps (WC2026).
  const { data: comps } = await db.from('comps').select('id, name, tournament_id')
  const byTourn = {}
  ;(comps || []).forEach(c => { if (c.tournament_id) byTourn[c.tournament_id] = (byTourn[c.tournament_id] || 0) + 1 })
  const tournId = Object.entries(byTourn).sort((a, b) => b[1] - a[1])[0]?.[0]
  const liveComps = (comps || []).filter(c => c.tournament_id === tournId)
  console.log(`Tournament ${tournId} · ${liveComps.length} comps\n`)

  // 2. Members of each comp.
  const compIds = liveComps.map(c => c.id)
  const { data: ucs } = await db.from('user_comps').select('comp_id, user_id').in('comp_id', compIds)
  const membersByComp = {}
  const allMemberIds = new Set()
  ;(ucs || []).forEach(r => { (membersByComp[r.comp_id] ||= []).push(r.user_id); allMemberIds.add(r.user_id) })

  // 3. Who has a favourite team for this tournament.
  const memberArr = [...allMemberIds]
  const hasTeam = new Set()
  for (let i = 0; i < memberArr.length; i += 300) {
    const { data } = await db.from('user_tournaments').select('user_id, favourite_team')
      .eq('tournament_id', tournId).in('user_id', memberArr.slice(i, i + 300))
    ;(data || []).forEach(r => { if (r.favourite_team) hasTeam.add(r.user_id) })
  }

  // 4. Who has actually tipped (any prediction) — paginate predictions(user_id).
  const tipped = new Set()
  let from = 0
  for (let page = 0; page < 500; page++) {
    const { data, error } = await db.from('predictions').select('user_id').range(from, from + 999)
    if (error) { console.error('predictions read error:', error.message); break }
    if (!data || !data.length) break
    data.forEach(r => tipped.add(r.user_id))
    if (data.length < 1000) break
    from += 1000
  }

  // 5. Comp admins (name/email) per comp.
  const { data: cas } = await db.from('comp_admins').select('comp_id, user_id').in('comp_id', compIds)
  const adminIds = [...new Set((cas || []).map(r => r.user_id))]
  const userInfo = {}
  for (let i = 0; i < adminIds.length; i += 300) {
    const { data } = await db.from('users').select('id, display_name, first_name, email').in('id', adminIds.slice(i, i + 300))
    ;(data || []).forEach(u => { userInfo[u.id] = u })
  }
  const adminsByComp = {}
  ;(cas || []).forEach(r => { (adminsByComp[r.comp_id] ||= []).push(userInfo[r.user_id]) })

  // 6. Build + rank: live comps (>=1 tipper) with >=1 missing bonus.
  const rows = liveComps.map(c => {
    const mem = membersByComp[c.id] || []
    const tippers = mem.filter(u => tipped.has(u)).length
    const missing = mem.filter(u => !hasTeam.has(u)).length
    const missingActive = mem.filter(u => tipped.has(u) && !hasTeam.has(u)).length
    const admins = (adminsByComp[c.id] || []).filter(Boolean)
    return { name: c.name, members: mem.length, tippers, missing, missingActive, admins }
  }).filter(r => r.tippers > 0 && r.missing > 0)
    .sort((a, b) => b.missingActive - a.missingActive || b.missing - a.missing)

  console.log(`${rows.length} live comps with members missing a Bonus Team\n`)
  console.log('rank  miss(active)  miss(all)  tippers  members  comp / admin(s)')
  rows.forEach((r, i) => {
    const adminStr = r.admins.map(a => `${a.display_name || a.first_name || '?'} <${a.email}>`).join(', ') || '(no admin record)'
    console.log(`${String(i + 1).padStart(3)}   ${String(r.missingActive).padStart(6)}      ${String(r.missing).padStart(6)}   ${String(r.tippers).padStart(6)}   ${String(r.members).padStart(6)}   ${r.name} — ${adminStr}`)
  })
}
main().catch(e => { console.error(e); process.exit(1) })
