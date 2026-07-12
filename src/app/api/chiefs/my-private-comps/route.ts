import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/chiefs/my-private-comps
// STRICTLY owner-only: returns the authenticated user's OWN comps that aren't publicly
// listed on their profile (private, or open-but-not-discoverable) — never anyone else's,
// so no private comp name can leak. Powers the owner-only "your private comps" fold.
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ comps: [] })

  const admin = createAdminClient()
  const { data } = await (admin.from('comps') as any)
    .select('id, name, visibility, is_discoverable, featured')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })

  const comps = ((data ?? []) as any[])
    // Not shown by default = anything that isn't open + discoverable.
    .filter(c => !(c.visibility === 'open' && c.is_discoverable))
    .map(c => ({ id: c.id, name: c.name, featured: !!c.featured, private: c.visibility === 'private' }))

  return NextResponse.json({ comps })
}
