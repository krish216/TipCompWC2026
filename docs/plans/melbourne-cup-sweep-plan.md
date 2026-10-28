# Implementation Plan — Melbourne Cup Digital Sweep

**Status:** Draft for scoping · **Author:** planning pass · **Date:** 2026-10-14
**Target:** bare-bones, shippable by **25 Oct 2026** (Melbourne Cup runs Tue 3 Nov 2026) so organisations have a week+ to set up and fill their sweep before race day.

---

## 1. Executive summary

A sweep is structurally the **opposite** of everything else on TribePicks: no scoring algorithm, no multi-round prediction engine — just a random 1:1 allocation of a race field to entrants, then a manual 1st/2nd/3rd result entry. There's also no racing data feed anywhere in the codebase (the only results pipeline is ESPN **soccer**), so the field and the result are both typed in by hand. For one race a year with ~24 horses, that's a feature, not a gap.

**Architecture decision (per KM):** a sweep is not a new top-level entity — it **is a `tournaments` row** (`format='sweep'`, one race, one field), and every organisation running one uses the **existing `comps`** mechanism exactly as they do today for WC/EPL (self-register, invite code, prize settings). Within a comp, **each `tribe` is an independent pool/draw** — e.g. a company-wide comp where every department runs its own physical-style sweep tin, all visible to the comp admin under one roof. This is a much bigger reuse win than originally scoped: `comps` already carries `prize_type: 'pool'`, `prize_description`, `requires_payment_fee` / `entry_fee_amount`, and `max_tribe_size` (today's per-pool headcount cap) — almost the entire settings surface a sweep needs, with zero schema change.

**Net-new is now genuinely small:** one shared "race field" table (horse list + scratchings + 1st/2nd/3rd result, entered once centrally — not per comp), one "draw" table (who in which tribe got which horse), the draw algorithm itself, and a dedicated gameplay surface replacing `/predict` for `format='sweep'` tournaments (join, reveal-my-horse, full draw list, winner podium). Comp/tribe creation, invite-code joining, and comp-admin management are all reused as-is.

**Confirmed decisions (this doc, from KM):**
- Scratched horse → entrant simply has no chance of winning. No redraw, no emergency-horse reassignment.
- Top prizes go to **1st, 2nd and 3rd** place-getters, not winner-only.
- No money handling by the platform — `requires_payment_fee`/`entry_fee_amount` are informational (as they already are for comps today); cash stays offline between organiser and pool.
- Users must **join the comp (sweep)** — same trust/membership model as every other comp, no separate anonymous flow.
- Brand tension (sweep vs. "no betting, no money" positioning) — acknowledged, framing handled at the marketing/outreach layer, not blocking engineering.

**Rough effort:** ~7–8 focused days, leaving a ~3-day buffer inside the 11-day window to 25 Oct — smaller than the original estimate because comp/tribe infrastructure is reused directly, not rebuilt in shadow form.

---

## 2. What we reuse (reused directly, not just "shaped like")

| Concern | Why it already works |
|---|---|
| Auth / sessions | `getSessionUser()` — no change. |
| Organisation = Comp | `/api/comps/create` + comp-admin self-register — an organisation creates a sweep comp exactly like a WC/EPL comp today, just against the Melbourne Cup `tournament_id`. |
| Pool = Tribe | `tribes` (keyed to `comp_id` + `tournament_id`) already models independent sub-groups under a comp. Each tribe runs its own draw. |
| Invite-code join | `/join?code=...` already handles unauthenticated → login → auto-join. No new join route needed — **KM confirmed entrants must join the comp**, which is exactly this existing flow. |
| Pool size cap | `comps.max_tribe_size` (default 15, PATCHable today) directly serves as "cap this pool near the field size" — no schema change. |
| Prize framing | `comps.prize_type` already has a `'pool'` value, plus `prize_description`, `requires_payment_fee`, `entry_fee_amount` — all editable today via comp-admin. Reused as-is for "this pool is $10/head, pay your organiser." |
| Admin dashboard | comp-admin already lists tribes under a comp with member counts — the "incomplete pools" view (§7) extends this existing surface rather than being a new screen. |
| Broadcast / promo tooling | `scripts/create-broadcast.js`, `scripts/export-*-csv.js` precedent for announcing this to existing comp-admins (warmest lead list — `docs/sponsor-leads.md`). |
| UI component patterns | `TeamBadge`-style icon+label component is a direct template for a "your horse" chip. |

**Net:** no changes to comp creation, tribe creation, invite-code joining, or comp-admin's existing structure. Predictions/scoring/leaderboard are untouched and irrelevant here — a `format='sweep'` tournament simply never routes through them.

---

## 3. Data model

```sql
-- tournaments.format has a CHECK (format IN ('league','knockout')) from migration 159 —
-- confirmed by reading it, not assumed. Must widen before a 'sweep' row can be inserted.
ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS tournaments_format_check;
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_format_check
  CHECK (format IN ('league', 'knockout', 'sweep'));

-- One row for the race itself. format='sweep' tells the app to route this tournament's
-- UI to the sweep gameplay surface instead of /predict + the predictions leaderboard.
-- is_active = FALSE, deliberately: at least 10 call sites (leaderboard, predictions,
-- fixtures, UserPrefsContext, challenges, polls, sponsors, weekly-report cron...) do
-- `.eq('is_active', true).maybeSingle()` assuming exactly one active tournament. EPL is
-- already is_active=true for real, live traffic — adding a second active row risks
-- breaking the app for every EPL player, not just sweep users. The EPL rollout hit this
-- same question and resolved it the same way ("EPL stays inactive globally" while still
-- reachable — see UserPrefsContext.tsx:11): the sweep gets its own slug-scoped routes
-- (like /epl today), never the generic tournament-switcher. No audit of those 10
-- call sites is needed for this feature as a result — deferred, not required.
INSERT INTO public.tournaments (slug, name, format, start_date, end_date, is_active, is_primary)
VALUES ('melbourne-cup-2026', 'Melbourne Cup 2026', 'sweep', '2026-11-03', '2026-11-03', false, false);

-- The race field — ONE shared table per tournament, entered centrally by a platform
-- admin once the final field is published (typically a few days out), not duplicated
-- per comp/tribe. Every pool draws from the same authoritative field + result.
CREATE TABLE IF NOT EXISTS public.sweep_horses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  number          int NOT NULL,                     -- barrier/saddlecloth number
  name            text NOT NULL,
  scratched       boolean NOT NULL DEFAULT false,
  finish_position int,                               -- 1 / 2 / 3 = placegetters; null otherwise
  UNIQUE (tournament_id, number)
);

-- The draw — one row per entrant, scoped to their TRIBE (pool), not the comp. The same
-- horse can be drawn by different users in different tribes (each tribe is an
-- independent sweep), but not twice within one tribe.
CREATE TABLE IF NOT EXISTS public.sweep_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id    uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.users(id),
  horse_id    uuid REFERENCES public.sweep_horses(id),   -- null until the tribe's draw runs
  joined_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tribe_id, user_id),
  UNIQUE (tribe_id, horse_id)
);

-- Lock/draw state lives on the tribe, since each tribe draws independently.
ALTER TABLE public.tribes
  ADD COLUMN IF NOT EXISTS sweep_locked_at timestamptz;   -- set when this pool's draw runs

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sweep_horses, public.sweep_entries TO anon, authenticated;
GRANT ALL ON TABLE public.sweep_horses, public.sweep_entries TO service_role;
```

**Scratching, concretely:** `sweep_horses.scratched = true`. No draw re-runs, no entry reassigns — an entrant whose horse is later scratched just sees "Scratched — not racing" on their card. A real (if unlucky) outcome, not a bug.

**Place-getters, concretely:** `finish_position` set to 1/2/3 once centrally, after the race. Each tribe's winner/2nd/3rd is simply whichever of *their* entrants (if any) drew that horse — a small pool may not contain the actual winning horse at all, same as a real small office sweep. The UI should handle "nobody in this pool had the winner" gracefully, not treat it as an error.

---

## 4. Core flows

1. **Organisation creates a sweep comp** — identical to creating a WC/EPL comp today, just against the `melbourne-cup-2026` tournament. Sets `prize_type`/`prize_description`/`entry_fee_amount` if they want ("pool", "$10/head, winner takes X%").
2. **Members join via invite code** — the existing `/join?code=...` flow, unchanged. They land in the comp's default tribe, or a specific department/pool tribe if the organiser made more than one.
3. **(Central, once) Admin enters the field** — platform admin, not each organiser — one shared `sweep_horses` list for `melbourne-cup-2026`. Scratchings flip the `scratched` flag as they're announced, up to race morning.
4. **Per tribe: "Lock & draw"** — the comp/tribe admin locks entries once their pool is ready and triggers the draw: shuffle the (non-scratched-aware or not — see §7.1 decision) field, assign 1:1 to that tribe's members, `sweep_locked_at` set.
5. **Reveal** — each entrant sees their horse; a shared "whole draw" view lists everyone in their tribe's assignment (normal sweep etiquette).
6. **(Central, once) Race day result entry** — admin sets `finish_position = 1/2/3` on the field. Every tribe's podium recalculates automatically from who drew those three horses.
7. **Winner podium per tribe** — "🏆 {name} — 1st · {horse}" / 2nd / 3rd, shareable to the office group chat.

---

## 5. UI / UX needs (net-new)

- **Comp creation** — likely little to no change: the existing form is already generic. May need to suppress prediction-specific copy/fields when `tournament.format === 'sweep'`.
- **Sweep gameplay surface** (replaces `/predict` for this tournament) — my-horse card (or "draw not run yet"), full tribe draw list, scratched/winner states, 1st/2nd/3rd podium.
- **Tribe admin action** — "Lock & draw" button, gated to whoever can already manage that tribe today.
- **Central admin screen** — enter/edit the field, flip scratchings, enter the 1st/2nd/3rd result. Platform-admin only (shared data, not per-comp).
- **Comp-admin: incomplete pools** — extend the existing tribe list on comp-admin with entrant-count-vs-field-size and lock status per tribe, so an organiser running multiple departmental pools can see which ones still need filling.
- A share-image/OG card for the podium, consistent with the existing `ShareButton`/`ShareCard` pattern.

---

## 6. Resolved decisions (from KM)

1. **Scratched horse → entrant loses their chance, full stop.** No redraw, no emergency reassignment.
2. **Prizes: 1st, 2nd and 3rd**, not winner-only. `finish_position` already models this — no schema rework needed.
3. **Architecture: sweep = tournament + existing comps/tribes**, with each tribe an independent pool. This is the single biggest scope-reducer in this plan.
4. **Entrants must join the comp** — no anonymous/code-only entry path; same membership model as every other comp.
5. **No money handling** — informational only, via the comp fields that already exist.
6. **Brand tension acknowledged**, not an engineering blocker — handled at the outreach/positioning layer.

## 7. Still-open decisions (need a call before build starts)

1. **Entrant count vs field size, per tribe.** A tribe with fewer members than the field (e.g. 10 people, 24 horses) only draws 10 of the 24 — the rest sit unclaimed in that pool. A tribe with *more* members than the field (rare but possible if `max_tribe_size` isn't tightened) needs a cap — recommend defaulting `max_tribe_size` to the field size (24) for sweep-format comps specifically, rather than the current default of 15.
2. **Who triggers "Lock & draw" for a tribe** — the comp admin (who already manages all tribes in their comp) vs. a tribe-level creator. Recommend comp admin, matching today's trust model, unless multi-department organisations want delegated control.
3. ~~`tournaments.format` constraint~~ — **resolved while drafting the migration:** confirmed `CHECK (format IN ('league','knockout'))` from migration 159. The migration in §3 widens it to include `'sweep'`.
4. ~~`is_active` concurrency~~ — **resolved:** the sweep tournament ships `is_active=false` permanently and is reached via its own slug-scoped routes, same pattern as `/epl`. No audit of the ~10 `is_active.eq(true)` call sites needed.

---

## 8. Rollout / phasing (11 days to 25 Oct)

**Phase 1 — Schema + draw engine (1.5–2 days):**
- `melbourne-cup-2026` tournament row, `sweep_horses`, `sweep_entries`, `tribes.sweep_locked_at`.
- Draw algorithm (per-tribe shuffle-assign) + §7.1 field-size/cap decision resolved first.

**Phase 2 — Sweep gameplay UI (2.5–3 days):**
- Join flow needs no new work (reused as-is). Build: reveal-my-horse, full draw list, lock & draw action, suppress prediction-specific comp-creation copy for sweep format.

**Phase 3 — Admin + result entry (1.5–2 days):**
- Central field/scratchings/result entry screen.
- Comp-admin "incomplete pools" extension.
- Winner podium (1st/2nd/3rd) + share card.

**Phase 4 — QA + buffer (2–3 days):**
- End-to-end test: one comp, two tribes (one full, one partial headcount), a scratching, a result where the winning horse lands in one tribe but not the other.
- This buffer is the first thing to protect if any phase slips — 25 Oct isn't the finish line, it's the day organisations need it live to fill their pools before 3 Nov.

---

## 9. Risks & open questions

1. **No racing data source** — field and result are 100% manual entry, centrally. Low risk for one race/year.
2. **§7.1 (field size vs tribe cap) and §7.3 (`format` constraint)** — both need resolving in Phase 1, not deferred; §7.3 specifically could silently break the migration if assumed rather than checked.
3. **Small-pool "nobody had the winner" case** — needs a deliberately graceful empty state, not an afterthought, since it'll be common in smaller departmental pools.
4. **Brand/positioning** — settled as non-blocking (§6.6), but still needs a framing decision before outreach to organisations starts, per the original note.

---

## 10. Effort summary

| Phase | Effort | Risk |
|---|---|---|
| 1 · Schema + draw engine | 1.5–2 days | low, pending §7.1/§7.3 |
| 2 · Sweep gameplay UI | 2.5–3 days | low (join flow fully reused) |
| 3 · Admin + result entry | 1.5–2 days | low |
| 4 · QA + buffer | 2–3 days | — |

**Total: ~7–8 days of build inside an 11-day window**, smaller than the original estimate because comp/tribe/invite infrastructure is reused directly rather than rebuilt in a parallel shape. The real remaining risk is §7 — the two open calls should be made before Phase 1 starts, not during it.
