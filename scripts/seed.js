#!/usr/bin/env node
/**
 * seed.js — populates the fixtures table with all WC2026 matches.
 * Run: node scripts/seed.js
 */

// ── Load .env.local (Node scripts don't get Next.js env loading automatically) ──
const { existsSync, readFileSync } = require('fs')
const { resolve } = require('path')

const envPath = resolve(__dirname, '..', '.env.local')
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach(line => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return
      const eq = trimmed.indexOf('=')
      if (eq === -1) return
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim()
      if (!process.env[key]) process.env[key] = val
    })
  console.log('✓  Loaded .env.local')
} else {
  console.error('❌  .env.local not found — run: cp .env.example .env.local')
  process.exit(1)
}

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const GROUP_STAGE = [
  { id:1,  round:'gs', grp:'A', home:'Mexico',        away:'South Africa',  kickoff_utc:'2026-06-11T19:00:00Z', venue:'Estadio Azteca, Mexico City' },
  { id:2,  round:'gs', grp:'A', home:'South Korea',   away:'TBD A4',        kickoff_utc:'2026-06-12T02:00:00Z', venue:'Estadio Akron, Guadalajara' },
  { id:3,  round:'gs', grp:'B', home:'Canada',        away:'TBD B4',        kickoff_utc:'2026-06-12T19:00:00Z', venue:'BMO Field, Toronto' },
  { id:4,  round:'gs', grp:'D', home:'USA',           away:'Paraguay',      kickoff_utc:'2026-06-13T01:00:00Z', venue:'SoFi Stadium, Los Angeles' },
  { id:5,  round:'gs', grp:'B', home:'Qatar',         away:'Switzerland',   kickoff_utc:'2026-06-13T19:00:00Z', venue:"Levi's Stadium, San Francisco" },
  { id:6,  round:'gs', grp:'C', home:'Brazil',        away:'Morocco',       kickoff_utc:'2026-06-13T22:00:00Z', venue:'MetLife Stadium, New York/NJ' },
  { id:7,  round:'gs', grp:'C', home:'Haiti',         away:'Scotland',      kickoff_utc:'2026-06-14T01:00:00Z', venue:'Gillette Stadium, Boston' },
  { id:8,  round:'gs', grp:'D', home:'Australia',     away:'TBD D4',        kickoff_utc:'2026-06-14T04:00:00Z', venue:'BC Place, Vancouver' },
  { id:9,  round:'gs', grp:'E', home:'Germany',       away:'Curazao',       kickoff_utc:'2026-06-14T17:00:00Z', venue:'NRG Stadium, Houston' },
  { id:10, round:'gs', grp:'F', home:'Netherlands',   away:'Japan',         kickoff_utc:'2026-06-14T20:00:00Z', venue:'AT&T Stadium, Dallas' },
  { id:11, round:'gs', grp:'E', home:"Cote d'Ivoire", away:'Ecuador',       kickoff_utc:'2026-06-14T23:00:00Z', venue:'Lincoln Financial, Philadelphia' },
  { id:12, round:'gs', grp:'F', home:'Tunisia',       away:'TBD F4',        kickoff_utc:'2026-06-15T02:00:00Z', venue:'Estadio BBVA, Monterrey' },
  { id:13, round:'gs', grp:'H', home:'Spain',         away:'Cabo Verde',    kickoff_utc:'2026-06-15T16:00:00Z', venue:'Mercedes-Benz Stadium, Atlanta' },
  { id:14, round:'gs', grp:'G', home:'Belgium',       away:'Egypt',         kickoff_utc:'2026-06-15T19:00:00Z', venue:'Lumen Field, Seattle' },
  { id:15, round:'gs', grp:'H', home:'Saudi Arabia',  away:'Uruguay',       kickoff_utc:'2026-06-15T22:00:00Z', venue:'Hard Rock Stadium, Miami' },
  { id:16, round:'gs', grp:'G', home:'Iran',          away:'New Zealand',   kickoff_utc:'2026-06-16T01:00:00Z', venue:'SoFi Stadium, Los Angeles' },
  { id:17, round:'gs', grp:'I', home:'France',        away:'Senegal',       kickoff_utc:'2026-06-16T19:00:00Z', venue:'MetLife Stadium, New York/NJ' },
  { id:18, round:'gs', grp:'I', home:'Norway',        away:'TBD I4',        kickoff_utc:'2026-06-16T22:00:00Z', venue:'Gillette Stadium, Boston' },
  { id:19, round:'gs', grp:'J', home:'Argentina',     away:'Algeria',       kickoff_utc:'2026-06-17T01:00:00Z', venue:'Arrowhead Stadium, Kansas City' },
  { id:20, round:'gs', grp:'J', home:'Austria',       away:'Jordan',        kickoff_utc:'2026-06-17T04:00:00Z', venue:"Levi's Stadium, San Francisco" },
  { id:21, round:'gs', grp:'K', home:'Portugal',      away:'TBD K4',        kickoff_utc:'2026-06-17T17:00:00Z', venue:'NRG Stadium, Houston' },
  { id:22, round:'gs', grp:'L', home:'England',       away:'Croatia',       kickoff_utc:'2026-06-17T20:00:00Z', venue:'AT&T Stadium, Dallas' },
  { id:23, round:'gs', grp:'L', home:'Ghana',         away:'Panama',        kickoff_utc:'2026-06-17T23:00:00Z', venue:'BMO Field, Toronto' },
  { id:24, round:'gs', grp:'K', home:'Uzbekistan',    away:'Colombia',      kickoff_utc:'2026-06-18T02:00:00Z', venue:'Estadio Azteca, Mexico City' },
  { id:25, round:'gs', grp:'A', home:'South Africa',  away:'TBD A4',        kickoff_utc:'2026-06-18T19:00:00Z', venue:'Mercedes-Benz Stadium, Atlanta' },
  { id:26, round:'gs', grp:'B', home:'Switzerland',   away:'TBD B4',        kickoff_utc:'2026-06-18T22:00:00Z', venue:'SoFi Stadium, Los Angeles' },
  { id:27, round:'gs', grp:'B', home:'Canada',        away:'Qatar',         kickoff_utc:'2026-06-19T01:00:00Z', venue:'BC Place, Vancouver' },
  { id:28, round:'gs', grp:'A', home:'Mexico',        away:'South Korea',   kickoff_utc:'2026-06-19T04:00:00Z', venue:'Estadio Akron, Guadalajara' },
  { id:29, round:'gs', grp:'D', home:'USA',           away:'Australia',     kickoff_utc:'2026-06-19T19:00:00Z', venue:'Lumen Field, Seattle' },
  { id:30, round:'gs', grp:'C', home:'Scotland',      away:'Morocco',       kickoff_utc:'2026-06-19T22:00:00Z', venue:'Gillette Stadium, Boston' },
  { id:31, round:'gs', grp:'C', home:'Brazil',        away:'Haiti',         kickoff_utc:'2026-06-20T01:00:00Z', venue:'Lincoln Financial, Philadelphia' },
  { id:32, round:'gs', grp:'D', home:'Paraguay',      away:'TBD D4',        kickoff_utc:'2026-06-20T04:00:00Z', venue:"Levi's Stadium, San Francisco" },
  { id:33, round:'gs', grp:'F', home:'Netherlands',   away:'TBD F4',        kickoff_utc:'2026-06-20T19:00:00Z', venue:'NRG Stadium, Houston' },
  { id:34, round:'gs', grp:'E', home:'Germany',       away:"Cote d'Ivoire", kickoff_utc:'2026-06-20T22:00:00Z', venue:'BMO Field, Toronto' },
  { id:35, round:'gs', grp:'E', home:'Ecuador',       away:'Curazao',       kickoff_utc:'2026-06-21T01:00:00Z', venue:'Arrowhead Stadium, Kansas City' },
  { id:36, round:'gs', grp:'F', home:'Tunisia',       away:'Japan',         kickoff_utc:'2026-06-21T04:00:00Z', venue:'Estadio BBVA, Monterrey' },
  { id:37, round:'gs', grp:'H', home:'Spain',         away:'Saudi Arabia',  kickoff_utc:'2026-06-21T19:00:00Z', venue:'Mercedes-Benz Stadium, Atlanta' },
  { id:38, round:'gs', grp:'G', home:'Belgium',       away:'Iran',          kickoff_utc:'2026-06-21T22:00:00Z', venue:'SoFi Stadium, Los Angeles' },
  { id:39, round:'gs', grp:'H', home:'Uruguay',       away:'Cabo Verde',    kickoff_utc:'2026-06-22T01:00:00Z', venue:'Hard Rock Stadium, Miami' },
  { id:40, round:'gs', grp:'G', home:'New Zealand',   away:'Egypt',         kickoff_utc:'2026-06-22T04:00:00Z', venue:'BC Place, Vancouver' },
  { id:41, round:'gs', grp:'J', home:'Argentina',     away:'Austria',       kickoff_utc:'2026-06-22T19:00:00Z', venue:'AT&T Stadium, Dallas' },
  { id:42, round:'gs', grp:'I', home:'France',        away:'TBD I4',        kickoff_utc:'2026-06-22T22:00:00Z', venue:'Lincoln Financial, Philadelphia' },
  { id:43, round:'gs', grp:'I', home:'Norway',        away:'Senegal',       kickoff_utc:'2026-06-23T01:00:00Z', venue:'MetLife Stadium, New York/NJ' },
  { id:44, round:'gs', grp:'J', home:'Algeria',       away:'Jordan',        kickoff_utc:'2026-06-23T04:00:00Z', venue:'Arrowhead Stadium, Kansas City' },
  { id:45, round:'gs', grp:'K', home:'Portugal',      away:'Uzbekistan',    kickoff_utc:'2026-06-23T19:00:00Z', venue:'NRG Stadium, Houston' },
  { id:46, round:'gs', grp:'L', home:'England',       away:'Ghana',         kickoff_utc:'2026-06-23T22:00:00Z', venue:'Gillette Stadium, Boston' },
  { id:47, round:'gs', grp:'L', home:'Panama',        away:'Croatia',       kickoff_utc:'2026-06-24T01:00:00Z', venue:'BMO Field, Toronto' },
  { id:48, round:'gs', grp:'K', home:'Colombia',      away:'TBD K4',        kickoff_utc:'2026-06-24T04:00:00Z', venue:'Estadio Akron, Guadalajara' },
  { id:49, round:'gs', grp:'A', home:'Mexico',        away:'TBD A4',        kickoff_utc:'2026-06-25T19:00:00Z', venue:'Estadio Azteca, Mexico City' },
  { id:50, round:'gs', grp:'A', home:'South Korea',   away:'South Africa',  kickoff_utc:'2026-06-25T19:00:00Z', venue:'Mercedes-Benz Stadium, Atlanta' },
  { id:51, round:'gs', grp:'B', home:'Canada',        away:'Switzerland',   kickoff_utc:'2026-06-25T23:00:00Z', venue:'BC Place, Vancouver' },
  { id:52, round:'gs', grp:'B', home:'TBD B4',        away:'Qatar',         kickoff_utc:'2026-06-25T23:00:00Z', venue:'Lumen Field, Seattle' },
  { id:53, round:'gs', grp:'C', home:'Brazil',        away:'Scotland',      kickoff_utc:'2026-06-26T19:00:00Z', venue:'MetLife Stadium, New York/NJ' },
  { id:54, round:'gs', grp:'C', home:'Morocco',       away:'Haiti',         kickoff_utc:'2026-06-26T19:00:00Z', venue:'Hard Rock Stadium, Miami' },
  { id:55, round:'gs', grp:'D', home:'USA',           away:'TBD D4',        kickoff_utc:'2026-06-26T23:00:00Z', venue:'SoFi Stadium, Los Angeles' },
  { id:56, round:'gs', grp:'D', home:'Australia',     away:'Paraguay',      kickoff_utc:'2026-06-26T23:00:00Z', venue:'AT&T Stadium, Dallas' },
  { id:57, round:'gs', grp:'E', home:'Germany',       away:'Ecuador',       kickoff_utc:'2026-06-27T19:00:00Z', venue:'NRG Stadium, Houston' },
  { id:58, round:'gs', grp:'E', home:"Cote d'Ivoire", away:'Curazao',       kickoff_utc:'2026-06-27T19:00:00Z', venue:'Arrowhead Stadium, Kansas City' },
  { id:59, round:'gs', grp:'F', home:'Netherlands',   away:'Tunisia',       kickoff_utc:'2026-06-27T23:00:00Z', venue:'Lincoln Financial, Philadelphia' },
  { id:60, round:'gs', grp:'F', home:'Japan',         away:'TBD F4',        kickoff_utc:'2026-06-27T23:00:00Z', venue:'Estadio BBVA, Monterrey' },
  { id:61, round:'gs', grp:'G', home:'Belgium',       away:'New Zealand',   kickoff_utc:'2026-06-28T19:00:00Z', venue:'Lumen Field, Seattle' },
  { id:62, round:'gs', grp:'G', home:'Egypt',         away:'Iran',          kickoff_utc:'2026-06-28T19:00:00Z', venue:'SoFi Stadium, Los Angeles' },
  { id:63, round:'gs', grp:'H', home:'Spain',         away:'Uruguay',       kickoff_utc:'2026-06-28T23:00:00Z', venue:'Mercedes-Benz Stadium, Atlanta' },
  { id:64, round:'gs', grp:'H', home:'Cabo Verde',    away:'Saudi Arabia',  kickoff_utc:'2026-06-28T23:00:00Z', venue:'Hard Rock Stadium, Miami' },
  { id:65, round:'gs', grp:'I', home:'France',        away:'Norway',        kickoff_utc:'2026-06-29T19:00:00Z', venue:'MetLife Stadium, New York/NJ' },
  { id:66, round:'gs', grp:'I', home:'Senegal',       away:'TBD I4',        kickoff_utc:'2026-06-29T19:00:00Z', venue:'Gillette Stadium, Boston' },
  { id:67, round:'gs', grp:'J', home:'Argentina',     away:'Jordan',        kickoff_utc:'2026-06-29T23:00:00Z', venue:'AT&T Stadium, Dallas' },
  { id:68, round:'gs', grp:'J', home:'Algeria',       away:'Austria',       kickoff_utc:'2026-06-29T23:00:00Z', venue:'BC Place, Vancouver' },
  { id:69, round:'gs', grp:'K', home:'Portugal',      away:'Colombia',      kickoff_utc:'2026-06-30T19:00:00Z', venue:'NRG Stadium, Houston' },
  { id:70, round:'gs', grp:'K', home:'Uzbekistan',    away:'TBD K4',        kickoff_utc:'2026-06-30T19:00:00Z', venue:'Estadio Akron, Guadalajara' },
  { id:71, round:'gs', grp:'L', home:'England',       away:'Panama',        kickoff_utc:'2026-06-30T23:00:00Z', venue:'Arrowhead Stadium, Kansas City' },
  { id:72, round:'gs', grp:'L', home:'Croatia',       away:'Ghana',         kickoff_utc:'2026-06-30T23:00:00Z', venue:'BMO Field, Toronto' },
]

