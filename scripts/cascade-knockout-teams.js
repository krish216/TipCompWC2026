#!/usr/bin/env node
/**
 * cascade-knockout-teams.js — advance real winners into the next knockout round's
 * fixtures, so the schedule (My Tips, etc.) shows the actual progressed teams,
 * aligned with ESPN — no in-app auto-advance logic needed.
 *
 * For each downstream knockout slot, sets home := winner of feeder[0] and
 * away := winner of feeder[1], but ONLY for sides whose feeder is decided with a
 * real team. Undecided sides keep their existing placeholder. Never touches a
 * fixture that already has a result. Idempotent — safe to re-run (e.g. via cron).
 *
 *   node scripts/cascade-knockout-teams.js          # DRY RUN
 *   node scripts/cascade-knockout-teams.js --apply  # write
 */
const { createClient } = require('@supabase/supabase-js')
const { readFileSync } = require('fs')
const { join } = require('path')
const APPLY = process.argv.includes('--apply')
for (const l of readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// Bracket tree (mirrors src/app/bracket/page.tsx). [slot, fromHome, fromAway].
const FEEDS = [
  ['r16:1', 'r32:1', 'r32:2'], ['r16:2', 'r32:3', 'r32:4'], ['r16:3', 'r32:5', 'r32:6'], ['r16:4', 'r32:7', 'r32:8'],
  ['r16:5', 'r32:9', 'r32:10'], ['r16:6', 'r32:11', 'r32:12'], ['r16:7', 'r32:13', 'r32:14'], ['r16:8', 'r32:15', 'r32:16'],
  ['qf:1', 'r16:1', 'r16:2'], ['qf:2', 'r16:3', 'r16:4'], ['qf:3', 'r16:5', 'r16:6'], ['qf:4', 'r16:7', 'r16:8'],
  ['sf:1', 'qf:1', 'qf:2'], ['sf:2', 'qf:3', 'qf:4'],
  ['final', 'sf:1', 'sf:2'],
  // third-place: the LOSERS of the two semi-finals
  ['tp', 'sf:1', 'sf:2'],
]
const isPlaceholder = s => !s || /\b(group|winner|place|3rd|runner|tbd|tbc)\b/i.test(s)
const real = s => (isPlaceholder(s) ? null : s)

;(async () => {
  const { data: t } = await db.from('tournaments').select('id, name').eq('is_active', true).maybeSingle()
  if (!t) { console.error('No active tournament'); process.exit(1) }
  const { data: fx } = await db.from('fixtures').select('id, bracket_slot, home, away, home_score, away_score, pen_winner').eq('tournament_id', t.id).not('bracket_slot', 'is', null)
  const bySlot = {}
  for (const f of fx) bySlot[f.bracket_slot] = f

  const decidedWinner = slot => {
    const f = bySlot[slot]; if (!f || f.home_score == null || f.away_score == null) return null
    const w = f.home_score > f.away_score ? f.home : f.away_score > f.home_score ? f.away : (f.pen_winner ?? null)
    return real(w)
  }
  const decidedLoser = slot => {
    const f = bySlot[slot]; if (!f || f.home_score == null || f.away_score == null) return null
    const w = decidedWinner(slot); if (!w) return null
    const l = w === f.home ? f.away : f.home
    return real(l)
  }

  const updates = []
  for (const [slot, fh, fa] of FEEDS) {
    const f = bySlot[slot]
    if (!f) { continue }
    if (f.home_score != null) continue // already played — never touch
    const isTP = slot === 'tp'
    const wantHome = isTP ? decidedLoser(fh) : decidedWinner(fh)
    const wantAway = isTP ? decidedLoser(fa) : decidedWinner(fa)
    const newHome = wantHome && wantHome !== f.home ? wantHome : null
    const newAway = wantAway && wantAway !== f.away ? wantAway : null
    if (newHome || newAway) updates.push({ id: f.id, slot, from: `${f.home} v ${f.away}`, set: { ...(newHome ? { home: newHome } : {}), ...(newAway ? { away: newAway } : {}) }, to: `${newHome ?? f.home} v ${newAway ?? f.away}` })
  }

  console.log(`Tournament: ${t.name}`)
  if (!updates.length) { console.log('Nothing to cascade — no newly-resolved sides.'); return }
  console.log(`\n${updates.length} fixture side(s) to update:`)
  for (const u of updates) console.log(`  ${u.slot}:  ${u.from}  →  ${u.to}`)

  if (!APPLY) { console.log('\n(DRY RUN) re-run with --apply to write.'); return }
  console.log('\n=== APPLYING ===')
  let ok = 0
  for (const u of updates) {
    const { error } = await db.from('fixtures').update(u.set).eq('id', u.id).is('home_score', null)
    if (error) console.log(`  ERR ${u.slot}: ${error.message}`); else { ok++; console.log(`  ✓ ${u.slot} → ${u.to}`) }
  }
  console.log(`\nUpdated ${ok}/${updates.length}.`)
})().catch(e => { console.error(e); process.exit(1) })
