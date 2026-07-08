import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTournamentBySlug } from '@/lib/content/wc'
import { TablePredictorView } from '@/components/game/TablePredictorView'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { tournament: string } }): Promise<Metadata> {
  const t = await getTournamentBySlug(params.tournament)
  if (!t) return { title: 'Table Predictor | TribePicks' }
  return {
    title: `${t.name} — Top 5 & Bottom 3 Table Predictor | TribePicks`,
    description: `Predict the ${t.name} top 5 and bottom 3 at four checkpoints through the season. Free to play — join any quarter and climb the season leaderboard.`,
    alternates: { canonical: `https://tribepicks.com/${t.slug}/predictor` },
  }
}

export default async function PredictorPage({ params }: { params: { tournament: string } }) {
  const t = await getTournamentBySlug(params.tournament)
  if (!t) notFound()
  return <TablePredictorView slug={t.slug} />
}
