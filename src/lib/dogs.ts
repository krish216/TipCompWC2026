// "Feed the doggies" cast + config. The dogs are TribePicks' mascots (real dog photos live in
// public/dogs/<slug>.jpg — drop them in to replace the emoji fallback). Feeding is a donation:
// it NEVER affects scoring or standings — it's for good luck, to keep TribePicks free, to fund
// what's next (EPL/NBA/Champions League), and a slice goes to dog rescues.

export interface Dog { slug: string; name: string; photo: string; blurb: string }

// The real TribePicks pack — the owner's own dogs. Photos live in public/dogs/. Order = "meet
// the pack" order. Feeding any of them is a donation and never affects scoring.
export const DOGS: Dog[] = [
  { slug: 'neve',   name: 'Neve',   photo: '/dogs/Neve%20Socceroos%20Fan.jpeg', blurb: 'The Queen — regal, poised, and a dyed-in-the-wool Socceroos fan. Expects the throne and the treats.' },
  { slug: 'maisie', name: 'Maisie', photo: '/dogs/Maisie.jpeg', blurb: 'Green-and-gold to the core. Wears the scarf, lives for match day.' },
  { slug: 'murphy', name: 'Murphy', photo: '/dogs/Murphy.jpeg', blurb: 'Big soulful eyes, bigger heart. Will emotionally blackmail you out of your last bone.' },
  { slug: 'archie', name: 'Archie', photo: '/dogs/Archie.jpeg', blurb: 'Shaggy golden optimist. Backs every team to win — including both in the same match.' },
  { slug: 'bear',   name: 'Bear',   photo: '/dogs/Bear.jpeg',   blurb: 'A gentle giant in glossy black. Looks like a bouncer, cries at penalty shootouts.' },
  { slug: 'cocoa',  name: 'Cocoa',  photo: '/dogs/Cocoa.jpeg',  blurb: 'Chocolate Lab elder, grey around the muzzle. Seen a few finals; unbothered by extra time.' },
  { slug: 'speedy', name: 'Speedy', photo: '/dogs/Speedy.jpeg', blurb: 'Jack Russell — all engine, no brakes. First to every ball and every biscuit.' },
  { slug: 'sasha',  name: 'Sasha',  photo: '/dogs/Sasha.jpeg',  blurb: 'Blue-grey and steely-eyed — looks like she’d argue an offside call, but softest heart in the pack.' },
  { slug: 'rosie',  name: 'Rosie',  photo: '/dogs/Rosie.jpeg',  blurb: 'Golden Cocker sweetheart. Could charm a treat out of a statue.' },
  { slug: 'ange',   name: 'Ange',   photo: '/dogs/Ange.jpeg',   blurb: 'Apricot curls, effortlessly dapper. The style icon of the pack.' },
]

export const dogBySlug = (slug?: string | null): Dog | null => DOGS.find(d => d.slug === slug) ?? null

// The bowls (AUD cents). Presets convert better than a blank field; custom still allowed.
export interface Bowl { key: string; label: string; emoji: string; cents: number }
export const BOWLS: Bowl[] = [
  { key: 'treat', label: 'Treat', emoji: '🦴', cents: 300 },
  { key: 'meal',  label: 'Meal',  emoji: '🍖', cents: 600 },
  { key: 'feast', label: 'Feast', emoji: '🍗', cents: 1200 },
]

// Feeder tiers by cumulative AUD cents fed — surfaced as a paw badge on the trophy cabinet.
export interface FeederTier { min: number; key: string; label: string; icon: string }
export const FEEDER_TIERS: FeederTier[] = [
  { min: 1,    key: 'friend', label: 'Doggie Friend', icon: '🐾' },
  { min: 2500, key: 'patron', label: 'Pack Patron',   icon: '🦴' },
  { min: 7500, key: 'topdog', label: 'Top Dog',       icon: '👑' },
]

export function feederTier(cents: number): FeederTier | null {
  let t: FeederTier | null = null
  for (const tier of FEEDER_TIERS) if (cents >= tier.min) t = tier
  return t
}

export const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`

// Community campaign goal for the "feed the pack" progress bar. Adjust freely.
export const FEED_CAMPAIGN = { goalCents: 100000, label: 'Fund what’s next (EPL)' }

// Charity split — a PUBLIC commitment: 15% of every feed is donated to the RSPCA. This must be
// actually remitted (keep receipts). null would revert to a soft "a slice goes to dog rescues".
export const FEED_CHARITY: { name: string; splitPct: number } | null = { name: 'the RSPCA (Pet Adoption Centre)', splitPct: 15 }
