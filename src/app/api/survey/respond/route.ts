import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const DEFAULT_SURVEY = 'wc2026_pulse'

// Resolve the responding user: an email invite token (→ user, opaque) or the
// signed-in session user (in-app pulse). Returns { userId, source } or null.
async function resolveResponder(admin: any, token: string | null): Promise<{ userId: string; survey: string; source: 'email' | 'in_app'; token?: string } | null> {
  if (token) {
    const { data } = await (admin.from('nps_invites') as any)
      .select('user_id, survey_key').eq('token', token).maybeSingle()
    if (!data?.user_id) return null
    return { userId: data.user_id, survey: data.survey_key, source: 'email', token }
  }
  const user = await getSessionUser().catch(() => null)
  if (!user) return null
  return { userId: user.id, survey: DEFAULT_SURVEY, source: 'in_app' }
}

// GET /api/survey/respond?survey= — has the signed-in user already responded?
// Powers the in-app pulse gate (don't nag people who've answered).
export async function GET(request: NextRequest) {
  const user = await getSessionUser().catch(() => null)
  if (!user) return NextResponse.json({ responded: false, logged_in: false })
  const survey = new URL(request.url).searchParams.get('survey') || DEFAULT_SURVEY
  const admin = createAdminClient()
  const { data } = await (admin.from('nps_responses') as any)
    .select('score').eq('user_id', user.id).eq('survey_key', survey).maybeSingle()
  return NextResponse.json({ responded: !!data, logged_in: true })
}

// POST /api/survey/respond — record a score and/or comment.
// Body: { token?, score?: 0–10, comment?, survey? }. Score and comment can arrive
// in separate calls (email: score from the link first, then comment).
export async function POST(request: NextRequest) {
  const admin = createAdminClient()
  const body  = await request.json().catch(() => ({} as any))

  const who = await resolveResponder(admin, typeof body.token === 'string' ? body.token : null)
  if (!who) return NextResponse.json({ error: 'Could not identify you — open the link from your email or sign in.' }, { status: 401 })

  const row: Record<string, any> = { user_id: who.userId, survey_key: who.survey, source: who.source, updated_at: new Date().toISOString() }

  if (body.score != null) {
    const score = Number(body.score)
    if (!Number.isInteger(score) || score < 0 || score > 10)
      return NextResponse.json({ error: 'Score must be 0–10.' }, { status: 422 })
    row.score = score
  }
  if (typeof body.comment === 'string') row.comment = body.comment.trim() || null

  // A first contact must carry a score (the row requires one). Comment-only is an
  // update to an existing response.
  if (row.score == null) {
    const { data: existing } = await (admin.from('nps_responses') as any)
      .select('id').eq('user_id', who.userId).eq('survey_key', who.survey).maybeSingle()
    if (!existing) return NextResponse.json({ error: 'Pick a score first.' }, { status: 400 })
  }

  const { error } = await (admin.from('nps_responses') as any).upsert(row, { onConflict: 'user_id,survey_key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (who.token) {
    await (admin.from('nps_invites') as any).update({ responded_at: new Date().toISOString() }).eq('token', who.token)
  }
  return NextResponse.json({ ok: true })
}
