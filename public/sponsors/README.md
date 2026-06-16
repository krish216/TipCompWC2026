# Sponsor banners

Drop a direct sponsor's banner image in this folder, then wire it up — no ad
network needed. Premium users never see sponsor banners; each renders with a
small "Sponsored" label.

## Image specs
- **Format:** WebP (best), or PNG / JPG.
- **Aspect:** wide banner — aim for ~**5:1** (e.g. **1000×200**). Slots render
  full-width (`w-full h-auto`), scaling to the column (~600px desktop, full-width
  mobile), so a wide image looks right on both.
- **Size:** keep under **~150 KB** to protect load time / Core Web Vitals.
- **Filename:** lowercase, no spaces — e.g. `acme.png`.

## Wire it up (3 steps)
1. Save the image here, e.g. `public/sponsors/acme.png`.
2. In `src/lib/sponsors.ts`, set the slot:
   ```ts
   'leaderboard-infeed': { image: '/sponsors/acme.png', href: 'https://acme.com', alt: 'Acme' },
   ```
   Available slots: `leaderboard-infeed` (after row 10 of the leaderboard),
   `predict-infeed` (between day 1 and day 2 on the predict page).
3. Commit & deploy. Set the slot back to `null` to remove the banner.
