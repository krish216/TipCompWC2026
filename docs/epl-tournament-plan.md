# Implementation Plan — English Premier League Tournament

**Status:** Draft for scoping · **Author:** planning pass · **Date:** 2026-07-06
**Target season:** Premier League 2026/27 (ESPN `eng.1`)

---

## 1. Executive summary

Adding an EPL tournament is **mostly a data + integration exercise, not a schema rewrite.** The app was refactored long ago to be tournament-scoped and config-driven:

- **Round codes are free text** (the old `round_id` enum was dropped in migration `063`). `r1…r38` "just work".
- **Scoring is data-driven** from the `tournament_rounds` table — the fixtures trigger (`081`) reads per-round points; no code change needed for league scoring.
- **Leaderboard, predict tabs, and standings are all tournament-scoped** and derive their structure from `tournament_rounds`, not hardcoded WC rounds.

The genuine work concentrates in **three areas**:

1. **Club crests** — the team system is nation-flag-only (emoji + ISO codes). Clubs need logos. *(New capability.)*
2. **ESPN sync is single-tournament by design** — one global `ESPN_LEAGUE` env var, a WC-hardcoded date window in the scores route, and a results loop not scoped by `tournament_id`. This must become per-tournament to run EPL alongside (or after) the World Cup.
3. **38-round UX** — predict + leaderboard render one tab per round; 38 tabs is cramped and needs month/matchweek grouping.

ESPN data availability is **confirmed**: 20 teams (with IDs, abbreviations, logos) and the full 380-match fixture list with `event_id`s and kickoff times, from the 21 Aug 2026 opener to the 23 May 2027 final day.

**Rough effort:** ~1.5–2.5 weeks of focused work, dominated by (2) the sync refactor and (1) crest handling. No large migrations.

---

## 2. What we're NOT changing (already generic)

Grounded in the code:

| Concern | Why it already works |
|---|---|
| Round vocabulary | `fixtures.round` is `text`; enum dropped (`063`). Trigger keys on `tournament_rounds.round_code`. |
| Scoring maths | `score_predictions_for_fixture()` (`081`) reads `result_pts / exact_bonus / margin_bonus / pen_bonus / fav_team_2x` from the round row. `predict_mode='score'` gives exact-score + margin bonus. |
| Predict tabs | `buildRoundTabs()` (`round-tab-utils.ts`) is fully DB-driven; "no round codes are hardcoded". |
| Leaderboard | `leaderboard` MV (`113`) groups by `(user_id, tournament_id)`; format-agnostic. |
| Multi-tournament coexistence | Everything carries `tournament_id`; homepage already supports a multi-tournament switcher (`page.tsx:2333`). |
| Bonus/favourite team | `user_tournaments.favourite_team` is per-tournament; `fav_team_2x` is a per-round flag. |
| Knockout/bracket/penalties | Dormant for a league: `is_knockout=false`, `pen_bonus=0`, no `bracket_slot`, all teams known so placeholder-blocking never trips. |

**Net:** no changes to the scoring trigger, the leaderboard views, the predictions table, or the core predict/leaderboard data flow.

---

## 3. Data model

### 3.1 New: club crest support (schema change)

The one real schema gap. Today teams live in `tournament_teams (name, fifa_code, flag_emoji, fifa_rank)` and the display flag comes from either that row or the hardcoded `TEAM_FLAGS`/`TEAM_ISO` maps in `team-flags.ts` — all nation-based.

**Change:** add a crest URL to `tournament_teams`.

```sql
ALTER TABLE public.tournament_teams
  ADD COLUMN IF NOT EXISTS logo_url text,        -- club crest (ESPN team.logos[0].href)
  ADD COLUMN IF NOT EXISTS short_name text;      -- e.g. "Spurs", "Man Utd" for compact UI
-- grants already cover the table (migration 110); no new table so no new grants needed.
```

Then the flag-resolution helpers (`UserPrefsContext.flag()`, and any `flagFor()` callsite that renders a team badge) fall back to `logo_url` when `flag_emoji` is absent. Prefer a small `TeamBadge` component: `flag_emoji ? <emoji> : logo_url ? <img> : neutral`. Clubs never set `flag_emoji`, so they render the crest.

