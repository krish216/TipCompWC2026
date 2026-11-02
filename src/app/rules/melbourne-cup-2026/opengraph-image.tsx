import { cupCard, CUP_CARD_SIZE } from '@/lib/og/cup-card'

export const runtime = 'nodejs'
export const size = CUP_CARD_SIZE
export const contentType = 'image/png'
export const alt = 'How a TribePicks Melbourne Cup sweep works'

export default function Image() {
  return cupCard({ headline: 'How the sweep', accent: 'works', sub: 'Tickets, the draw, scratchings, and who wins what' })
}
