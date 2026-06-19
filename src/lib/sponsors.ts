export type Sponsor = {
  image: string  // path under /public (e.g. '/sponsors/acme.png') or absolute URL
  href:  string  // click-through URL
  alt:   string  // brand / alt text
}

// Active direct-sponsor banners, keyed by AdSlot `slot`. To run a direct deal,
// set the value for a slot (no ad network needed) and deploy; set back to null
// to remove. Premium users never see sponsor banners.
export const SPONSORS: Record<string, Sponsor | null> = {
  'leaderboard-infeed': null,
  'predict-infeed':     null,
  // Bracket Challenge insert fallback. Normally driven by the active sponsor
  // campaign (Sponsor Campaigns module); this static entry only shows if no
  // bracket sponsor is configured. See BracketSponsorInsert.
  'bracket-infeed':     null,
}
