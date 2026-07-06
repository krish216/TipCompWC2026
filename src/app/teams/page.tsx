import { redirect } from 'next/navigation'
import { getActiveTournament } from '@/lib/content/wc'

export const revalidate = 1800

// Content pages are tournament-scoped (/[slug]/teams). The bare /teams is a convenience
// that always points at the current tournament — a temporary redirect, since the active
// tournament changes over time (the canonical URL is /[slug]/teams).
export default async function TeamsRedirect() {
  const t = await getActiveTournament()
  redirect(t ? `/${t.slug}/teams` : '/')
}