> Decision needed: **host crests ourselves or hotlink ESPN?** ESPN logo URLs are stable but external. Recommend downloading the 20 crests once and serving from `/public/clubs/` (or Supabase storage) to avoid an external dependency and CSP issues.

### 3.2 New: per-tournament ESPN league slug (schema change)

Today `src/lib/match-results.ts:75` reads a single global `ESPN_LEAGUE` env var (default `fifa.world`). One global value cannot serve two tournaments. Move it onto the tournament:

```sql
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS espn_league text;     -- 'fifa.world' (WC) | 'eng.1' (EPL)
UPDATE public.tournaments SET espn_league = 'fifa.world' WHERE slug = 'wc2026';
```

`espnScoreboard()` becomes `espnScoreboard(dates, league)` and callers pass the tournament's slug.

### 3.3 Seed data (no schema change)

1. **`tournaments` row** — `slug='epl-2026-27'`, `name='Premier League 2026/27'`, `espn_league='eng.1'`, `start_date=2026-08-21`, `end_date=2027-05-23`, `total_teams=20`, `total_rounds=38`, `total_matches=380`, `is_active` per rollout (see §7).
2. **`tournament_rounds` — 38 rows**, `round_code='r1'…'r38'`, `predict_mode='score'`, `result_pts` / `exact_bonus` / `margin_bonus` per the scoring decision (§5), `pen_bonus=0`, `is_knockout=false`, `include_in_scoring=true`, `fav_team_2x` optional, **`tab_group`** set to group rounds for UI (§6).
3. **`tournament_teams` — 20 rows**, `name` matching ESPN display names exactly (critical for sync — see §4.3), `logo_url`, `short_name`. No `flag_emoji`.
4. **`fixtures` — 380 rows**, `tournament_id` set, `round='rN'`, `home`/`away` = canonical club names, `kickoff_utc`, `espn_event_id` from ESPN, `grp=NULL`. Loaded by a new import script (§4.4).

---

## 4. ESPN integration (the main effort)

### 4.1 Make sync per-tournament

Files and the WC-specific assumptions to fix (grounded):

