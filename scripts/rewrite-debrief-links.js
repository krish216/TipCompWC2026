#!/usr/bin/env node
/**
 * rewrite-debrief-links.js — retro-fit already-posted Group Stage debrief chat
 * messages to the TRACKED redirect (/api/r/round-debrief?...&source=debrief_chat)
 * so their clicks land in report_link_clicks. Only touches the direct
 * /tribe/round-debrief?...round=gs links. Idempotent.
 *
 *   node scripts/rewrite-debrief-links.js          # DRY RUN
 *   node scripts/rewrite-debrief-links.js --apply  # write
 */
const { createClient } = require('@supabase/supabase-js')
const { readFileSync } = require('fs')
const { join } = require('path')
const APPLY = process.argv.includes('--apply')
for (const l of readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

;(async () => {
  // Direct (untracked) debrief links still pointing at /tribe/round-debrief.
  const { data, error } = await db.from('chat_messages').select('id, content')
    .eq('is_system', true).ilike('content', '%/tribe/round-debrief?%')
  if (error) { console.error(error.message); process.exit(1) }

  const updates = []
  for (const m of data || []) {
    if (!/\/tribe\/round-debrief\?/.test(m.content)) continue
    const next = m.content.replace(
      /\/tribe\/round-debrief\?([^\s]+)/,
      (_, qs) => `/api/r/round-debrief?${qs}${/(?:^|&)source=/.test(qs) ? '' : '&source=debrief_chat'}`,
    )
    if (next !== m.content) updates.push({ id: m.id, next })
  }

  console.log(`Direct debrief links found: ${(data || []).length} · to rewrite: ${updates.length}`)
  if (updates.length) console.log('Example →', updates[0].next.split('\n').pop())
  if (!APPLY) { console.log('\n(DRY RUN) re-run with --apply to write.'); return }

  let ok = 0
  for (const u of updates) {
    const { error: e } = await db.from('chat_messages').update({ content: u.next }).eq('id', u.id)
    if (e) console.log(`  ERR ${u.id}: ${e.message}`); else ok++
  }
  console.log(`Rewrote ${ok}/${updates.length} messages to the tracked redirect.`)
})().catch(e => { console.error(e); process.exit(1) })
