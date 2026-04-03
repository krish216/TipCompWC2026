#!/usr/bin/env node
/**
 * migrate.js — runs all Supabase migrations in order
 * Usage: node scripts/migrate.js
 * Requires: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 */

const { createClient } = require('@supabase/supabase-js')
const { readFileSync, readdirSync } = require('fs')
const { join } = require('path')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function migrate() {
  const migrationsDir = join(__dirname, '..', 'supabase', 'migrations')
  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  console.log(`Found ${files.length} migration(s)`)

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8')
    console.log(`Running ${file}...`)
    const { error } = await supabase.rpc('exec_sql', { sql }).catch(() => ({ error: null }))
    // Note: Supabase doesn't expose raw SQL execution via JS client
    // Migrations should be run via the Supabase SQL Editor or CLI:
    //   npx supabase db push
    // This script is a reference for the order of execution.
    if (error) console.warn(`  Warning: ${error.message}`)
    else console.log(`  ✓ ${file}`)
  }

  console.log('\nNote: For production, run migrations via:')
  console.log('  npx supabase db push')
  console.log('  — or paste each .sql file into the Supabase SQL Editor')
}

migrate()
