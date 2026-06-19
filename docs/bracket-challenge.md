# Bracket Challenge (sponsor prize) — design

A sponsor-branded, prize-backed **knockout bracket** competition. Users predict the
whole knockout tree once; it locks at the first R32 kick-off; correct picks score
per round; everyone competes in **one global pool** for the sponsor's prize.

This is a **parallel mini-game** — separate from the main per-match knockout scoring
the app already runs. Don't conflate the two.

---

## What already exists (reuse)
- **`bracket_picks`** (mig 097) — full bracket per `user_id` + `tournament_id`, slot-key
  based: `grp:{A-L}:{1|2|3}`, `third:{A-L}`, `r32:{1-16}`, `r16:{1-8}`, `qf:{1-4}`,
  `sf:{1-2}`, `final`. RLS own-row. **This is our pick store — no change needed.**
- **`bracket_predictions`** (mig 098/099) — lightweight **guest** capture (champion +
  runner-up) keyed by `session_id`, with acquisition analytics (`source`, `share_count`,
  `device`). Already a lead-gen funnel — keep as the teaser/entry hook.
- `/bracket` page + `/api/bracket` + `/api/bracket-prediction`.

**Net-new:** scoring, a global leaderboard, an entry/registration step, sponsor config,
and the guest→account conversion.

---

