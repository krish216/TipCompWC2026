# Tipster Pro — spec (advanced personal stats + showcase page)

**Status:** Scoped, not started. **Owner:** Krish. **Context:** today the only tipster-facing
paid tier is **Ad-free ($2.95)**; the richer **Pro ($9.95)** is comp-organiser features. This
adds a genuine *player* value prop — an **advanced personal stats** dashboard — and a **showcase
page** to sell it.

---

## 1. Tier & pricing (recommendation)

Reposition the tipster tier as **"Tipster Pro" = Ad-free + Advanced Stats**, and **gate stats on
the existing `user_tournaments.is_ad_free` flag** (org `is_premium` also unlocks). This means:
- **No new Stripe SKU / no new flag** — reuse the ad-free purchase + webhook + flag already live.
- Rename the Stripe product line ("TribePicks — Ad-free" → "TribePicks Pro · Tipster") and bump
  price modestly (suggest **$4.95**; `AD_FREE_PRICE_CENTS` in `create-checkout/route.ts`).
- Anyone who already bought ad-free gets stats free — good will, no migration.

*Alternative (more work):* a separate "stats" SKU + flag. Not recommended for v1.

**Gating helper:** `canSeeStats = is_ad_free || is_premium` (read from the same
`user_tournaments` row `UserPrefsContext` already fetches: `is_premium, is_ad_free`).

---

## 2. v1 scope (4 deliverables)

Two distinct Pro tiers → **two separate showcase pages** (different audiences, value props,
prices, and CTAs). The CompChief tier has **no landing page today** (it only surfaces inside the
upgrade modal), so this gives it one too.

1. **`GET /api/tipster/stats`** — computes all v1 stat modules server-side for the current user.
2. **`/stats` page** — "My Tipster Stats" dashboard (gated; teaser + upsell when not Pro).
3. **`/pro/tipster` page** — public showcase for **Tipster Pro** (stats + ad-free · ~$4.95).
4. **`/pro/comp-chief` page** — public showcase for **CompChief Pro** (organiser features · $9.95).

Wire each existing upsell CTA directly to the relevant page (player upsells → `/pro/tipster`;
comp-admin `UpgradeModal` → `/pro/comp-chief`). No generic `/pro` chooser — the audience is
always known at the point of intent, so a chooser would just add a click. (A footer can list both
if a catch-all is ever wanted.)

**No schema changes** — tipster stats derive from existing tables; CompChief features ship today.

---

## 3. Data sources & per-stat computation

Inputs: `predictions` (user_id, fixture_id, home, away, points_earned, standard_points,
bonus_points, locked_at), `fixtures` (home_score, away_score, round, kickoff_utc, home, away),
`leaderboard` MV (total_points, correct_count, predictions_made, bonus_count), `user_tournaments`
(favourite_team), `tournament_teams` (name, **`fifa_rank`**, flag_emoji), and the mutual-lock
tipsheet (crowd pick per fixture).

**FIFA ranking as the objective favourite signal.** Per match, join both team names to
`tournament_teams.fifa_rank`; **lower number = favourite**, and `|rankA − rankB|` = the size of the
mismatch. This replaces the crowd-majority proxy for "who was the favourite," and unlocks the
upset/chalk tendency axis below. Snapshot is frozen pre-tournament (see §3a), so it's stable and
needs no live feed. Matches where either side is unranked/placeholder are skipped for these modules.

| Module | Computation |
|---|---|
| **Percentile** | `rank / total_players` from `leaderboard` (rank = count with more points + 1) |
| **Result hit-rate** | `correct_count / predictions_made` |
| **Streak** | walk the user's scored predictions by kickoff; longest/current run where predicted outcome == actual outcome |
| **Form curve** | points per round (round breakdown MV) + cumulative rank at each completed round |
| **Goal bias** | `avg(pred.home+pred.away) − avg(actual.home+actual.away)` over scored, tipped fixtures |
| **Draws called** | % of actual draws the user predicted as draws, vs field avg |
| **Favourite-backer (chalk index)** | % of picks where you backed the **higher-FIFA-ranked** team + your hit-rate on them — your "side with the favourite" rate |
| **Giant-killer (upset-caller)** | of picks where you backed the **lower-ranked underdog**, how often you were right; flags you as Banker 🏦 ↔ Maverick 🎲 |
| **Biggest upset called** | your correct pick with the largest favourable rank gap (lowest-ranked team you backed to win, and they did) — prime share-card line |
| **Strength-adjusted accuracy** | hit-rate split by clear-favourite matches (big rank gap) vs coin-flips (small gap) — are you a banker or a flair caller? |
| **Bonus Team ROI** | `sum(bonus_points)` + `favourite_team` label |
| **Lock discipline** | avg (kickoff − locked_at); accuracy split early vs late lockers *(v2)* |
| **Best / costliest** | top `points_earned` pick; pick where field scored and user didn't *(field delta)* |
| **Projected finish** | extrapolate form trend over remaining fixtures *(v2)* |
| **Persona** | rule-based archetype from the tendency values (see §4) |

