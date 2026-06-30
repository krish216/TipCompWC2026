#!/usr/bin/env node
/**
 * post-group-debrief.js — post the COMBINED Group Stage (GS1+GS2+GS3) debrief link
 * into every eligible tribe's chat (>=4 members) for the active tournament, and
 * notify members. Idempotent (skips tribes already posted the combined link).
 *
 *   node scripts/post-group-debrief.js          # DRY RUN
 *   node scripts/post-group-debrief.js --apply  # write to prod chats + notifications
 */
const { createClient } = require('@supabase/supabase-js')
const { readFileSync } = require('fs')
const { join } = require('path')
const APPLY = process.argv.includes('--apply')
for (const l of readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const APP = 'https://www.tribepicks.com'
const GROUP_ROUNDS = ['gs1', 'gs2', 'gs3']
const MIN_MEMBERS = 4

;(async () => {
  const { data: t } = await db.from('tournaments').select('id, name').eq('is_active', true).maybeSingle()
  if (!t) { console.error('No active tournament'); process.exit(1) }

  // Group stage must be fully scored.
  const { data: fx } = await db.from('fixtures').select('home_score, round').eq('tournament_id', t.id).in('round', GROUP_ROUNDS)
  const groupFx = fx || []
  const allScored = groupFx.length > 0 && groupFx.every(f => f.home_score != null)
  console.log(`${t.name}: group-stage fixtures ${groupFx.filter(f => f.home_score != null).length}/${groupFx.length} scored`)
  if (!allScored) { console.error('Group stage not fully scored — aborting.'); process.exit(1) }

  const { data: tribes } = await db.from('tribes').select('id, name').eq('tournament_id', t.id)
  let posted = 0, notified = 0, skippedSmall = 0, skippedDone = 0

  for (const tribe of tribes || []) {
    const [{ data: tm }, { data: us }] = await Promise.all([
      db.from('tribe_members').select('user_id').eq('tribe_id', tribe.id),
      db.from('users').select('id').eq('tribe_id', tribe.id),
    ])
    const ids = new Set()
    ;(tm || []).forEach(r => r.user_id && ids.add(r.user_id))
    ;(us || []).forEach(r => r.id && ids.add(r.id))
    if (ids.size < MIN_MEMBERS) { skippedSmall++; continue }

    // Dedupe: already posted the COMBINED link (round=gs, not gs1/gs2/gs3)?
    const { data: sys } = await db.from('chat_messages').select('content')
      .eq('tribe_id', tribe.id).eq('is_system', true).ilike('content', '%round-debrief%')
    if ((sys || []).some(m => /round=gs(?!\d)/.test(m.content || ''))) { skippedDone++; continue }

    const link = `${APP}/api/r/round-debrief?tribe_id=${tribe.id}&round=gs&source=debrief_chat`
    const content = `🕵️ The Group Stage Debrief is in 👀 (members only) — who topped the tribe, and who bagged the Wooden Spoon? 🥄\n${link}`

    if (APPLY) {
      const { error } = await db.from('chat_messages').insert({ tribe_id: tribe.id, user_id: null, is_system: true, content, round_code: null })
      if (error) { console.log(`  ERR chat ${tribe.name}: ${error.message}`); continue }
      await db.from('notifications').insert([...ids].map(uid => ({
        user_id: uid, type: 'round_complete',
        title: '🕵️ Group Stage debrief is in',
        body: 'See who topped your tribe across the group stage — and who got the Wooden Spoon 🥄. Tap to open your tribe chat.',
        data: { href: '/tribe?tab=chat', tribe_id: tribe.id },
      })))
    }
    posted++; notified += ids.size
  }

  console.log(`\n${APPLY ? 'POSTED' : 'WOULD POST'}: ${posted} tribes · ${notified} members notified`)
  console.log(`skipped: ${skippedSmall} (<${MIN_MEMBERS} members), ${skippedDone} (already posted)`)
  if (!APPLY) console.log('\n(DRY RUN) re-run with --apply to post.')
})().catch(e => { console.error(e); process.exit(1) })
