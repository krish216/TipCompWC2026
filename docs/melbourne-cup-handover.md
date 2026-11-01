# Melbourne Cup sweeps: handover brief

State as of Sun 1 Nov 2026 (main at `b87c404`). The race is **Tue 3 Nov, 3pm AEDT**.
Everything below lives in this repo (`wc2026`), deployed to tribepicks.com by Vercel on push to `main`.

## What it is

Office Melbourne Cup sweeps. An organiser creates a sweep, shares one link or QR, and members
request tickets and pay the organiser **directly** (cash, bank transfer/PayID with a receipt
photo, or IOU if allowed). **TribePicks never touches sweep money.** Once a ticket is approved,
its holder spins a wheel and the **server** draws a random horse. After the race, an admin
enters the result once; every pool's prizes are worked out (roll-down) and everyone is emailed.

In the codebase a sweep is a **comp** (`comps`) under a tournament with `format = 'sweep'`.
Each comp has 1–5 **pools** (`tribes`, one ticket per horse). Tickets are `sweep_entries`.

## User-facing surfaces

| Route | Who | What |
|---|---|---|
| `/melbourne-cup` | public | Landing page, expression of interest form, QR (`?src=qr`) |
| `/melbourne-cup/race` | public | Voiced practice race demo, no sign-in. The link used for Reddit/socials |
| `/sweep` | signed in | Open sweeps, "My Sweeps" cards (pool pills, "N to approve", **➕ Add a pool**), join via `?code=` |
| `/tribe` (labelled "My Pool") | member | `SweepPoolPanel`: buy tickets, spin, sweep sheet, winners; **Bring a colleague in** QR |
| `/sweep-admin` | organiser | Tabs: Sell (QR + "Show this QR on My Pool"), Requests, Allocation, Pools, Settings |
| `/admin/sweep-horses` | platform admin | Race start, field paste, scratchings, the result |
| `/admin` (tournament) | platform admin | "New sweeps" switch (`enrollment_open`), **Draw open** switch + reminder emails |

## Code map

- **Libraries, `src/lib/sweep/`.** Each file opens with a header comment explaining its rules. Read those first.
  - `draw.ts`: the only random draw. `UNIQUE(tribe_id, horse_id)` guards races between draws.
  - `field.ts`: pool capacity. Before the draw opens, pools sell up to the maximum field size; after, one ticket per runner.
  - `grace.ts`: holders get 2h to spin before the organiser may draw for them.
  - `prizes.ts`, `podium.ts`, `pool-result.ts`, `results.ts`: pot maths, roll-down prizes, dead heats, results emails.
  - `tickets.ts`: ticket grants, capped at field size.
  - `organiser.ts`: payment and contact details, approval window, `AUTO_LOCK_BEFORE_MS`, the member-QR flag.
  - `billing.ts`: buying pools. **Off** unless `SWEEP_BILLING_ENABLED=true`; prices are placeholders.
  - `practice.ts`: practice sweeps (slug `practice-sweep`).
  - `emails.ts`, `welcome.ts`, `draw-reminders.ts`: Resend emails; none of them throw.
  - `demo-race-scripts.ts` (+ `demo-race-audio.json`): the voiced races.
- **APIs:** `src/app/api/sweep/*`, `src/app/api/tribes/[id]/sweep/*`, `src/app/api/comps/[id]/sweep*`,
  `src/app/api/admin/sweep-{horses,draw}`, `src/app/api/cron/sweep-auto-lock`.
- **Components, `src/components/game/`:** `SweepWheel`, `SweepPoolPanel`, `SweepHorseSheet`, `PoolInviteCard`,
  `PracticeRaceBar`, `PracticeRaceModal` (plain animation), `ScriptedRaceModal` (voiced race).
- **Migrations:** `188`–`209` (all `sweep_*`, plus `200_practice_sweep`, `204_welcome_per_tournament`).
  All are applied to production, including **209**, applied 1 Nov.

## Rules that must not break

1. **No money through TribePicks** for sweeps. "Feed the doggies" (`/feed`, Stripe donations) is a
   separate, optional, for-luck donation. It never unlocks anything; keep it that way, or it stops
   being a donation.
2. **The server draws every horse**, uniformly at random. Nobody chooses.
3. **No animated race for the real Cup.** Real results come only from the official finishing order
   entered on `/admin/sweep-horses`. The animation and voiced calls are for **practice sweeps and the
   public demo only**.
4. **Every dollar goes back as prizes.** Pot = tickets sold × price, with no cut for TribePicks or the
   organiser, because taking one breaches Victorian sweep rules. Anything TribePicks charges for pools is
   paid by the organiser separately, never from a pot. The old "take the pool fee out of the pot" option was
   removed on 1 Nov, and `sweep-settings` refuses `deduct_fee`. The `comps.sweep_deduct_fee` column remains but is unread.
   **Prizes are capped at $5,000 per sweep** (VGCCC, "Melbourne Cup sweeps"), applied to all pools together:
   price × 24 (the maximum field) × pools ≤ $5,000. `prizeCapError()` in `lib/sweep/prizes.ts` is checked at
   creation, on a price change and when adding pools.
