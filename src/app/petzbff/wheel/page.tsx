import type { Metadata } from 'next'
import PetzBffWheelClient from './WheelClient'

// PetzBFF trade-show prize wheel. Lives on TribePicks for the same reason as the quiz
// (Shopify's storefront captcha blocks custom lead-capture forms). The server owns a shared
// prize inventory and allocates atomically — see migration 183 and api/petzbff-wheel.
export const metadata: Metadata = {
  title: 'Spin to win · PetzBFF',
  description: 'Spin the PetzBFF wheel at the stand — every spin wins a prize.',
  alternates: { canonical: 'https://tribepicks.com/petzbff/wheel' },
  robots: { index: false, follow: false },   // a show-only page; keep it out of search
  openGraph: {
    title: 'Spin to win · PetzBFF',
    description: 'Every spin wins a prize. Come play at the PetzBFF stand.',
  },
}

export default function PetzBffWheelPage() {
  return <PetzBffWheelClient />
}