### 3a. FIFA ranking data — storage & sourcing
- **Storage:** `ALTER TABLE public.tournament_teams ADD COLUMN fifa_rank smallint;` (nullable —
  null = unranked/placeholder). One source of truth, already public-read, already name-joined to
  fixtures. No new table.
- **Sourcing:** seed **once** from the **official pre-tournament FIFA/Coca-Cola World Ranking**
  snapshot (the ranking as it stood when players were tipping). **Frozen** for the tournament — FIFA
  only republishes after international windows, and for "who was the favourite at tip time" the
  pre-tournament list is the correct reference. **No live feed needed.**
- **Accuracy gate:** these are factual numbers behind a paywalled feature — seed from a verified
  source, don't approximate. Migration adds the column + a `VALUES` seed of `(name, rank)` matched
  to the exact `tournament_teams.name` strings.

---

## 4. Tipster persona (rule-based, shareable)

Derive one archetype from the tendency signals — drives identity + the shareable card:
- High goal bias → **"The Goal Glutton" 🍔**
- High favourite-backer → **"The Banker" 🏦**
- High contrarian hit-rate → **"The Maverick" 🎲**
- High draw-detection → **"The Stalemate Whisperer" 🤝**
- Top percentile + high hit-rate → **"The Oracle" 🔮**
- Default → **"The All-Rounder" ⚽**

---

## 5. API contract

`GET /api/tipster/stats?tournament_id=…` → `{ pro: boolean, stats?: {...} }`
- If `!canSeeStats`: return `{ pro: false }` (page shows teaser + upsell, no data leak).
- If pro: `{ pro: true, stats: { percentile, hitRate, streak, form[], goalBias, drawsCalled,
  favouriteBacker, bonusRoi, best, persona } }`.
- Single route, all queries batched (service-role admin client, scoped to the user).

---

## 6. UI

### `/stats` — My Tipster Stats (gated)
- Client page, fetches `/api/tipster/stats`. Layout per the mockup in
  `bracket-challenge-debrief`-style cards: headline trio → form curve → tendencies → persona →
  best/costliest → **Share card** button.
- **Not Pro:** show a blurred/teaser version of the cards with a **PremiumGate** overlay → upsell
  to `/pro`. (Reuse `PremiumButton`/`PremiumSection` from `src/components/ui/PremiumGate.tsx`.)
- **Entry points (DECIDED 2026-06-24 — no new nav tab; bottom bar is full):** a **"📊 My Stats"**
  card/link at the top of `/leaderboard` (primary) + a **"📊 My Stats"** item in the existing avatar
  dropdown menu in `Navbar` (secondary). `/stats` stays a standalone, deep-linkable route (needed for
  the share card). NB: keep the name **"My Stats"** distinct from comp-admin's organiser **"Insights"** tab.

### `/pro/tipster` — Tipster Pro showcase (public)
Marketing landing (mirror `/sponsor` & `/bracket/how-it-works`). Audience: **players**.
- **Hero:** "Know your game — TribePicks Pro for Tipsters." Sub: stats + ad-free, one price.
- **Stats preview:** 3–4 mock stat cards (percentile, goal bias, persona, form curve) — the
  same visual the dashboard uses, with sample data.
- **What you unlock:** advanced personal stats · tipster persona · shareable card · ad-free.
- **Price + CTA:** `$4.95 · one-time · whole tournament` → ad-free checkout
  (`/api/stripe/create-checkout` with `adFree:true`). Logged-out → sign-up then upgrade.
- **FAQ:** what's included, per-tournament, refunds.

