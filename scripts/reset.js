#!/usr/bin/env node
/**
 * reset.js — clears predictions and results for dev/testing
 * NEVER run against production.
 * Usage: node scripts/reset.js
 */

const { createClient } = require('@supabase/supabase-js')

if (process.env.NODE_ENV === 'production') {
  console.error('❌ Cannot run reset in production')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function reset() {
  console.log('⚠️  Resetting dev database...')

  // Clear in dependency order
  const tables = ['chat_messages', 'predictions', 'tribe_members', 'tribes', 'users']

  for (const table of tables) {
    const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (error) console.warn(`  Warning clearing ${table}: ${error.message}`)
    else console.log(`  ✓ Cleared ${table}`)
  }

  // Reset fixture scores
  const { error: fxErr } = await supabase
    .from('fixtures')
    .update({ home_score: null, away_score: null, result_set_at: null, result_set_by: null })
    .neq('id', 0)

  if (fxErr) console.warn(`  Warning resetting fixtures: ${fxErr.message}`)
  else console.log('  ✓ Reset fixture scores')

  console.log('\n✅ Dev reset complete')
}

reset()
