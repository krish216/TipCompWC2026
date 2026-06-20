#!/usr/bin/env node
/**
 * run-migration.js — runs a specific Supabase migration
 * Usage: node run-migration.js <migration-file>
 */

const { createClient } = require('@supabase/supabase-js')
const { readFileSync } = require('fs')
const { join } = require('path')

async function runMigration() {
  const migrationFile = process.argv[2]
  if (!migrationFile) {
    console.error('Usage: node run-migration.js <migration-file>')
    console.error('Example: node run-migration.js 058_tournament_rounds.sql')
    process.exit(1)
  }

  // Create admin client directly
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.error('Missing environment variables:')
    console.error('  NEXT_PUBLIC_SUPABASE_URL')
    console.error('  SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  try {
    const sqlPath = join(__dirname, '..', 'supabase', 'migrations', migrationFile)
    const sql = readFileSync(sqlPath, 'utf8')

    console.log(`Running migration: ${migrationFile}`)
    console.log('SQL preview:', sql.substring(0, 200) + '...')

    // Execute the entire SQL as one statement
    const { error } = await supabase.rpc('exec_sql', { sql })

    if (error) {
      console.error('❌ Migration failed:', error.message)
      console.log('\n💡 Alternative: Copy the SQL to Supabase SQL Editor:')
      console.log(sql)
      process.exit(1)
    }

    console.log('✅ Migration completed successfully!')

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  }
}

runMigration()