### `/pro/comp-chief` — CompChief Pro showcase (public)
Marketing landing for the **organiser** tier (features already live; this is its first landing
page). Audience: **comp admins / Comp Chiefs**.
- **Hero:** "Run a bigger, slicker comp — TribePicks Pro for Comp Chiefs." Sub: the org toolkit.
- **What you unlock:** **⏰ Auto-reminders** (set-and-forget nudges to untipped members — §9) ·
  Full Insights · Email campaigns · Create challenges & bonus comps · Full payment tracking ·
  Custom comp branding (logo). *(Auto-reminders is new — lead the pitch with it.)*
- **Preview:** Insights/email/branding screenshots.
- **Price + CTA:** `$9.95 · one-time · whole tournament` → Pro checkout
  (`/api/stripe/create-checkout` with `adFree:false`). Replaces the cramped modal as the rich pitch.
- Keep the existing `UpgradeModal` for in-context upsells, but link "See everything →" to this page.

---

## 7. Shareable stat card (v1b — high marketing leverage)
Render a branded card (OG-image route, e.g. `/api/tipster/card?u=…`) → "I'm **Top 8%** · *The
Goal Glutton* 🍔 · 62% accuracy" with TribePicks branding + a join CTA. This is **UGC acquisition**
— players posting their card is top-of-funnel. Ties into the social/bracket marketing push.

---

## 8. Phasing & effort (rough)
- **v1 (~3 days):** `/api/tipster/stats` (~1d) · `/stats` page + gating (~1d) ·
  `/pro/tipster` showcase (~0.5d) · `/pro/comp-chief` showcase (~0.5d, mostly copy/screens).
- **v1b (~0.5–1d):** shareable stat card (OG image).
- **v2:** contrarian index, lock discipline, projected finish, head-to-head vs tribe rivals.

The two showcase pages can ship **independently of the stats build** — `/pro/comp-chief` needs
no new functionality (org features are live), so it's the fastest win and could go out first.

## 9. Add-on — CompChief Pro auto-reminders

**What:** a Comp Chief flips on **automated reminders** that nudge *their* untipped members before
each deadline — the set-and-forget version of the manual "🔔 Nudge" they already do. A **Pro**
feature; automation is the upgrade over manual chasing.