const KNOCKOUT = [
  { id:101, round:'r32', home:'TBD R32-1',   away:'TBD R32-2',   kickoff_utc:'2026-07-01T19:00:00Z', venue:'Estadio Azteca, Mexico City' },
  { id:102, round:'r32', home:'TBD R32-3',   away:'TBD R32-4',   kickoff_utc:'2026-07-01T22:00:00Z', venue:'MetLife Stadium, New York/NJ' },
  { id:103, round:'r32', home:'TBD R32-5',   away:'TBD R32-6',   kickoff_utc:'2026-07-02T01:00:00Z', venue:'Gillette Stadium, Boston' },
  { id:104, round:'r32', home:'TBD R32-7',   away:'TBD R32-8',   kickoff_utc:'2026-07-02T19:00:00Z', venue:'Mercedes-Benz Stadium, Atlanta' },
  { id:105, round:'r32', home:'TBD R32-9',   away:'TBD R32-10',  kickoff_utc:'2026-07-02T22:00:00Z', venue:'SoFi Stadium, Los Angeles' },
  { id:106, round:'r32', home:'TBD R32-11',  away:'TBD R32-12',  kickoff_utc:'2026-07-03T01:00:00Z', venue:'BC Place, Vancouver' },
  { id:107, round:'r32', home:'TBD R32-13',  away:'TBD R32-14',  kickoff_utc:'2026-07-03T19:00:00Z', venue:'Lumen Field, Seattle' },
  { id:108, round:'r32', home:'TBD R32-15',  away:'TBD R32-16',  kickoff_utc:'2026-07-03T22:00:00Z', venue:'Hard Rock Stadium, Miami' },
  { id:109, round:'r32', home:'TBD R32-17',  away:'TBD R32-18',  kickoff_utc:'2026-07-04T01:00:00Z', venue:'Lincoln Financial, Philadelphia' },
  { id:110, round:'r32', home:'TBD R32-19',  away:'TBD R32-20',  kickoff_utc:'2026-07-04T19:00:00Z', venue:'AT&T Stadium, Dallas' },
  { id:111, round:'r32', home:'TBD R32-21',  away:'TBD R32-22',  kickoff_utc:'2026-07-04T22:00:00Z', venue:'NRG Stadium, Houston' },
  { id:112, round:'r32', home:'TBD R32-23',  away:'TBD R32-24',  kickoff_utc:'2026-07-05T01:00:00Z', venue:'Arrowhead Stadium, Kansas City' },
  { id:113, round:'r32', home:'TBD R32-25',  away:'TBD R32-26',  kickoff_utc:'2026-07-05T19:00:00Z', venue:'Estadio Akron, Guadalajara' },
  { id:114, round:'r32', home:'TBD R32-27',  away:'TBD R32-28',  kickoff_utc:'2026-07-05T22:00:00Z', venue:'AT&T Stadium, Dallas' },
  { id:115, round:'r32', home:'TBD R32-29',  away:'TBD R32-30',  kickoff_utc:'2026-07-06T01:00:00Z', venue:'Estadio BBVA, Monterrey' },
  { id:116, round:'r32', home:'TBD R32-31',  away:'TBD R32-32',  kickoff_utc:'2026-07-06T19:00:00Z', venue:'BMO Field, Toronto' },
  { id:201, round:'r16', home:'TBD R16-1',   away:'TBD R16-2',   kickoff_utc:'2026-07-08T19:00:00Z', venue:'Gillette Stadium, Boston' },
  { id:202, round:'r16', home:'TBD R16-3',   away:'TBD R16-4',   kickoff_utc:'2026-07-08T23:00:00Z', venue:'AT&T Stadium, Dallas' },
  { id:203, round:'r16', home:'TBD R16-5',   away:'TBD R16-6',   kickoff_utc:'2026-07-09T19:00:00Z', venue:'SoFi Stadium, Los Angeles' },
  { id:204, round:'r16', home:'TBD R16-7',   away:'TBD R16-8',   kickoff_utc:'2026-07-09T23:00:00Z', venue:'Mercedes-Benz Stadium, Atlanta' },
  { id:205, round:'r16', home:'TBD R16-9',   away:'TBD R16-10',  kickoff_utc:'2026-07-10T19:00:00Z', venue:'MetLife Stadium, New York/NJ' },
  { id:206, round:'r16', home:'TBD R16-11',  away:'TBD R16-12',  kickoff_utc:'2026-07-10T23:00:00Z', venue:'NRG Stadium, Houston' },
  { id:207, round:'r16', home:'TBD R16-13',  away:'TBD R16-14',  kickoff_utc:'2026-07-11T19:00:00Z', venue:'Lumen Field, Seattle' },
  { id:208, round:'r16', home:'TBD R16-15',  away:'TBD R16-16',  kickoff_utc:'2026-07-11T23:00:00Z', venue:'Hard Rock Stadium, Miami' },
  { id:301, round:'qf',  home:'TBD QF-1',    away:'TBD QF-2',    kickoff_utc:'2026-07-13T19:00:00Z', venue:'AT&T Stadium, Dallas' },
  { id:302, round:'qf',  home:'TBD QF-3',    away:'TBD QF-4',    kickoff_utc:'2026-07-13T23:00:00Z', venue:'SoFi Stadium, Los Angeles' },
  { id:303, round:'qf',  home:'TBD QF-5',    away:'TBD QF-6',    kickoff_utc:'2026-07-14T19:00:00Z', venue:'MetLife Stadium, New York/NJ' },
  { id:304, round:'qf',  home:'TBD QF-7',    away:'TBD QF-8',    kickoff_utc:'2026-07-14T23:00:00Z', venue:'Mercedes-Benz Stadium, Atlanta' },
  { id:401, round:'sf',  home:'TBD SF-1',    away:'TBD SF-2',    kickoff_utc:'2026-07-16T23:00:00Z', venue:'MetLife Stadium, New York/NJ' },
  { id:402, round:'sf',  home:'TBD SF-3',    away:'TBD SF-4',    kickoff_utc:'2026-07-17T23:00:00Z', venue:'AT&T Stadium, Dallas' },
  { id:501, round:'tp',  home:'TBD 3rd-1',   away:'TBD 3rd-2',   kickoff_utc:'2026-07-19T19:00:00Z', venue:'Hard Rock Stadium, Miami' },
  { id:601, round:'f',   home:'TBD Final-1', away:'TBD Final-2', kickoff_utc:'2026-07-20T19:00:00Z', venue:'MetLife Stadium, New York/NJ' },
]

async function seed() {
  console.log('🌱 Seeding fixtures...')
  const all = [...GROUP_STAGE, ...KNOCKOUT]
  const { error } = await supabase
    .from('fixtures')
    .upsert(all, { onConflict: 'id' })
  if (error) {
    console.error('❌ Seed failed:', error.message)
    process.exit(1)
  }
  console.log(`✅ Seeded ${all.length} fixtures (${GROUP_STAGE.length} group stage + ${KNOCKOUT.length} knockout)`)
}

seed()