import type { Metadata } from 'next'
import FaqContent from './FaqContent'

// Server wrapper so the FAQ can export SEO metadata (a 'use client' page can't). The
// interactive accordion lives in <FaqContent> — its text is still server-rendered into
// the initial HTML, so it's fully crawlable.
export const metadata: Metadata = {
  title: 'TribePicks FAQ — free football prediction game, brackets & comps',
  description: 'Answers on TribePicks: how the free bracket and tipping game works, joining and running comps, challenges and prizes, and Pro. A free-to-play prediction game — no real-money betting.',
  alternates: { canonical: 'https://tribepicks.com/faq' },
}

export default function FAQPage() {
  return <FaqContent />
}
