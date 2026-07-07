import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'
import { resolveMatchChallenge, getFixture, lockAt, isLocked } from '@/lib/match/challenge'
import { resolveActiveCampaign } from '@/lib/sponsors/resolver'
import { rankMatchEntries, isSettled, actualAdvancer } from '@/lib/match/score'
import { tipsterFlag } from '@/lib/geo-flag'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/match/leaderboard?slug=<match-challenge-slug>
// Public board for a single-match prediction challenge: the fixture, sponsor
// co-branding, entry/lock timing, the ranked entrants (scored once the result is
// in), and the current user's own entry.
export async function GET(request: NextRequest) {
  const slug = new URL(request.url).searchParams.get('slug') || ''
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })

  const admin = createAdminClient()
  const challenge = await resolveMatchChallenge(admin, slug)
  if (!challenge) return NextResponse.json({ challenge: null }, { status: 404 })

  const fixture = challenge.fixture_id ? await getFixture(admin, challenge.fixture_id) : null
  const cfg     = await resolveActiveCampaign(admin, { challengeType: 'match', challengeId: challenge.id })

  const { data: rows } = await (admin.from('match_entries') as any)
    .select('user_id, pred_home, pred_away, advances_team, first_goal_min, reveal_picks, entered_at, users(display_name, first_name, country, timezone)')
    .eq('challenge_id', challenge.id)
  const entries = (rows ?? []) as any[]

  const finalFx = fixture
    ? { home: fixture.home, away: fixture.away, home_score: fixture.home_score, away_score: fixture.away_score, pen_winner: fixture.pen_winner, first_goal_min: fixture.first_goal_min }
    : { home: '', away: '', home_score: null, away_score: null, pen_winner: null, first_goal_min: null }

  const settled = isSettled(finalFx)

  // Live/provisional: the match is in progress and we have a RECENT live scoreline
  // (stored separately from the final result so the scoring trigger never fires
  // mid-match). Guard on freshness — if the cron hasn't refreshed the live score in a
  // while (lag/outage), don't present stale data as current; fall back to the neutral
  // "in progress" state instead. 15 min ≈ 3 missed 5-min cron cycles.
  const LIVE_STALE_MS = 15 * 60 * 1000
  const liveFresh = !!fixture?.live_updated_at
    && (Date.now() - new Date(fixture.live_updated_at).getTime()) < LIVE_STALE_MS
  const live = !settled
    && fixture?.live_status === 'in'
    && fixture?.live_home_score != null
    && fixture?.live_away_score != null
    && liveFresh
  const liveFx = live
    ? { home: fixture!.home, away: fixture!.away, home_score: fixture!.live_home_score, away_score: fixture!.live_away_score, pen_winner: null, first_goal_min: fixture!.first_goal_min ?? null }
    : null

  // Score the board against: the final result if settled, else the live score if the
  // match is in progress, else an empty result (everyone on 0, tie-break ordering).
  const fx = settled ? finalFx : (liveFx ?? finalFx)
  const ranked = rankMatchEntries(
    entries.map(e => ({
      user_id: e.user_id,
      name: e.users?.display_name || e.users?.first_name || 'Anonymous',
      flag: tipsterFlag(e.users?.country, e.users?.timezone),
      pred_home: e.pred_home, pred_away: e.pred_away, advances_team: e.advances_team ?? null,
      first_goal_min: e.first_goal_min ?? null,
      reveal_picks: e.reveal_picks !== false,
      entered_at: e.entered_at,
    })),
    fx,
  )

  // Current user's entry (if signed in) so the page can show "you're in" + their pick.
  const user = await getSessionUser().catch(() => null)
  const mine = user ? entries.find(e => e.user_id === user.id) : null

  // Picks show live (score + first-goal minute) UNLESS the entrant opted out — but a
  // user always sees their own. The opt-out only hides a pick UNTIL ENTRIES LOCK:
  // once predictions are locked no one can enter or change a pick, so there's nothing
  // left to copy — every pick is revealed.
  const locked = isLocked(challenge, fixture)
  const board = ranked.map((e, i) => {
    const isMe = !!(user && e.user_id === user.id)
    const showPick = locked || e.reveal_picks !== false || isMe
    return {
      rank:   i + 1,
      name:   e.name,
      flag:   e.flag,
      is_me:  isMe,
      hidden: !showPick,
      points: e.score.points,
      ...(showPick ? {
        pred:     `${e.pred_home}-${e.pred_away}`,
        advances: e.advances_team,
        fgm:      e.first_goal_min ?? null,
        exact:    e.score.exact,
      } : {}),
    }
  })

  return NextResponse.json({
    challenge: { slug: challenge.slug, name: challenge.name },
    team_images: { home: challenge.home_image_url, away: challenge.away_image_url },
    fixture: fixture && {
      home: fixture.home, away: fixture.away, venue: fixture.venue, round: fixture.round,
      kickoff_utc: fixture.kickoff_utc,
      home_score: fixture.home_score, away_score: fixture.away_score,
      // Actual first-goal minute — shown once settled, and live once the first goal lands.
      first_goal_min: (settled || live) ? (fixture.first_goal_min ?? null) : null,
      advancer: settled ? actualAdvancer(fx) : null,
    },
    sponsor: cfg.enabled ? {
      name: cfg.sponsor_name, logo: cfg.sponsor_logo, prize: cfg.prize, url: cfg.sponsor_url,
      logo_tone: cfg.logo_tone, tagline: cfg.sponsor_tagline, logo_includes_name: cfg.logo_includes_name,
    } : null,
    has_prize: !!(cfg.enabled && cfg.prize),
    lock_at:   lockAt(challenge, fixture),
    locked,
    settled,
    // Live/provisional board: the ranking + points above reflect the in-progress
    // score. Real points only count once `settled` is true.
    live,
    provisional: live,
    live_score: live ? { home: fixture!.live_home_score, away: fixture!.live_away_score, minute: fixture!.live_minute ?? null } : null,
    entrants:  entries.length,
    entries:   board,
    logged_in: !!user,
    me: mine ? {
      pred: `${mine.pred_home}-${mine.pred_away}`,
      pred_home: mine.pred_home, pred_away: mine.pred_away,
      advances: mine.advances_team ?? null,
      first_goal_min: mine.first_goal_min ?? null,
      reveal_picks: mine.reveal_picks !== false,
    } : null,
  })
}
