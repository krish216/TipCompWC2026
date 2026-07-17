import type { Metadata } from 'next'
import FaqContent from './FaqContent'
import { FAQS } from './faqs'
import { JsonLd } from '@/components/seo/JsonLd'
import { faqJsonLd, nodeToText } from '@/lib/seo'

// Server wrapper so the FAQ can export SEO metadata (a 'use client' page can't). The
// interactive accordion lives in <FaqContent> — its text is still server-rendered into
// the initial HTML, so it's fully crawlable.
export const metadata: Metadata = {
  title: 'TribePicks FAQ — free football prediction game, brackets & comps',
  description: 'Answers on TribePicks: how the free bracket and tipping game works, joining and running comps, challenges and prizes, and Pro. A free-to-play prediction game — no real-money betting.',
  alternates: { canonical: 'https://tribepicks.com/faq' },
}

// Flatten every category's Q&A (answers are authored as JSX → nodeToText) into FAQPage schema.
const faqItems = FAQS.flatMap(cat => cat.items.map(it => ({ q: it.q, a: nodeToText(it.a).replace(/\s+/g, ' ').trim() })))

export default function FAQPage() {
  return (
    <>
      <JsonLd data={faqJsonLd(faqItems)} />
      <FaqContent />
    </>
  )
}
