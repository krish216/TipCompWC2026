# Bracket — Knockout Mode (real-fixture seeding)

> Status: PLAN for review. Local only — not pushed.
> Goal: once the group stage is over, the bracket builder shows the **actual** Round-of-32
> teams (matching ESPN/FIFA) instead of each user's predicted qualifiers, and drops the
> now-pointless group-prediction steps.

## Decisions (agreed)
- **Scope B — real teams for everyone.** Real R32 teams replace predicted ones for *all*
  brackets, existing and new. (Reverses the earlier "leave the 30 as-is" call.)
- **Orphaned picks → ignore at render.** Non-destructive: if a stored winner pick is not one
  of the two real teams now in that tie, treat the slot as unpicked. No DB writes; fully
  reversible; the user simply re-picks affected ties. Cascades down the tree.
- **Hide Groups + 3rd Place tabs** in knockout mode; bracket is the only step.
- **Gate = a dedicated toggle in Tournament admin.** A new `tournaments.bracket_knockout_mode`
  boolean, flipped from the **Tournament** tab (🏆) of the admin dashboard — same UX as the
  existing `knockout_leaderboard_enabled` / `allow_retroactive_predictions` toggles. Explicit
  and independent of the round-locks (`gs1`/`gs2`/`gs3`) state.
  - (Decided against deriving it from round-locks. Note for context: there is **no `gs`** round
    — group stage is `gs1`/`gs2`/`gs3`; at time of writing `gs3` and `r32` are both open.)
- **No scoring / lock changes** — scoring is already knockout-only; entries already close at
  first R32 kickoff.

## Why this is the right shape (verified facts)
- R32 card teams currently come from `resolveSlot(descriptor)` → the user's **group picks**
  (`src/app/bracket/page.tsx`). That's the only thing to change for "real teams".
- The real R32 matchups live in `fixtures` (round `r32`, `home`/`away` by `bracket_slot`) —
  already fetched for the date labels. Some are real (`Germany v Paraguay`), some still
  placeholders (`Group L Winner`, `Third Place Group E/H/I/J/K`) and firm up progressively.
- The app's bracket **topology is correct** (verified vs official WC2026 bracket, matches
  73–104). So only *seeding* changes, not the tree.
- Group/3rd-place picks are **not scored** — removing them as a prediction step costs nothing.

## Implementation

### 1. Knockout-mode flag (admin toggle)
- **DB:** add `tournaments.bracket_knockout_mode boolean NOT NULL DEFAULT false` (migration;
  no new grants — `tournaments` already granted via mig 110).
- **API:** add the field to `/api/tournaments` GET select + PATCH allowlist (mirror
  `knockout_leaderboard_enabled` at `src/app/api/tournaments/route.ts`).
- **Admin UI:** a toggle row in the **Tournament** tab of `src/app/admin/page.tsx` (copy the
  `knockout_leaderboard_enabled` toggle handler + markup).
- **Client read:** bracket reads `tournament.bracket_knockout_mode` → `knockoutMode`.
- **Dev override for local testing** (localhost shares the prod DB; don't flip the real toggle):
  honour `?knockout=1` / `?knockout=0` only when `NODE_ENV !== 'production'`.

### 2. Real R32 participants
- Extend the existing r32-fixtures fetch to also map `home`/`away` (not just `kickoff_utc`/`venue`)
  keyed by `bracket_slot`.
- Mark each team as **resolved** (real) vs **placeholder** (seed label like "Group L Winner").

### 3. Seed R32 from fixtures
- In knockout mode, each R32 card's `homeTeam`/`awayTeam` come from `r32Fixtures[r32:N].home/away`
  instead of `resolveSlot(...)`. Descriptors (`1E`, `T1`) become irrelevant for display.
- Placeholder team ⇒ render non-pickable "TBC"; the tie unlocks once both teams resolve.

### 4. Render-time pick validation (cascade)
- Derive "effective picks" by walking the tree top-down:
  - R32: if `picks[r32:N]` ∉ {real home, real away} → treat as unpicked.
  - R16/QF/SF/Final: participants derive from the parent picks; if a stored winner ∉ its two
    current participants → treat as unpicked. A nulled parent naturally empties the child.
- Purely render-time; `bracket_picks` is never mutated.

### 5. Hide group steps
- Hide **Groups** + **3rd Place** tabs when `knockoutMode`; default section → `bracket`.
- Bypass the `needGroups` / "complete your groups first" gate in `BracketSection` (groups no
  longer required — the bracket seeds from fixtures).

## Files
- **Migration** — `tournaments.bracket_knockout_mode boolean NOT NULL DEFAULT false`.
- `src/app/api/tournaments/route.ts` — add field to GET select + PATCH allowlist.
- `src/app/admin/page.tsx` — Tournament-tab toggle (mirror `knockout_leaderboard_enabled`).
- `src/app/bracket/page.tsx` — read `bracket_knockout_mode` + dev override; extend r32 fixtures
  map with home/away; R32 seeding from fixtures; effective-picks cascade; hide tabs; bypass
  needGroups.
- (`bracket_slot` already added to `/api/fixtures`.)

## Edge cases
- **Partial fixtures** — TBC teams shown, not pickable, unlock progressively.
- **Existing users** — see real R32; orphaned picks silently drop from view (per decision).
- **New users** — no group step; straight to the bracket with real teams (the "start level"
  knockout experience from the Round-3 broadcast).

## Out of scope (separate)
- Actively clearing orphaned picks in the DB (we chose render-time ignore).
- Showing live *results* in the builder (that's leaderboard/scoring territory).

## Test checklist (local, dev override)
- `?knockout=1`: Groups/3rd tabs hidden; R32 shows real teams + dates; TBC ties not pickable.
- Existing bracket with predicted qualifiers: orphaned R32 winner picks show as unpicked;
  downstream cleared; valid picks retained.
- `?knockout=0`: original prediction flow intact.
- New/empty bracket: lands on bracket, real teams seeded, fully pickable where resolved.
