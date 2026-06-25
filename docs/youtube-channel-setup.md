# TribePicks — YouTube channel setup guide

Step-by-step to stand up the **TribePicks** YouTube channel (host the `/pro/tipster` demo video +
future content). ~30 min, do once. Companion to the video plan ([tipster-pro-video-plan.md](./tipster-pro-video-plan.md) §8).

**Assets you already have:**
- `public/logo.png` — the globe logo → **avatar**.
- `public/Avatar.png` — stadium + mascot scene → great **banner** base.

---

## 1. Create the channel (as a Brand Account)
Do this so the channel is owned by "TribePicks", not your personal name — and is transferable later.
1. Sign in at **youtube.com** with the Google account you want to manage it from.
2. Profile picture (top-right) → **Settings** (gear) → **Add or manage your channel(s)** → **Create a channel**.
3. Enter the name **TribePicks** → **Create**. (This creates a Brand Account channel, separate from your personal one.)

## 2. Claim the handle + name
- **Customise channel** → **Branding / Basic info**.
- **Handle:** `@tribepicks` (grab it before someone else does → URL becomes `youtube.com/@tribepicks`).
- **Name:** `TribePicks`.

## 3. Avatar (the circle)
- Use **`public/logo.png`** (the globe), uploaded at **800×800** PNG.
- ⚠️ YouTube crops avatars to a **circle**, so the "*.com*" text at the bottom of the logo will clip.
  Two clean options:
  - Crop to **just the globe** (square) so it fills the circle nicely, **or**
  - Use it as-is and accept the wordmark trimming.

## 4. Banner (the wide header)
- Size: **2048×1152**. Keep all text/logo inside the centre **1235×338 "safe area"** — that's all that
  shows on phones.
- Use **`public/Avatar.png`** (stadium + mascot) as the background. In Canva/Figma: place it on a
  2048×1152 canvas, then add — in the safe area — the **TribePicks logo**, a tagline
  (**"World Cup tipping with your tribe"**) and **tribepicks.com**.

## 5. Description + links
- **Description:** *"TribePicks — pick the World Cup with your mates. Tips, tribes, live leaderboards and
  Tipster Pro stats. Play free at tribepicks.com."*
- **Links** (show on the channel header): Website → `https://www.tribepicks.com`, plus any socials.
- **Keywords** (Settings → Channel → Basic info): *world cup, tipping, predictions, sweepstake, footy tips*.

## 6. Verify + set defaults (one-time)
- **Settings → Channel → Verify** with your phone number → unlocks **custom thumbnails** and uploads >15 min.
- **Settings → Upload defaults:** default description template with the CTA link + UTM:
  `https://www.tribepicks.com/pro/tipster?utm_source=youtube`.

## 7. Ready to upload
When the hero video is done:
1. Upload it — **Unlisted** is fine to start (it still plays in the `/pro/tipster` embed).
2. Set a benefit-led title, description (hook → features → CTA link), and a **custom thumbnail**
   (base it on `/api/tipster/card?demo=1`).
3. Grab the **video ID** (the bit after `v=` in the URL).
4. Set `NEXT_PUBLIC_TIPSTER_VIDEO_ID=<id>` in `.env.local` + Vercel → the "See it in action" section
   appears on `/pro/tipster` automatically. (Or paste the link and I'll wire it.)

---

### Optional polish (ask if you want help)
- Resize `logo.png` → clean **800×800** square avatar (globe-centred, no clipping).
- Mock the **2048×1152 banner** layout (text/logo positions on the stadium image) so it drops into Canva.
