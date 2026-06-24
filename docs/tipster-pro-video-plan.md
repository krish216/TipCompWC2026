# Tipster Pro — Video plan

**Purpose:** the demo video is the single highest-leverage asset on `/pro/tipster` — people *get*
stats instantly when they see them move. This plans the video(s) needed to showcase the Pro Tipster
features and convert the ~1,200 player base at **$6.95**.

**Where it lands:** top of `/pro/tipster` ("See it in action"), wired via
`NEXT_PUBLIC_TIPSTER_VIDEO_ID` (click-to-play YouTube embed, already built). Also reusable on socials.

---

## 1. The set of videos (priority order)

| # | Video | Length | Where it's used | Priority |
|---|---|---|---|---|
| **A** | **Tipster Pro — hero demo** | **45–60s** | `/pro/tipster` embed + YouTube + pinned social post | **P0 — do first** |
| **B** | **Feature shorts** (3–4 clips) | 10–15s each | Reels / TikTok / Stories / paid ads / WhatsApp | P1 |
| **C** | **CompChief Pro — hero demo** | 45–60s | `/pro/comp-chief` (organiser tier) | P2 (after A ships) |

Start with **A**. It does 90% of the job and the shorts (B) can be cut down from the same footage.

---

## 2. Hero video (A) — storyboard

**Arc:** *you made your picks → but how good are you? → here's the proof → now beat your mates → flex it.*
Hook in the first 3 seconds. Assume **muted autoplay** on socials → burn in captions.

| Time | Screen / action | On-screen caption | Notes |
|---|---|---|---|
| 0:00–0:03 | Leaderboard scrolling, or a pick being locked on `/predict` | **"You made your picks."** | Fast, punchy hook |
| 0:03–0:06 | Cut to a question | **"But how good are you, *really*?"** | Tease |
| 0:06–0:14 | `/stats` Overview load — persona hero + headline trio (Top %, Hit-rate, Points) | **"Meet your Tipster DNA."** | Let the persona land (e.g. 🔮 The Oracle) |
| 0:14–0:20 | Scroll tendencies — chalk index, giant-killer, strength-adjusted | **"Are you a banker or a maverick?"** | Show 1–2 rows, don't dwell |
| 0:20–0:32 | **By-round** tab → scroll fixtures, the Field/Comp/Tribe bars; **tap a Comp bar** → who-picked-what modal | **"See how you tipped vs the field, your comp & your tribe."** | This is a core "wow" — show the tap-reveal |
| 0:32–0:38 | Tap the **lens filter** → "🔥 vs field", show the tagged games | **"The games you went against the crowd — and nailed."** | Filters in action |
| 0:38–0:46 | **Rivals** tab → rival scoreline "You 142 – 138", swing fixtures | **"Settle it. Head-to-head with your mates."** | The social hook |
| 0:46–0:53 | Overview → expand **share card** → the card with avatar + QR | **"Flex your card. Challenge anyone."** | End on the share card (the viral asset) |
| 0:53–0:60 | Brand end-card: logo + price + URL + QR | **"Tipster Pro · $6.95 · whole tournament · ad-free"** → **tribepicks.com** | Clear CTA + scannable QR |

**Voiceover:** optional. Captions + good music carry it; a short confident VO can lift it but isn't required.

---

## 3. Shot list (exact screens to capture)

Record these as clean, deliberate interactions (no fumbling, steady scroll):

1. `/predict` — lock a pick (the "before").
2. `/stats` **Overview** — full load: persona hero → headline trio → form/streak → tendencies → bonus card → best pick.
3. `/stats` **By round** — round tabs; scroll 3–4 fixture cards; **tap a Comp/Tribe bar** → who-picked-what modal (with avatars + ranks); close.
4. `/stats` **By round** — tap **lens filters** (All → 🔥 vs field → 🐐 underdog).
5. `/stats` **Rivals** — pick a rival; show scoreline + rounds won + a swing fixture.
6. `/stats` **Overview** — expand **📲 Share your tipster card** → the card.
7. (Optional) `/predict` tipsheet → the **🔒 "see who picked what" upsell** (shows the gate = reason to buy).

---

## 4. Feature shorts (B) — 10–15s each, cut from the same footage

One feature, one hook, vertical (9:16), caption-first. Good for ads/Reels:

- **"Who picked what?"** — the By-round bars + tap-reveal.
- **"Beat your mates"** — the Head-to-head scoreline + a swing fixture.
- **"Your tipster card"** — the share card building/appearing, ending on the QR.
- **"Banker or maverick?"** — persona + the vs-field / underdog tags.

---

## 5. CompChief Pro (C) — separate organiser video (P2)

Different audience (Comp Chiefs), different tier ($9.95). Beats: ⏰ auto-reminders (set-and-forget),
Insights/drop-off, email campaigns, payment tracking, branding. Same format, ~45–60s, embeds on
`/pro/comp-chief`.

---

## 6. Production notes

- **Capture:** real phone screen-recording (mobile-first app). Portrait **9:16** master.
- **Use a rich, real account** — NOT a mock/seed user (the `mockuser%`/`@tribepicks.dev` accounts are
  all 0-0 and look dead). Record on an engaged account with real picks, a tribe with active mates, and
  a bonus team, so every screen has believable numbers.
- **Share card asset:** for a guaranteed-clean card, the demo endpoint `/( /api/tipster/card?demo=1 )`
  renders a polished sample (no auth) — handy for thumbnails / the end-card.
- **Two output cuts:**
  - **16:9** for the `/pro/tipster` YouTube embed — frame the portrait recording in a phone mockup on
    an emerald background (don't letterbox raw).
  - **9:16** for social shorts.
- **Captions burned in** (most views are muted). Brand emerald + white; persona accent colours.
- **End card:** logo, "Tipster Pro · $6.95 · whole tournament · ad-free", `tribepicks.com`, and a **QR**
  (reuse the join/referral QR style from the share card).
- **Length discipline:** hero ≤ 60s; hook ≤ 3s; never linger on a screen > ~4s.
- **Music:** upbeat, rights-cleared (YouTube Audio Library / Epidemic).

---

## 7. Pre-record checklist

- [ ] Demo account has rich stats (≥10 scored picks, a real tribe with ≥2 active mates, a bonus team).
- [ ] The tournament/comp selected has comp + tribe data (so the By-round bars + Rivals populate).
- [ ] `fixture_pick_stats` is fresh (migration 129) so the Field bars show.
- [ ] Phone in light mode, full battery icon hidden / clean status bar.
- [ ] Script the exact tap sequence per shot above; do 2–3 takes of each.

---

## 8. Once filmed

1. Upload the 16:9 hero to YouTube (unlisted or public).
2. Set `NEXT_PUBLIC_TIPSTER_VIDEO_ID=<id>` in `.env.local` + Vercel → the "See it in action" section
   appears at the top of `/pro/tipster` automatically. (Or paste the link and I'll wire it.)
3. Post the shorts; pin the hero on socials; use shorts as ad creatives.
