#!/usr/bin/env node
/**
 * create-match-challenge.js — create the Socceroos v Egypt single-match challenge:
 * a `challenges` row (type='match', fixture #114), a `sponsors` + `sponsor_campaigns`
 * pair for the venue partner, and closes_at = kickoff − 5 min (entries lock then).
 * Idempotent-ish: reuses an existing sponsor/challenge by slug.
 *
 *   node scripts/create-match-challenge.js            # DRY RUN (prints plan)
 *   node scripts/create-match-challenge.js --apply     # write
 *
 * Requires migration 140 to be applied first (match_entries + challenges.fixture_id).
 */
const { createClient } = require('@supabase/supabase-js')
const { readFileSync } = require('fs'); const { join } = require('path')
for (const l of readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const APPLY = process.argv.includes('--apply')

// ── EDIT THESE (venue partner + prize) ────────────────────────────────────────
const FIXTURE_ID   = 114
const CHALLENGE_SLUG = 'mt-socceroos-egypt'
const CHALLENGE_NAME = 'Socceroos v Egypt · Pick the Score'
const LOCK_LEAD_MIN  = 5
const SPONSOR = {
  slug:        'campsie-bowling-club',
  name:        'Campsie Bowling Club',   // TODO confirm exact name
  tagline:     'Open 4am · Socceroos live',        // TODO suburb/tagline
  website_url: '',                                 // TODO their FB/site (optional)
  logo_url:    '',                                 // no logo → text treatment
  logo_tone:   'dark',
}
const PRIZE = '$100 bar tab'                        // TODO confirm the actual prize
// ──────────────────────────────────────────────────────────────────────────────

;(async () => {
  const { data: fx } = await db.from('fixtures').select('id, home, away, kickoff_utc, tournament_id').eq('id', FIXTURE_ID).maybeSingle()
  if (!fx) { console.error(`Fixture #${FIXTURE_ID} not found`); process.exit(1) }
  const closesAt = new Date(new Date(fx.kickoff_utc).getTime() - LOCK_LEAD_MIN * 60 * 1000).toISOString()
  console.log(`Match: ${fx.home} v ${fx.away} · KO ${fx.kickoff_utc}`)
  console.log(`Challenge: "${CHALLENGE_NAME}" (${CHALLENGE_SLUG}) · closes_at ${closesAt} (KO − ${LOCK_LEAD_MIN}m)`)
  console.log(`Sponsor: ${SPONSOR.name} · prize "${PRIZE}"`)
  if (!APPLY) { console.log('\n(DRY RUN) re-run with --apply to write.'); return }

  // Sponsor (reuse by slug)
  let { data: sp } = await db.from('sponsors').select('id').eq('slug', SPONSOR.slug).maybeSingle()
  if (!sp) {
    const { data, error } = await db.from('sponsors').insert({ ...SPONSOR, status: 'active' }).select('id').single()
    if (error) { console.error('sponsor insert:', error.message); process.exit(1) }
    sp = data
  }
  console.log('sponsor id:', sp.id)

  // Challenge (reuse by slug)
  let { data: ch } = await db.from('challenges').select('id').eq('slug', CHALLENGE_SLUG).maybeSingle()
  if (!ch) {
    const { data, error } = await db.from('challenges').insert({
      tournament_id: fx.tournament_id, type: 'match', name: CHALLENGE_NAME, slug: CHALLENGE_SLUG,
      enabled: true, access: 'open', fixture_id: FIXTURE_ID, closes_at: closesAt,
    }).select('id').single()
    if (error) { console.error('challenge insert:', error.message); process.exit(1) }
    ch = data
  } else {
    await db.from('challenges').update({ fixture_id: FIXTURE_ID, closes_at: closesAt, name: CHALLENGE_NAME, enabled: true }).eq('id', ch.id)
  }
  console.log('challenge id:', ch.id)

  // Campaign — active window from now through kickoff.
  const { data: existingCamp } = await db.from('sponsor_campaigns').select('id').eq('challenge_id', ch.id).eq('sponsor_id', sp.id).maybeSingle()
  const campRow = {
    sponsor_id: sp.id, challenge_id: ch.id, prize: PRIZE, click_url: SPONSOR.website_url || null,
    enabled: true, starts_at: new Date().toISOString(), ends_at: fx.kickoff_utc,
  }
  if (existingCamp) { await db.from('sponsor_campaigns').update(campRow).eq('id', existingCamp.id); console.log('campaign updated:', existingCamp.id) }
  else { const { data, error } = await db.from('sponsor_campaigns').insert(campRow).select('id').single(); if (error) { console.error('campaign insert:', error.message); process.exit(1) } console.log('campaign id:', data.id) }

  console.log(`\n✅ Done → https://tribepicks.com/match/${CHALLENGE_SLUG}`)
})().catch(e => { console.error(e.message); process.exit(1) })
