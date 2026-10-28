import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase'
import { ProblemsQuiz } from './ProblemsQuiz'

export const revalidate = 900

// Shareable on its own (WhatsApp, socials). The URL, title and preview deliberately don't
// mention the Melbourne Cup — that's the punchline. Answering leads on to /melbourne-cup.
export const metadata: Metadata = {
  title: "What's the biggest problem facing Australia right now? | TribePicks",
  description: 'One question. Bet you get it wrong.',
  alternates: { canonical: 'https://tribepicks.com/quiz/australia' },
  openGraph: {
    title: "What's the biggest problem facing Australia right now?",
    description: 'One question. Bet you get it wrong.',
    url: 'https://tribepicks.com/quiz/australia',
    type: 'website',
  },
}

async function getRaceStart(): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const { data } = await (admin.from('tournaments') as any)
      .select('race_start_at').eq('slug', 'melbourne-cup-2026').maybeSingle()
    return (data as any)?.race_start_at ?? null
  } catch { return null }
}

export default async function AustraliaQuizPage({ searchParams }: { searchParams: { src?: string } }) {
  // Jump time drives when the quiz's "right answer" flips; fall back to 3pm AEDT Cup day.
  const raceStartAt = (await getRaceStart()) ?? '2026-11-03T04:00:00Z'
  // Campaign tag (e.g. ?src=stoneandchalk) — carried through to the sign-up as quiz-<tag>.
  const src = (searchParams.src ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30) || null

  return (
    <main className="max-w-md mx-auto px-4 py-10">
      <ProblemsQuiz raceStartAt={raceStartAt} src={src} />
    </main>
  )
}
