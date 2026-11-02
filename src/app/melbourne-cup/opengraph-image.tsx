import { cupCard, CUP_CARD_SIZE } from '@/lib/og/cup-card'

export const runtime = 'nodejs'
export const size = CUP_CARD_SIZE
export const contentType = 'image/png'
export const alt = 'Melbourne Cup 2026 sweeps on TribePicks'

// The share card for /melbourne-cup and every page under it (race demo, sweep sheet, results,
// rules by state) — they'd otherwise fall back to the site-wide football card.
export default function Image() {
  return cupCard({ headline: 'Run your office', accent: 'Melbourne Cup sweep', sub: 'Every dollar goes back as prizes · TribePicks never touches the money' })
}
