import { redirect } from 'next/navigation'
import { getActiveTournament } from '@/lib/content/wc'

export const revalidate = 1800

// Bare /recaps → the active tournament's scoped recaps index.
export default async function RecapsRedirect() {
  const t = await getActiveTournament()
  redirect(t ? `/${t.slug}/recaps` : '/')
}
