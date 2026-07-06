import { redirect } from 'next/navigation'
import { getActiveTournament } from '@/lib/content/wc'

export const revalidate = 1800

// Bare /groups/[code] → the active tournament's scoped, canonical URL.
export default async function GroupRedirect({ params }: { params: { code: string } }) {
  const t = await getActiveTournament()
  redirect(t ? `/${t.slug}/groups/${params.code}` : '/')
}
