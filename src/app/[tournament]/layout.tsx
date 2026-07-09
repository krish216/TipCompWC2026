import type { Metadata } from 'next'
import { getTournamentBySlug, tournamentHasResults } from '@/lib/content/wc'

// Search-index gate for every tournament-scoped content page (teams / groups / recaps /
// predictor). A tournament with no match data yet is nothing but templated shells, which
// reads as thin / low-value content — so noindex it (still followable) until it has real
// results. Page-level metadata (titles, OG) still applies; only robots is set here.
export async function generateMetadata({ params }: { params: { tournament: string } }): Promise<Metadata> {
  const t = await getTournamentBySlug(params.tournament)
  const ready = t ? await tournamentHasResults(t.id) : false
  return ready ? {} : { robots: { index: false, follow: true } }
}

export default function TournamentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