| File | Assumption today | Change |
|---|---|---|
| `src/lib/match-results.ts:75-78` | global `ESPN_LEAGUE` env | accept `league` param; callers pass `tournaments.espn_league` |
| `src/app/api/scores/sync/route.ts:18-19,30-32` | hardcoded `TOURNAMENT_START/END` (WC dates) | derive window from each tournament's `start_date/end_date` |
| `scores/sync/route.ts` (results loop) | pulls **all** pending fixtures globally, matches vs one scoreboard | iterate active tournaments; per tournament, fetch its `espn_league` scoreboard and match only its fixtures |
| `src/lib/bracket/schedule-sync.ts:32` | single `is_active` tournament | scope by `tournament_id`; only run for knockout tournaments (EPL doesn't need schedule refresh — teams are fixed) |

**Recommended shape for `scores/sync`:** loop over `tournaments WHERE is_active AND now() BETWEEN start_date AND end_date`, and for each, run the existing results block scoped to that tournament's fixtures + `espn_league`. Keep the "results first, side-effects last" ordering already in place. This makes the route genuinely multi-tournament and removes the WC date hardcode.

### 4.2 Matching strategy

The scores route matches by **canonical team-name pair + date** (`route.ts:65-76`), not `espn_event_id`. That works for EPL provided the club alias maps are complete (§4.3). Because we'll import EPL fixtures **with `espn_event_id` populated** (§4.4), we could optionally add an event-id fast path to the route (more robust than name-pair for clubs with ambiguous short names). Recommend: **populate `espn_event_id` at import and prefer it when present**, falling back to name-pair.

### 4.3 Club name canonicalization (new alias tables)

Two canon layers exist, both nation-only today:
- `team-canon.ts → canonTeam()` + `TEAM_ALIASES` — the **matching token** used by scores sync.
- `team-flags.ts → canonicalTeamName()` + `TEAM_ISO_ALIASES` — the **display normaliser**.

Add an EPL club alias set so ESPN spellings reconcile to our stored names, e.g.:

```
'Manchester United' / 'Man United' / 'Man Utd'      → manutd
'Manchester City' / 'Man City'                      → mancity
'Tottenham Hotspur' / 'Spurs' / 'Tottenham'         → tottenham
'Nottingham Forest' / "Nott'm Forest"               → nottinghamforest
'Brighton & Hove Albion' / 'Brighton'               → brighton
'Wolverhampton Wanderers' / 'Wolves'                → (n/a this season)
'AFC Bournemouth' / 'Bournemouth'                    → bournemouth
'Newcastle United' / 'Newcastle'                    → newcastle
'West Ham United' / 'West Ham'                       → (n/a this season)
```

Store club aliases separately (keyed by tournament sport/type) so nations and clubs don't collide. Since matching is scoped per tournament (§4.1), collisions are unlikely, but keep the sets distinct for clarity.

### 4.4 Fixture import script

New `scripts/import-epl-espn.js`, modeled on `sync-r16-espn.js` (kickoff/event-id keyed, **not** the bracket-slot script):
- Fetch `eng.1` scoreboard month-by-month (Aug 2026 → May 2027).
- For each ESPN event: derive `round` from ESPN's matchweek/`week` number (→ `r{week}`), canonical `home`/`away`, `kickoff_utc`, `venue`, `espn_event_id`.
- DRY-RUN by default, `--apply` to write (matches existing script convention).
- Upsert into `fixtures` with `tournament_id` = the EPL tournament, guarded `.is('home_score', null)`.
- Also emit the 20 `tournament_teams` rows (name + logo_url from `team.logos[0].href` + short_name).

### 4.5 Cron

Current cron (`score-sync-pg_cron.sql`) pings one URL every 5 min. Once `scores/sync` iterates active tournaments (§4.1), **the same single cron covers EPL too** — no second cron needed. If we keep them separate instead, EPL would need its own endpoint/slug. **Recommend the iterate-active-tournaments refactor** so one cron serves all.

> Note: EPL matches cluster on weekends; the 5-min cadence is fine. Consider raising `timeout_milliseconds` to 120000 (already a standing ops item) since a multi-tournament loop does more per run.

---

## 5. Scoring configuration (product decision)

A league wants exact-score guessing. Proposed per-round config (all 38 rounds identical unless we weight late-season rounds):

| Field | Value | Rationale |
|---|---|---|
| `predict_mode` | `score` | tipsters pick exact scorelines |
| `result_pts` | `3` | correct outcome (W/D/L) |
| `exact_bonus` | `3` | exact scoreline |
| `margin_bonus` | `1` | correct result + correct goal difference (not exact) |
| `pen_bonus` | `0` | no knockouts |
| `fav_team_2x` | `false` (or true) | see below |
| `is_knockout` | `false` | league |

**Open decisions:**
- **Favourite/bonus team for a league?** The WC doubles points on your bonus team's matches (group + R32). For EPL, a "support your club" 2× on your team's fixtures is a natural engagement hook — but it's optional. Recommend enabling `fav_team_2x=true` league-wide with the club as the bonus team.
- **Weight later rounds?** WC escalates points by round. A league is flat by nature; recommend flat scoring for fairness, optionally a "run-in" boost for the final 5 rounds.

No code changes — these are `tournament_rounds` values.

---

## 6. UI / UX

### 6.1 38-round tab problem

Both predict (`predict/page.tsx:862-924`) and leaderboard (`leaderboard/page.tsx:61-104`) render one tab per `tab_group`. 38 groups = 38 cramped tabs.

**Options (via `tournament_rounds.tab_group`, no code change):**
- **A. Month grouping** — `tab_group` = `aug`,`sep`,…`may` (~10 tabs). Cleanest. Each tab shows that month's matchweeks.
- **B. Matchweek tabs with a "current MW" default + prev/next** — needs a small predict-page enhancement to default to the live matchweek and paginate rather than show all 38.
- **C. Hybrid** — month tabs on leaderboard (snapshots), single "this matchweek" focus on predict with a round dropdown.

Recommend **A for leaderboard, B/C for predict** (players mostly care about the current matchweek). B/C is a modest predict-page change.

### 6.2 Team badges

Replace emoji-only rendering with a `TeamBadge` that prefers `flag_emoji` then `logo_url`. Touch points: `UserPrefsContext.flag()`, predict `MatchRow`, leaderboard rows, any fixture card.

### 6.3 Hardcoded WC bits to parameterize

- `predict/page.tsx:31` — `TOURNAMENT_KICKOFF = 2026-06-11` (fav-team lock). Use the tournament's `start_date` or `app_settings` override.
- `predict/page.tsx:1127` — print header "⚽ TipComp 2026" (cosmetic).
- `getDefaultScoringConfig()` (`types/index.ts:74-84`) — WC fallback used pre-hydration only; harmless but worth a comment.

### 6.4 Challenges

The existing challenge system (match challenges, sponsor campaigns, promo cards) is tournament-agnostic and works as-is for EPL — e.g. single-match "pick the score" challenges on marquee fixtures (a Manchester derby), sponsored by a local venue. No change needed.

---

## 7. Rollout / phasing

**Phase 0 — Spike (½ day):** run the import script in DRY-RUN to prove ESPN → fixtures mapping (teams, 380 fixtures, round numbers, event ids). De-risks §4 before any schema work.

**Phase 1 — Schema + seed (1–2 days):**
- Migration: `tournament_teams.logo_url/short_name`, `tournaments.espn_league`; backfill WC slug.
- Seed EPL tournament + 38 rounds + 20 teams (crests downloaded to `/public/clubs/`).
- Import 380 fixtures (`--apply`). Keep `is_active=false` so it's invisible.

**Phase 2 — Sync refactor (3–5 days, the core):**
- `espnScoreboard(dates, league)`; per-tournament window; iterate-active-tournaments in `scores/sync`; scope schedule refresh.
- Club alias tables in both canon modules.
- Test end-to-end against a past EPL matchweek (feed known results, confirm scoring).

**Phase 3 — UX (2–3 days):**
- `TeamBadge` + crest rendering.
- Tab grouping (month `tab_group`s; predict current-matchweek default).
- Parameterize the hardcoded kickoff date.

**Phase 4 — Launch:**
- Flip `is_active=true` (homepage switcher already handles multiple actives — but audit the `.maybeSingle()` "single active tournament" callsites first: auth callback, challenges, polls, sponsors, debrief. These assume one active row and need review before running WC + EPL simultaneously).
- Announce; optionally seed a launch match challenge.

---

## 8. Risks & open questions

1. **`.maybeSingle()` on `is_active`** — several routes assume exactly one active tournament (schedule-sync `:32`, plus challenges/polls/sponsors/debrief). Running EPL concurrently with another active tournament will break these. **Must audit + fix before two tournaments are active at once.** (If EPL launches *after* the WC is marked complete, this is deferred — see Q below.)
2. **Crest hosting** — self-host vs hotlink ESPN (recommend self-host).
3. **Matchweek → round mapping** — confirm ESPN's `week.number` is reliable across all 380 events (postponements can muddy this). The import script should log any event missing a week number.
4. **38-tab UX** — needs a design decision (§6.1).
5. **Scoring model** — flat vs weighted; bonus-team on/off (§5).
6. **Stale `src/types/database.ts`** — only goes to ~migration 060; not runtime-critical but should be regenerated at some point.

### Key product question
**Does EPL run *concurrently* with the World Cup, or *after* it?** If after (WC marked `completed`, EPL becomes the sole active tournament), the multi-active `.maybeSingle()` risk (Risk 1) largely disappears and Phase 2/4 get simpler. If concurrent, that audit is mandatory. This single decision meaningfully changes scope.

---

## 9. Effort summary

| Phase | Effort | Risk |
|---|---|---|
| 0 · Spike | ½ day | low |
| 1 · Schema + seed | 1–2 days | low |
| 2 · Sync refactor | 3–5 days | **medium** (multi-tournament) |
| 3 · UX | 2–3 days | low–medium (38-tab design) |
| 4 · Launch | ½–1 day | medium (concurrency audit) |

**Total: ~1.5–2.5 weeks**, no large migrations, no changes to scoring/leaderboard cores. The dominant cost is making the ESPN sync layer genuinely multi-tournament — which is reusable infrastructure for any future competition (another league, next World Cup, etc.), not throwaway EPL work.
