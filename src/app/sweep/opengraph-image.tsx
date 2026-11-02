import { cupCard, CUP_CARD_SIZE } from '@/lib/og/cup-card'

export const runtime = 'nodejs'
export const size = CUP_CARD_SIZE
export const contentType = 'image/png'
export const alt = 'Join a Melbourne Cup sweep on TribePicks'

// What a sweep's join link (/sweep?code=…) shows when an organiser shares it in Slack, Teams
// or a group chat. The sweep's own name is in the title (page.tsx generateMetadata).
export default function Image() {
  return cupCard({ headline: "You're invited to", accent: 'a Melbourne Cup sweep', sub: 'Grab a ticket, spin the wheel for your horse, cheer it home',
    chips: ['🎟️ Grab a ticket', '🎡 Spin for a horse', '🏆 Top 3 win'] })
}
