# Parking Lot

Ideas and follow-ups captured for later — not committed work. Add new items at the
top. Each item: what it is, why, options/notes, and status.

---

## Lock-in + fixture tipsheet — released for ALL rounds
**Added:** 2026-06-16 · **Status:** Live (warm-up gate removed)

The "lock a prediction → reveal the tribe's mutual-lock tipsheet" feature (migration
115 `predictions.locked_at`; `/api/predictions/lock`; `/api/predictions/fixture-tipsheet`;
`FixtureTipsheetModal`; lock button + committed state in `MatchRow`/predict page) is live
on every still-editable fixture (any round). The lock button shows when a complete
prediction exists and the fixture is pre-kickoff / round-open / no result.

**Open follow-up — admin unlock safety valve (not built):** locking is irreversible with
no unlock path, and now applies to scoring rounds, so an accidental lock can only be
undone by editing `predictions.locked_at = null` in the DB. Consider a comp-admin (or
support) "unlock this prediction" action if mistake-fix requests appear. Server backstop
to consider too: `/api/predictions/lock` currently doesn't re-check the edit window
(harmless — the client only shows the button pre-kickoff — but a direct API call could
lock a past fixture).
**Added:** 2026-06-14 · **Updated:** 2026-06-15 · **Status:** Mostly SHIPPED (default OFF)

Shipped 2026-06-15 (migration 114, all gated by the `weekly_report_card` app_setting,
default OFF, toggled in Admin → Tournament tab; threshold = **4+ members per tribe**):
- ✅ **Weekly auto-post** to tribe chat as a "TribePicks 🤖" **system message**
  (`chat_messages.is_system`, nullable `user_id`) — `/api/cron/weekly-report`, scheduled
  via `supabase/saved-migrations/weekly-report-pg_cron.sql` (Mon 08:00 AEST = Sun 22:00 UTC).
- ✅ **Homepage card** for members of qualifying tribes → tracked redirect to chat
  (`/api/r/tribe-chat` logs to `report_link_clicks`, then → `/tribe?tab=chat`).
- ✅ **Click tracking** + counters surfaced to the admin (`/api/admin/report-stats`).
- ✅ Report page (`/tribe/report`) got a **backlink, Download PDF, and social share**.
- ✅ **Predict + Scoreboard cards** (`WeeklyReportCard`) — same chat-first nudge as the
  homepage card, on the two highest-traffic pages. Shared per-week dismiss across all
  surfaces (`dismissed_report_week`). Posted chat message now carries the "By TribePicks
  decree: table its findings at Monday stand-up" line.

**Still deferred:**
- A persistent "View report" link in the tribe **Standings** tab (members open it anytime,
  not just via the weekly card/auto-post).

**To activate:** apply migration 114, run the pg_cron saved-migration with the real
CRON_SECRET, then flip the toggle ON in Admin → Tournament.

---

## Client-side kickoff lock uses a hardcoded constant (multi-tournament)
**Added:** 2026-06-11 · **Status:** Idea — not started · Low priority (correct for WC2026)

A few client-side checks still use the hardcoded `TOURNAMENT_KICKOFF =
new Date('2026-06-11T19:00:00Z')` instead of the tournament's real first kickoff from
the DB:
- Bonus/favourite-team picker lock — `tournamentStarted` in `src/app/predict/page.tsx`
  (also a copy in `src/app/page.tsx` and the constant in `src/app/settings/page.tsx`).
- Countdown banner already uses a per-tournament value but falls back to `WC2026_KICKOFF`
  (`src/components/game/CountdownBanner.tsx`).

These are **correct for WC2026** (the constant = the real first match), and the
**server-side** bonus-team lock is already DB-driven and authoritative
(`src/lib/tournament-lock.ts` → earliest non-'wup' fixture), so this is cosmetic/UI only.
But for a **second tournament** the client checks would lock at the wrong time.

**Fix:** expose the real first-match kickoff per tournament (e.g. a
`first_match_utc timestamptz` column on `tournaments`, or derive from earliest non-warm-up
fixture) and have the predict/home picker locks + countdown read that instead of the
constant. Pairs naturally with the countdown's `first_match_utc` follow-up.

**Why low priority:** only matters once a non-WC2026 tournament exists; scoring integrity
is already protected server-side.

---

## Inactivity / idle session timeout
**Added:** 2026-06-07 · **Status:** Idea — not started

There is currently **no idle timeout** — a logged-in user stays connected indefinitely
(Supabase browser client auto-refreshes the token; sessions only end on manual sign-out,
cleared browser storage, or refresh-token invalidation). See `src/lib/supabase.ts`,
`src/components/layout/SupabaseProvider.tsx`, `src/middleware.ts`.

**Why we might want it:** security on shared devices; bounding stale sessions.

**Options:**
1. **Supabase dashboard (server-side, no code)** — Authentication → Sessions →
   "Inactivity timeout" / "Time-box". Hard boundary; cleanest. Off by default.
2. **App-level idle timer (client-side)** — hook watching `mousemove`/`keydown`/
   `visibilitychange`, calls `supabase.auth.signOut()` after N minutes idle, with an
   optional "logging you out soon" warning. Better UX/messaging for shared devices.

**Open question:** desired window (e.g. log out after 24h idle?) and whether it's a
security requirement (→ option 1) or a UX nicety (→ option 2).
