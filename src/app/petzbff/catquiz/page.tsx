import type { Metadata } from 'next'
import PetzBffQuizClient from '@/components/petzbff/PetzBffQuizClient'

// Cat sibling of /petzbff/quiz. Same engine, capture pipeline, discount codes and 3-play cap
// (the cap is scoped per species, so dog and cat plays are counted separately) — only the
// question bank and copy differ. Leads land in petzbff_promo with quiz = 'cat'.

export const metadata: Metadata = {
  title: 'The Cat Quiz · PetzBFF',
  description:
    'Ten questions about cats, getting harder as you go. Every one you get right adds 3% to your PetzBFF discount. Bank it, or stake it on the next one.',
  alternates: { canonical: 'https://tribepicks.com/petzbff/catquiz' },
  openGraph: {
    title: 'The Cat Quiz · PetzBFF',
    description: 'Bank it or stake it. Ten from ten is 30% off at PetzBFF.',
  },
}

export default function PetzBffCatQuizPage() {
  return <PetzBffQuizClient config={{
    quiz: 'cat',
    title: 'The Cat Quiz',
    intro: 'Ten questions about cats, getting harder as you go. Every one you get right adds 3% to your ' +
      'discount. Then you choose: bank what you are holding, or stake it on the next question. Get one ' +
      'wrong and you are back to 3%. Hold your nerve all ten and it is 30% off.',
  }} />
}
