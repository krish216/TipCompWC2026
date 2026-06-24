#!/usr/bin/env node
/**
 * validate-tipster-stats.js — read-only. Phase C acceptance gate: independently
 * recompute the Tipster-stats headline numbers from raw predictions/fixtures and
 * cross-check them against the leaderboard MV, so we never paywall wrong numbers.
 *
 * Picks the user with the most scored predictions (or pass a user_id arg).
 * Also reports FIFA-rank join coverage — 0 means migration 128 isn't applied yet
 * (or team names don't match), which would silently null the rank modules.
 *
 * Usage: node scripts/validate-tipster-stats.js [user_id]
 */
const { createClient } = require('@supabase/supabase-js')
const { readFileSync } = require('fs')
const { join } = require('path')

const env = {}
try {
  readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  })
} catch {}
const url = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Missing env'); process.exit(1) }
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const outcome = (h, a) => (h > a ? 'H' : h < a ? 'A' : 'D')

async function main() {
  const { data: tourn } = await db.from('tournaments').select('id, name').eq('slug', 'wc2026').single()
  const tid = tourn.id
  console.log(`Tournament: ${tourn.name} (${tid})\n`)

  let userId = process.argv[2]
  if (!userId) {
    // Most-active scored user from the leaderboard MV.
    const { data: top } = await db.from('leaderboard')
      .select('user_id, display_name, total_points, correct_count, predictions_made')
      .eq('tournament_id', tid).order('predictions_made', { ascending: false }).limit(1)
    userId = top?.[0]?.user_id
    console.log(`Sample user (most predictions): ${top?.[0]?.display_name} (${userId})`)
  }

  const { data: me } = await db.from('leaderboard')
    .select('total_points, total_bonus_points, correct_count, predictions_made')
    .eq('user_id', userId).eq('tournament_id', tid).maybeSingle()

  const [{ count: totalPlayers }, { count: better }] = await Promise.all([
    db.from('leaderboard').select('user_id', { count: 'exact', head: true }).eq('tournament_id', tid),
    db.from('leaderboard').select('user_id', { count: 'exact', head: true }).eq('tournament_id', tid).gt('total_points', me.total_points),
  ])
  const rank = (better ?? 0) + 1

  const { data: preds } = await db.from('predictions')
    .select('fixture_id, home, away, points_earned, standard_points, bonus_points')
    .eq('user_id', userId).eq('tournament_id', tid).not('points_earned', 'is', null)
  const { data: fixtures } = await db.from('fixtures')
    .select('id, home, away, home_score, away_score, kickoff_utc, round').eq('tournament_id', tid)
  const { data: rounds } = await db.from('tournament_rounds')
    .select('round_code, include_in_scoring').eq('tournament_id', tid)
  const scoringRound = new Map((rounds ?? []).map(r => [r.round_code, r.include_in_scoring !== false]))
  // fifa_rank may not exist yet (migration 128) — fall back to no ranks.
  let teamsR = await db.from('tournament_teams').select('name, fifa_rank').eq('tournament_id', tid)
  if (teamsR.error) teamsR = await db.from('tournament_teams').select('name').eq('tournament_id', tid)
  const teams = (teamsR.data ?? []).map(t => ({ name: t.name, fifa_rank: t.fifa_rank ?? null }))

  const fx = new Map(fixtures.map(f => [f.id, f]))
  const rk = new Map(teams.map(t => [t.name, t.fifa_rank]))
  const ranked = teams.filter(t => t.fifa_rank != null).length

  const scored = preds.map(p => ({ p, f: fx.get(p.fixture_id) }))
    .filter(x => x.f && x.f.home_score != null && x.f.away_score != null && scoringRound.get(x.f.round) !== false)
    .sort((a, b) => new Date(a.f.kickoff_utc) - new Date(b.f.kickoff_utc))

  let correctByStd = 0, correctByScore = 0, mismatch = 0
  let predG = 0, actG = 0, draws = 0, calledDraws = 0
  let longest = 0, run = 0
  let bothRanked = 0, backedFav = 0, backedDog = 0, dogCorrect = 0, biggestGap = 0, biggestPick = ''
  for (const { p, f } of scored) {
    const stdCorrect = (p.standard_points ?? 0) > 0
    const scoreCorrect = outcome(p.home, p.away) === outcome(f.home_score, f.away_score)
    if (stdCorrect) correctByStd++
    if (scoreCorrect) correctByScore++
    if (stdCorrect !== scoreCorrect) mismatch++
    if (stdCorrect) { run++; longest = Math.max(longest, run) } else run = 0
    predG += p.home + p.away; actG += f.home_score + f.away_score
    if (outcome(f.home_score, f.away_score) === 'D') { draws++; if (outcome(p.home, p.away) === 'D') calledDraws++ }
    const rH = rk.get(f.home), rA = rk.get(f.away)
    if (rH != null && rA != null) {
      bothRanked++
      const predO = outcome(p.home, p.away)
      if (predO !== 'D') {
        const fav = rH <= rA ? f.home : f.away
        const picked = predO === 'H' ? f.home : f.away
        if (picked === fav) backedFav++
        else { backedDog++; if (stdCorrect) { dogCorrect++; const g = Math.abs(rH - rA); if (g > biggestGap) { biggestGap = g; biggestPick = `${picked} (beat the ${g}-rank-higher side)` } } }
      }
    }
  }

  console.log(`\n── Headline (cross-check vs leaderboard MV) ──`)
  console.log(`  rank: ${rank} / ${totalPlayers}  (top ${Math.max(1, Math.round(rank / totalPlayers * 100))}%)`)
  console.log(`  predictions_made:  MV=${me.predictions_made}  raw-scored=${scored.length}`)
  console.log(`  correct_count:     MV=${me.correct_count}  recomputed(std>0)=${correctByStd}  ${me.correct_count === correctByStd ? '✓ match' : '✗ MISMATCH'}`)
  console.log(`  hitRate: ${(correctByStd / me.predictions_made * 100).toFixed(1)}%`)
  console.log(`  bonus_points: MV=${me.total_bonus_points}`)
  console.log(`\n── Tendencies ──`)
  console.log(`  goalBias: ${(predG / scored.length - actG / scored.length).toFixed(2)} goals/match`)
  console.log(`  longest streak: ${longest}`)
  console.log(`  draws: called ${calledDraws}/${draws} actual draws`)
  console.log(`  result-vs-std mismatch (knockout/pen edge cases): ${mismatch}`)
  console.log(`\n── FIFA-rank coverage (migration 128) ──`)
  console.log(`  teams with fifa_rank: ${ranked}/${teams.length}  ${ranked === 0 ? '⚠️  migration 128 NOT applied — rank modules will be empty' : '✓'}`)
  console.log(`  scored picks with BOTH teams ranked: ${bothRanked}/${scored.length}`)
  console.log(`  chalk: backed favourite ${backedFav}, backed underdog ${backedDog} (correct ${dogCorrect})`)
  if (biggestPick) console.log(`  biggest upset called: ${biggestPick}`)
  console.log('')
}
main().catch(e => { console.error(e); process.exit(1) })
