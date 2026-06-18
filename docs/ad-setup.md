# Ad setup — Google AdSense

Tracking the rollout of Google AdSense on TribePicks. Publisher ID: `pub-2245065746634535`
(env value uses the `ca-` prefix: `ca-pub-2245065746634535`).

The code is wired and **fully dormant** until the env vars below are set — nothing
shows in production until then.

---

## ✅ Done

**Code (in the repo):**
- [x] `AdSlot` renders responsive `<ins class="adsbygoogle">` per placement (`src/components/ui/AdSlot.tsx`)
- [x] AdSense loader script in the root layout, env-gated (`src/app/layout.tsx`)
- [x] `google-adsense-account` verification meta tag, env-gated (`src/app/layout.tsx`)
- [x] `/ads.txt` route derived from the publisher id (`src/app/ads.txt/route.ts`)
- [x] Privacy policy advertising/cookies clause + Google in third-party list (`src/app/privacy/page.tsx`)
- [x] Resolution order: direct sponsor → AdSense → nothing; **premium users never see ads**

**AdSense dashboard:**
- [x] Account created (`pub-2245065746634535`)
- [x] Site ownership verified (`tribepicks.com`)
- [x] Review requested
- [x] European CMP active (GDPR — EEA/UK/CH), 3-choice (Consent / Do not consent / Manage)
- [x] Auto ads = **OFF** (correct — we use manual units + premium gating)

---

## ⏳ Outstanding

### Now (don't wait for approval)
- [ ] **Set base env vars in Vercel** (Production) so the verification snippet + ads.txt are live:
  - `NEXT_PUBLIC_ADS_ENABLED=true`
  - `NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-2245065746634535`
  - then **redeploy**
- [ ] **Turn Auto optimize OFF** (Ads → By site → ✏️ edit `tribepicks.com`) — its experiments can auto-place ads outside our slots and bypass premium gating
- [ ] **US state regulations CMP** (Privacy & messaging → US state regulations → Create) — free, zero-code, recommended given heavy expected US traffic. *(Optional — not mandatory at our size.)*

### Verify the snippet is live
- [ ] `https://tribepicks.com/ads.txt` shows `google.com, pub-2245065746634535, DIRECT, f08c47fec0942fa0`
- [ ] Homepage source contains `<meta name="google-adsense-account" content="ca-pub-2245065746634535">`
- [ ] Homepage source loads `adsbygoogle.js`

### Waiting on Google
- [ ] **Account / site approval** (a few days – ~2 weeks). Units render blank until approved — that's normal. **Never click your own ads.**

### After approval
- [ ] **Create ad units** (Ads → By ad unit → Display ads → Responsive), one per placement:
  - "Leaderboard infeed", "Predict infeed", "Bracket infeed" → each gives a numeric slot id
- [ ] **Set per-slot env vars in Vercel** + redeploy:
  - `NEXT_PUBLIC_ADSENSE_SLOT_LEADERBOARD=<id>`   → `/leaderboard`
  - `NEXT_PUBLIC_ADSENSE_SLOT_PREDICT=<id>`       → `/predict`
  - `NEXT_PUBLIC_ADSENSE_SLOT_BRACKET=<id>`       → `/bracket/leaderboard` (only when no DB sponsor set)
- [ ] Confirm units render for a **non-premium** user on each page
- [ ] **Payments**: add a payment method + verify address (Google mails a PIN at the payout threshold)

### Optional / later
- [ ] Add more `AdSlot` placements for extra inventory (each needs its own env-mapped slot id in `AdSlot.tsx`)
- [ ] Add a "US residents" opt-out note to `/privacy` (Google's CMP already covers the mechanism)
- [ ] Reconsider the DB-driven sponsor model for `/leaderboard` and `/predict` if selling direct deals

---

## Env var reference

| Var | Value | Purpose |
|---|---|---|
| `NEXT_PUBLIC_ADS_ENABLED` | `true` | Master switch — loads the AdSense script |
| `NEXT_PUBLIC_ADSENSE_CLIENT` | `ca-pub-2245065746634535` | Publisher id (loader, meta tag, ins, ads.txt) |
| `NEXT_PUBLIC_ADSENSE_SLOT_LEADERBOARD` | *(ad-unit id)* | `leaderboard-infeed` slot |
| `NEXT_PUBLIC_ADSENSE_SLOT_PREDICT` | *(ad-unit id)* | `predict-infeed` slot |
| `NEXT_PUBLIC_ADSENSE_SLOT_BRACKET` | *(ad-unit id)* | `bracket-infeed` slot |

Any slot left unset stays dormant. Removing `NEXT_PUBLIC_ADS_ENABLED` (or setting it
to anything but `true`) turns all ads off site-wide.

---

## Notes
- **Premium = ad-free** is enforced in `AdSlot` (returns null for premium). Keep **Auto ads** and **Auto optimize** OFF so Google can't inject ads that bypass this.
- **EEA/UK/CH** users get the consent banner automatically (Google CMP) — no code.
- The **bracket** slot only shows AdSense when no admin sponsor is configured (sponsor co-brand takes priority).
- Publisher ID is public by design (appears in page source + ads.txt) — safe to commit.
