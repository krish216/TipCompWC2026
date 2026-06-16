import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// POST /api/predictions/lock { fixture_id }
// Irreversibly locks the user's prediction for one fixture. Requires an existing
// prediction. Idempotent — re-locking an already-locked prediction is a no-op.
// There is deliberately NO unlock endpoint: a locked prediction is final.
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { fixture_id } = await request.json().catch(() => ({}))
  if (!fixture_id) return NextResponse.json({ error: 'fixture_id required' }, { status: 400 })

  const admin = createAdminClient()

  const { data: pred } = await (admin.from('predictions') as any)
    .select('id, locked_at').eq('user_id', user.id).eq('fixture_id', fixture_id).maybeSingle()

  if (!pred) return NextResponse.json({ error: 'Make a prediction before locking it in.' }, { status: 400 })
  if ((pred as any).locked_at) return NextResponse.json({ ok: true, locked_at: (pred as any).locked_at })

  const locked_at = new Date().toISOString()
  const { error } = await (admin.from('predictions') as any).update({ locked_at }).eq('id', (pred as any).id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, locked_at })
}