**Why CompChief, not platform-direct:** keeps the onus and the member relationship with the Chief
(consistent with the model — the platform never reminds tipsters over the Chief's head), and
**strengthens Pro** (automation > manual) rather than cannibalizing the manual nudge tools.

**Behaviour:** per comp, the Chief enables "auto-nudge untipped members [24h] / [3h] before each
round locks." Reminders go out **branded as the comp** to members who haven't tipped that round.
The manual nudge + email-campaign tools stay alongside it.

**Reuses what's live** — essentially "put the existing nudge on a schedule":
`src/lib/untipped.ts` (untipped members), the `/api/comps/nudge-untipped` pattern,
`createNotifications` (in-app), Resend (email), round-deadline data.

**Data model:** per-comp setting `comps.auto_reminder` (`'off' | '24h' | '3h' | 'both'`), gated on
the comp's Pro status (`is_premium`). Dedupe via a small `comp_reminders_sent` table keyed
(comp, round, window).

**Delivery (cron):** new `/api/cron/comp-auto-reminders` on pg_cron (hourly):
- For each **Pro comp** with auto-reminder on, find the open round whose deadline is inside a lead
  window → get its untipped members (existing logic) → send the comp-branded nudge → record to dedupe.
- Honour member notification prefs / unsubscribe.

**Channels:** in-app (free, `round_deadline` type) + **email (Pro)**. Push is a cheap add — OneSignal
is configured (`ONESIGNAL_APP_ID/_API_KEY`).

**UI:** comp-admin → Comms/Settings → "⏰ Auto-reminders" toggle + lead-time select, behind the Pro
gate. Surfaces as a headline feature on the `/pro/comp-chief` showcase.

**Deferred / optional — individual tipster opt-in:** a tipster-set "remind me before deadlines"
preference, as a *free personal fallback* for members whose Chief doesn't nudge. Individual opt-in,
so it doesn't cannibalize Pro. Park it unless absent-admin comps prove a real gap.

**Effort:** ~1.5–2d (comp setting + cron + email/in-app + dedupe + admin UI).

## 10. Delivery plan

**Timing reality:** Pro is **per-tournament, one-time** — it only sells while a tournament is
live. The World Cup ends **~19 Jul 2026**, so the revenue window is the next ~3.5 weeks. Front-load
everything that earns; push only the evergreen v2 stats past the final. Stats are already
meaningful (group stage complete), so there's no "wait for data" reason to delay.

**Phases (in dependency/ship order):**

| # | Phase | Effort | Depends on | Ship target |
|---|---|---|---|---|
| A | **`/pro/comp-chief` showcase** — org features already live; marketing-only | ~0.5–1d | — | **This week (first)** |
| B | **Pricing/positioning** — ✅ **DONE (2026-06-24)**: locked **$4.95**, single Tipster Pro tier (ad-free + stats, reuses `is_ad_free`); `AD_FREE_PRICE_CENTS`→495, product renamed, UI labels bumped | ~0.5d | ✅ price locked | **Shipped (price live with stats)** |
| C | **`/api/tipster/stats`** — headline trio, form curve, 3 tendencies, persona; gated | ~1d | — | Week 1 |
| D | **`/stats` dashboard** + gating + teaser/upsell + entry points | ~1d | C | Week 1–2 |
| E | **`/pro/tipster` showcase** — mock cards, $4.95 CTA | ~0.5d | B (price), C (visuals) | Week 1–2 |
| F | **Shareable stat card** (OG image) — UGC | ~0.5–1d | C | Week 2 (fast-follow) |
| H | **CompChief Pro auto-reminders** — scheduled auto-nudge of untipped members (Pro feature) | ~1.5–2d | — | During WC (Pro upsell + engagement) |
| G | **v2 advanced stats** — contrarian, lock discipline, projected finish, H2H | — | — | **Post-WC** (ready for next tournament) |

**Critical path:** B → E and C → D → E. A is independent (ship immediately). F follows C.

**Recommended sequence:**
1. **A first** — cheapest, zero deps, and it's the only landing page the $9.95 tier has ever had.
   Start converting Comp Chiefs (engagement peaks in the knockouts) within days.
2. **B** — needs your price decision; unblocks E.
3. **C → D → E** — the tipster stats build (~2.5d). Monetises the 1,200-player base during the
   knockout buzz.
4. **F** — share card; amplifies organic reach while the audience is hot.
5. **G** — after the final.

**Gates / acceptance:**
- A: page live · CTA hits Pro checkout · modal links "See everything →".
- C: stats validated against a known user's real predictions (don't charge for wrong numbers) · non-Pro gets `{pro:false}`.
- D: Pro sees data · non-Pro sees teaser + upsell, no data leak.
- E: checkout completes end-to-end (Stripe test) · price matches B.

**Risks & mitigations:**
- *Tournament-ops crunch competes for attention* → ship A (tiny, high-ROI) first, then reassess
  before committing to C–E.
- *Stats correctness = trust* → validation gate at C before it goes behind a paywall.
- *One-shot pricing (can't A/B mid-tournament)* → pick a price, ship, learn for the next event.

**Phase H** is a **CompChief Pro** feature, so it doubles as a Pro upsell *and* an engagement lever
(more tips submitted across every Pro comp). It's independent of the Tipster stats build and pairs
naturally with Phase A (`/pro/comp-chief` showcase) — ship them together so the showcase can lead
with "set-and-forget auto-reminders." It strengthens the Chief-owned model rather than bypassing it.

## 11. Open questions
- ~~Price point ($4.95?) and whether to rename ad-free → "Tipster Pro" or keep ad-free as a cheaper
  separate option.~~ **DECIDED (2026-06-24):** $4.95, single Tipster Pro tier (ad-free + stats, reuses
  `is_ad_free`). No separate cheaper ad-free SKU. Existing ad-free buyers get stats free when they land.
- ~~"Favourite" proxy: crowd-majority (have it) vs real odds (would need a feed) — v1 uses crowd.~~
  **DECIDED (2026-06-24):** use **FIFA world ranking** as the objective favourite signal
  (`tournament_teams.fifa_rank`, frozen pre-tournament snapshot — see §3a). Free, no odds feed,
  cleaner than crowd-majority. Crowd pick stays available as a secondary "vs the field" angle.
- Min predictions before stats are meaningful (gate behind e.g. ≥10 scored picks, else "keep tipping").
