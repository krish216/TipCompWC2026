import type { Metadata } from 'next'
import PetzBffQuizClient from './PetzBffQuizClient'

// PetzBFF is the founder's second business (petzbff.com.au, a Shopify store). The quiz
// lives here rather than on Shopify because Shopify's storefront will not let a custom
// form create a customer - it attaches its captcha token only to forms rendered by its
// own Liquid form tag, so every custom variant is rejected and the lead is lost silently.
// Hosting it here gives a real row per play (migration 182), the score, and a sent email.

export const metadata: Metadata = {
  title: 'The Dog Lovers Show Quiz · PetzBFF',
  description:
    'Ten questions about dogs, getting harder as you go. Every one you get right adds 3% to your PetzBFF discount. Bank it, or stake it on the next one.',
  alternates: { canonical: 'https://tribepicks.com/petzbff' },
  openGraph: {
    title: 'The Dog Lovers Show Quiz · PetzBFF',
    description: 'Bank it or stake it. Ten from ten is 30% off at PetzBFF.',
  },
}

export default function PetzBffPage() {
  return <PetzBffQuizClient />
}
