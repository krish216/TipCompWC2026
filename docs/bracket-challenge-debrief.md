# Bracket Challenge — Debrief & Social Pitch Kit

**Audience:** (1) Claude Cowork, to come up to speed on the feature; (2) Krish, to pitch
the Bracket Challenge on social channels.
**Product:** TribePicks (tribepicks.com) — World Cup 2026 prediction platform.
**Status as of 2026-06-23:** Live. **Newly launched / early adoption** — the growth push
is exactly what the social pitch is for. **Brackets lock Sun 28 June 2026, 19:00 UTC**
(first Round-of-32 kick-off) — so there's a short, urgent window to drive sign-ups.

---

## 1. Elevator pitch (one paragraph)

The **Bracket Challenge** lets anyone predict the **entire World Cup 2026 knockout bracket** —
every winner from the **Round of 32 all the way to the Final**, plus the 3rd-place play-off —
in about two minutes. You build **one bracket**, enter it into as many **challenges** as you
like, and **score points all tournament** as results come in (worth more in later rounds). It's
**free to play**, works **without needing an account to start** (email + a 6-digit code and
you're in), and every challenge has its own **live leaderboard**. Businesses can **sponsor a
Bracket Challenge** — put up a prize, get their brand on a leaderboard the whole game is checking.

---

## 2. How it works (the player journey)

1. **Build your bracket** — pick the winner of every knockout match, R32 → Final, plus the
   3rd-place play-off. ~31 picks, ~2 minutes.
2. **Enter a challenge** — join the free **Global Bracket Challenge**, and/or a **sponsor's
   prize challenge**. One bracket can enter many challenges with a single tap.
3. **Score all tournament** — as results land, correct picks earn points and you climb the
   **live leaderboard**. Later rounds are worth more.

**Key rule:** building a bracket alone does **not** put you on a leaderboard — you must
**enter a challenge**. The upside: one bracket, many challenges. And **entering any sponsor
challenge auto-enters you into the Global board too** ("Global = everyone").

---

## 3. Scoring (80 points up for grabs)

| Round | Pts each | Matches | Total |
|---|---|---|---|
| Round of 32 | 1 | 16 | 16 |
| Round of 16 | 2 | 8 | 16 |
| Quarter-finals | 4 | 4 | 16 |
| Semi-finals | 8 | 2 | 16 |
| 🥉 3rd-place play-off | 4 | 1 | 4 |
| 🏆 Final · Champion | 12 | 1 | 12 |
| **Maximum** | | | **80** |

- A wrong pick simply scores **0** — no penalty.
- **If your champion gets knocked out, you keep every point already banked.** Only future
  picks involving the eliminated team miss out.
- **Penalty shootouts:** you're picking who *advances*, so the shootout winner is the correct
  pick. (This differs from the main TribePicks prediction game, where a shootout scores as a draw.)

Source of truth in code: `src/lib/bracket-scoring.ts` (`BRACKET_SLOT_POINTS`) and the public
explainer page `src/app/bracket/how-it-works/page.tsx`.

---

## 4. Key dates & tie-breakers

- **Lock:** Sun **28 June 2026, 19:00 UTC** (first R32 kick-off). Edit picks freely until then;
  edits apply to **every** challenge you've entered.
- **Tie-breakers:** (1) predicted **total goals in the Final**, then (2) the **3rd-place match**,
  then (3) **earliest entry**. (Goals counted to end of extra time; shootouts don't count.)

---

## 5. The model — Global vs Sponsor challenges

- **Global Bracket Challenge** (`wc2026-bracket`) — the free leaderboard for **everyone**.
  No prize mentioned; it's the universal board. Entering any other challenge auto-enters this one.
- **Sponsor challenges** (e.g. `br-tribepicks` demo board) — **branded prize draws** entered with
  the *same* bracket. A sponsor puts up a prize (a voucher, product, experience), and the
  challenge gets its own **co-branded leaderboard** that players check throughout the knockouts.
  Sponsors can run it **internally** (their team) or **externally** (customers/partners they invite).

This is the commercial engine: free for players, monetised via sponsors who want their brand in
front of an engaged, returning audience through the biggest matches of the tournament.

---

## 6. The guest funnel (why conversion is easy)

A prospective player does **not** need a pre-existing account. The flow:

**Email → 6-digit code (emailed) → account auto-created & verified → auto-signed-in → entered.**

So an invite link or a social post only needs to land someone on the bracket builder — they can
go from "never heard of us" to "entered, on the leaderboard" without a sign-up wall. This is the
single biggest reason the Bracket Challenge is social-shareable: **the CTA is frictionless.**

---

## 7. Surfaces & links

| What | URL |
|---|---|
| Build a bracket (main CTA) | tribepicks.com/bracket |
| How it works (explainer + FAQ) | tribepicks.com/bracket/how-it-works |
| A live challenge leaderboard (example) | tribepicks.com/bracket/leaderboard/br-tribepicks |
| Become a sponsor | tribepicks.com/sponsor |

---

## 8. Current state (internal — be honest, don't overstate in public)

- **Live challenges:** Global (`wc2026-bracket`), TribePicks demo (`br-tribepicks`),
  a sponsor demo (`br-gatedflow`), plus a non-WC test (`champions-league-...`).
- **Adoption:** early — a small number of brackets built so far. The platform overall has a
  **large World Cup base** (1,200+ players across 200+ comps) who are prime targets to convert
  to the Bracket Challenge — they already tip; the bracket is a new, low-effort, high-fun hook.
- **Implication for the pitch:** lead with the **benefit and the deadline**, not with traction
  numbers. The job is to convert the existing base + their networks before the 28 June lock.

---

## 9. Why it matters (value props)

- **For players:** one 2-minute bracket, a whole tournament of stakes, a live leaderboard,
  zero sign-up friction, free. Bragging rights + (in sponsor challenges) a prize.
- **For sponsors:** a branded leaderboard players check daily through the knockouts; cheap,
  on-brand prize; an engaged, returning audience; run it for staff or customers.
- **For TribePicks:** a viral, shareable top-of-funnel that converts casual fans into players,
  and a clean monetisation path via sponsors.

---

## 10. SOCIAL MEDIA PITCH KIT

**North-star CTA:** `tribepicks.com/bracket` · **Deadline hook:** locks **Sun 28 June, 7pm UTC**.
**Tone:** punchy, confident, fun. **Core hooks** to rotate:
- "Predict the **entire** World Cup knockout bracket — R32 to the Final — in 2 minutes. Free."
- "One bracket. Score **all tournament**. Climb a live leaderboard."
- "Call the champion (worth **12 points**) — and keep every point even if your pick crashes out."
- "**No sign-up wall** — drop your email, grab the code, you're in."

### X / Twitter (≤280 chars)
> 🏆 The World Cup knockouts are here. Predict the **whole bracket** — Round of 32 to the Final —
> in 2 minutes, free. Score points every round, climb the live leaderboard. Locks Sun 7pm UTC ⏳
> 👉 tribepicks.com/bracket #WorldCup2026

> Think you can call the champion? It's worth 12 pts on TribePicks 🏆 Build your World Cup bracket
> free, no sign-up wall. The board locks at the first knockout kick-off — Sun 28 June. 👉 tribepicks.com/bracket

### Instagram / Facebook (caption)
> 🌍🏆 **World Cup 2026 — Bracket Challenge is LIVE.**
> Predict every knockout winner from the Round of 32 to the Final + the 3rd-place play-off.
> ⚽ 2 minutes to build · Free to play · Live leaderboard · 80 points up for grabs
> Your champion pick alone is worth 12 points — and if they crash out, you keep everything you've banked.
> ⏳ Locks Sunday 28 June, the moment the knockouts kick off.
> 👉 Link in bio: tribepicks.com/bracket
> #WorldCup2026 #FIFAWorldCup #BracketChallenge #Footy #Soccer

### LinkedIn (for the sponsor / B2B angle)
> The World Cup knockouts are the most-watched fortnight in sport — and a brilliant moment for
> brands to engage staff and customers.
> On TribePicks, you can **sponsor a Bracket Challenge**: players predict the knockout bracket on
> a leaderboard carrying *your* brand, you put up a simple prize, and you get an engaged, returning
> audience through every match. Run it internally for the team or externally for customers.
> We build the whole thing — you just pick the prize. DM me or see tribepicks.com/sponsor.

### WhatsApp (for comp admins / group shares)
> Oi 👋 the World Cup knockouts start Sunday — get your **Bracket Challenge** in!
> Pick every winner from the Round of 32 to the Final, free, takes 2 mins. We've got a live
> leaderboard for bragging rights 🏆 Locks at kick-off Sun 7pm UTC. 👉 tribepicks.com/bracket

### Hashtags
`#WorldCup2026` `#FIFAWorldCup` `#BracketChallenge` `#Soccer` `#Footy` `#Football` `#Tipping`

### Visual / content ideas
- Screen-recording of building a bracket in ~20s (R32 → 🏆) — shows how fast/easy it is.
- The scoring table as a clean graphic ("80 points up for grabs").
- A live leaderboard screenshot with a "could be you" overlay.
- Countdown post: "Brackets lock in 48h ⏳".
- "Keep your points even if your champion crashes out" — a surprising, share-worthy rule.

### Objection-handling (for replies/comments)
- *"Do I need an account?"* → No wall — drop your email, enter the 6-digit code, you're in.
- *"What if my champion loses?"* → You keep every point already earned; only future picks miss out.
- *"Is it free?"* → Yes. Global challenge is free; sponsor challenges are free to enter too.
- *"Penalty shootouts?"* → You're picking who advances, so the shootout winner is the right pick.
- *"Can I change my picks?"* → Yes, freely until the first knockout kick-off (Sun 28 June, 7pm UTC).

---

## 11. Pointers into the codebase (for Cowork)

- Explainer page (canonical copy): `src/app/bracket/how-it-works/page.tsx`
- Bracket builder + hub: `src/app/bracket/page.tsx`
- Challenge resolution / Global auto-entry: `src/lib/bracket/challenge.ts` (`ensureGlobalEntry`, `listBracketChallenges`)
- Scoring: `src/lib/bracket-scoring.ts`
- Guest entry funnel: `src/app/api/bracket/guest-enter/route.ts`, `src/components/game/BracketGuestEntryModal.tsx`,
  `src/lib/bracket/establish-session.ts` (email-code → auto account + auto sign-in)
- Leaderboard view: `src/components/game/BracketLeaderboardView.tsx`
- Data: `challenges` (type='bracket'), `bracket_entries`, `bracket_picks`; migrations 097–121.