5. **Price and prize split lock** once any ticket is sold or requested. Both the UI and the `sweep-settings`
   PATCH enforce this.
6. **Pools can be added, never removed.** All pools are created up front (and when bought), not as earlier ones fill.
7. **Every new table needs explicit PostgREST grants.** See `CLAUDE.md`, and note it is enforced from 30 Oct.

## Race-week runbook

1. **Field.** Paste the starters on `/admin/sweep-horses`, one per line:
   `Number, Horse, Trainer, Jockey, Weight, Barrier`.
   - **Format:** comma or tab separated (a spreadsheet paste works); a header row is skipped.
   - **Upserts by number:** pasting overwrites matching numbers and adds new ones. It never deletes, so scratch leftovers with the toggle.
   - **Drawn tickets follow the number.** A drawn ticket points at the horse *slot*, so changing the name under a number moves that ticket to the new horse. As of 1 Nov only two test tickets (TP Admin) are drawn.
2. **Open the draw** on `/admin` → tournament → Draw open. This sends the "spin for your horse" email and
   notification; there's a dry-run count first. **Status on 1 Nov: still closed (`draw_open=false`)**,
   although the site says the draw opens Sat 31 Oct.
3. **Race start time** on `/admin/sweep-horses`. The `sweep-auto-lock` cron (Supabase pg_cron, CRON_SECRET,
   `supabase/saved-migrations/sweep-auto-lock-pg_cron.sql`) does three things 30 minutes before:
   - locks every pool;
   - draws any unspun tickets;
   - sends the race-morning nudge.
   pg_cron must call the **apex** `https://tribepicks.com`; `www` doesn't resolve.
4. **After the race:** enter the full order (with dead heats as `3=12`) and any DNFs. A complete result
   emails every pool once (`tribes.sweep_results_sent_at` stops repeat sends on a correction).

## Practice sweeps and the voiced race

- **What a practice sweep is:** a fixed field of 12 past Cup winners and one shared practice tournament, at $5 a ticket by default. Organisers rehearse the whole flow with a pretend crew.
- **Running the race:** the organiser taps "Run the race". The tap picks one of six recorded races, and the API saves *that race's* finishing order to every pool's `tribes.practice_results`. Pools then play it voiced; results from before this change fall back to the plain animation.
- **Callers:** two original characters, **Vicky** (the caller) and **Gordo** (who backs a loser every time). Neither imitates a real caller or commentary team, and that must stay true.
- **Audio files:** `public/race-calls/race-1…6/`.
  - `intro.mp3` / `outro.mp3`: demo banter, which mentions the $60 pot.
  - `intro-practice.mp3` / `outro-practice.mp3`: money-free banter for practice pots.
  - `call-00…10.mp3`: the race calls.
  - `sfx/`: bell and crowd.
- **Regenerating audio:** `npx tsx scripts/generate-race-calls.mjs [race-N] [--no-align]` (ElevenLabs).
  - **The key lives only in `.env.local`.** Never on Vercel, never committed, never printed.
  - Alignment needs a permission the key lacks, so the UI estimates word timing (`demo-race-words.json` is empty).
- **Playback engineering in `ScriptedRaceModal`:**
  - **Phones:** play sound only after a tap, so `primeRaceAudio` must run *inside* the tap.
  - **Race clock:** the race follows the voice; two audio elements alternate between calls, and the clock takes over if audio stalls.
  - **Intro:** the banter is audio-driven too, so a late load can't cut off "…and they're set".
  - **After the finish:** the outro preloads during the last call, and a stewards caption covers the pause.
  - **Testing:** sound is easy to break. Test on a real iPhone, and with throttled audio (headless Chrome + `page.route('**/*.mp3', delay)`).

## Environment

- **Vercel:**
  - `RESEND_API_KEY`, `RESEND_FROM`
  - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (donations; pool billing if turned on)
  - `CRON_SECRET`
  - `SWEEP_BILLING_ENABLED`, unset, so billing is off
- **Local only:** `ELEVENLABS_API_KEY`. The ElevenLabs plan should be cancelled before it renews, and the key expires 30 Nov.
- **Local dev:** `npx next dev -p 3005`. Port 3000 is used by another app, and `npm run build` overwrites the dev server's `.next`.

## Open items

- **Before the race:**
  - Paste the real starters.
  - Open the draw.
  - Confirm the race start time and that pg_cron is live.
- **Test on iOS:** the voiced race sound on a real iPhone (Android is confirmed working).
- **Marketing:** the Reddit post goes up Mon 2 Nov, 8–9am AEDT, on r/melbourne (founder disclosed; draft in the session notes).
- **After the Cup:**
  - Pull numbers: sweeps needing a second pool, organiser donations, member feeds.
  - Then decide on pool billing: pay-what-you-want with a floor, sold as a purchase, not a donation.
- **Known limits:**
  - Practice-race banter is money-free, but the demo's still says "$60" (correct for the demo).
  - Organisers can change a practice sweep's price before sales.
  - The member QR is hidden once results are in, within 30 minutes of the race, or when every pool is locked.