## Scoring
Per **correctly predicted winner** of a knockout slot, scored independently (a wrong
early pick doesn't block a correct later one):

| Round | Slots | Pts each | Max |
|---|---|---:|---:|
| R32   | 16 | 1  | 16 |
| R16   | 8  | 2  | 16 |
| QF    | 4  | 4  | 16 |
| SF    | 2  | 8  | 16 |
| 3rd place | 1 | 4 | 4 |
| Final (champion) | 1 | 12 | 12 |
| **Total** | | | **80** |

- **Group-stage picks (`grp:*`, `third:*`) are NOT scored** — they only help the user
  build their bracket. (Decision to confirm — could be a small bonus.)
- **Tie-breaker** — captured **at entry** as **predicted total goals in the Final** +
  **total goals in the 3rd-place match** (orientation-free — finalists are unknown at entry,
  so a single goal-total per match is cleaner than a scoreline). **Penalty shootouts are
  excluded** (goals up to the end of extra time only — consistent with `fixtures.home_score`
  + `away_score`, which already strip shootout goals; `pen_winner` is separate). Ties broken
  by closeness to the actual Final goal-total → then the 3rd-place goal-total → then earliest
  entry time.
- **Implementation:** a `bracket_scores` view/query comparing `bracket_picks` to actual
  knockout results (from `fixtures`/results, `result_outcome`), summed per user. Mirror
  the main leaderboard's matview pattern.

## Lock & timing
- Bracket **locks at the first R32 kick-off** — no edits after (a real prize = no late
  edits, no disputes). Scores then update live as knockout results land.
- `closes_at` = first R32 kickoff; surfaced as a countdown on the bracket page.

## Data model (additions)
- **`bracket_entries`** — the prize entry / registration (one per user per challenge):
  `user_id`, `tournament_id`, `phone?`, `consent_marketing bool`, `consent_terms bool`,
  `source`, `entered_at`. Contact name/email come from the user account.
- **`bracket_scores`** (view) — `user_id` → points by round + total (from `bracket_picks`).
- **`bracket_leaderboard`** (view/matview) — entrants ranked by total, tie-break applied.
- **Sponsor/challenge config** — for ONE sponsor, an app_setting/config entry
  (`sponsor_name`, `logo`, `prize`, `terms_url`, `closes_at`). If it becomes recurring →
  a `bracket_challenges` table. Assets in `public/sponsors/<slug>/`.

## Entry / registration flow
- **Existing member:** open `/bracket` → fill bracket → **"Enter to win"** → enter the
  **tie-break scores** (predicted Final + 3rd-place) + tick consent (T&Cs + share-with-
  sponsor) → `bracket_entries` row. Done.
- **Guest (no account):** fill the bracket (held client-side / `session_id`) → **"Enter to
  win"** → register (name + email + phone + consent) → **create/claim a TribePicks account**
  (magic-link / passwordless) → picks persisted to `bracket_picks` under the new `user_id`
  → `bracket_entries` row. **They're now a normal tracked user.**

Registration is the single moment that delivers all three goals: **sponsor lead**, **prize
eligibility**, and **persistent tracking**.

## Tracking & leaderboard (answer to "how do they track progress?")
One login = one identity across the app, so:
- **Your bracket progress** — `/bracket` shows the filled bracket lighting up ✅/❌ as
  results land, a running **points total (/80)**, and your **rank**.
- **Per-round scorecard (tap to drill in)** — on the bracket scoreboard, tap any round
  (R32 … Final) to expand a **match-by-match breakdown**: your pick → who actually won →
  ✅/❌ → points earned, plus the round total. (Same idea as the prediction-page tipsheet,
  but scoped to *your bracket*.) Only your own card is drillable (others' picks stay hidden).
- **Leaderboard** — a **single global pool** (everyone vs everyone for the one prize) —
  simpler than the comp/tribe-scoped main board. Ranked by points + tie-break. Shows the
  **top 12** plus a **"your position"** sticky row (so players outside the top 12 still find
  their rank). Reserved **ad/sponsor-banner space** sits below the board.
- **Reuse:** add a **"Bracket" scope tab** to the Scoreboard page, and fire **bell
  notifications** off results ("🏆 Your champion advanced — +12 pts").
- **Guests** are tracked loosely by `session_id` until they register → then full tracking.

## Login decision — single TribePicks account (no separate login)
A parallel login fragments identity, doubles auth/security surface, adds friction, and
buys nothing. Reach/lead-gen for the sponsor comes from the **guest→email→account**
funnel, not a separate login. One account → consistent tracking, one leaderboard,
notifications, and the sponsor still gets the emails.

## Sponsor & legal
- **Branding: co-branded, sponsor-led header.** The **sponsor logo leads** (top-left,
  prominent — the placement they're paying for); **TribePicks** sits top-right with a small
  "powered by". The prize line names the voucher, and an **ad / sponsor-banner space sits
  below the bracket** (ad-free for premium). Logo, prize and ad are all **per-challenge
  config** so it's swappable per sponsor/season.
- **Trade-off to hold deliberately:** a sponsor-led header makes the challenge feel like
  *the sponsor's* product — great for *that* deal, less reusable than a TribePicks-led
  header. Acceptable while it's a one-sponsor acquisition play; revisit if it becomes a
  recurring multi-sponsor format.
- **Legal:** a **skill-based** bracket is usually exempt from AU trade-promotion permits
  (confirm per state), but **capture explicit consent** to share entrant contacts with the
  sponsor, and disclose in `/privacy`. Decide who fulfils/contacts the winner.

## Decisions
**Confirmed:**
1. ✅ **Open to the public** — it's an acquisition tool (guest → email → account funnel).
2. ✅ **Tie-breaker** = predicted **total goals** in the Final + the 3rd-place match, at entry.
3. ✅ **Co-branded header** — sponsor logo leads (top-left), "powered by TribePicks"
   (top-right); ad/sponsor-banner space below the bracket.

**Still open:**
4. **Group picks** — unscored (current plan) or a small bonus?
5. **One prize** or tiers (e.g., top 3)?
6. Winner **fulfilment** — TribePicks or the sponsor contacts/verifies the winner?

## Build phases
1. ✅ **Scoring + global leaderboard** (read-only, members) — `bracket-scoring.ts` +
   `/api/bracket/leaderboard`, computed on read. Sim overlay for testing.
2. ✅ **Entry/registration + sponsor branding** + lock/countdown — `bracket_entries`
   (mig 116), `/api/bracket/enter`, `BracketEntryModal`, co-branded header + admin config.
3. ✅ **Guest→account conversion** funnel (the lead-gen engine):
   - Guest fills a bracket on `/bracket` (held in localStorage). Once a champion is
     picked, the completion card's primary CTA is **"Enter the Bracket Challenge"**.
   - `BracketGuestEntryModal` captures name + email + tie-breakers + phone + the two
     mandatory consents and POSTs to **`/api/bracket/guest-enter`** with the localStorage bracket.
   - **New email** → server creates a passwordless account (`auth.admin.createUser`,
     `signup_flow='bracket_guest'`), persists `bracket_picks` + `bracket_entries`
     (`source='guest'`) instantly, enrols them, and emails a magic login link
     (→ `/bracket/leaderboard`). They're in the draw immediately.
   - **Existing email** → writes **nothing** (an unauthenticated form must never touch
     an existing account); emails a magic login link (→ `/bracket`). On return their
     localStorage bracket migrates and the stashed entry (`PENDING_ENTRY_KEY`) replays
     via `/api/bracket/enter`. No new migration required.
4. **Notifications + share** (reuse existing systems).

## Per-challenge leaderboards (multi-sponsor) — mig 121
The original model was **one** bracket challenge per tournament. It's now **many
concurrent challenges, one shared bracket**: a user fills a single bracket
(`bracket_picks`, still tournament-keyed) and *enters* specific challenges; each
challenge has its own entry pool + branded, shareable leaderboard you can point a
sponsor at.

- **Schema (mig 121):** `challenges` gains a unique `slug` and drops the
  one-bracket-per-tournament constraint; `bracket_entries` gains `challenge_id`
  with a `(user_id, challenge_id)` unique (was `(user_id, tournament_id)`).
- **Resolution:** every bracket API resolves its challenge via
  `lib/bracket/challenge.ts` — by `?challenge=<slug>`, else the tournament's
  default bracket challenge (so legacy slug-less URLs keep working).
- **Leaderboard = the challenge's entrants** (a `bracket_entries` row), not "anyone
  who filled a bracket". Tie-break (Final + 3rd-place goal totals from the entry)
  is now applied. URL: **`/bracket/leaderboard/<slug>`** (slug-less → default).
- **Entry** (`/api/bracket/enter`, guest-enter) and **config** take a `challenge`
  slug; `/bracket` lists open challenges so guests pick which to enter.
- **Still to do (Phase C — admin):** a UI to create bracket challenges (name +
  slug) and attach a sponsor campaign. `ensureChallenge` currently mints a default
  slug; there's no first-class "new challenge" admin form yet.
