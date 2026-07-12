import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { resolveCompChief } from '@/lib/comp-chief'

export const dynamic = 'force-dynamic'

// GET /api/comps/chief?comp_id=<id>
// Public — the Comp-Chief's display identity for one comp (name + avatar). Used by the
// post-join screen and the comp standings header to show "Run by [name]".
export async function GET(request: NextRequest) {
  const compId = new URL(request.url).searchParams.get('comp_id')
  if (!compId) return NextResponse.json({ error: 'comp_id required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: comp } = await (admin.from('comps') as any)
    .select('id, created_by, owner_name').eq('id', compId).maybeSingle()
  if (!comp) return NextResponse.json({ chief: null })

  const chief = await resolveCompChief(admin, comp)
  return NextResponse.json({ chief }, { headers: { 'Cache-Control': 'private, max-age=300' } })
}
