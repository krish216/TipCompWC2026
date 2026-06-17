import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
// Also opt every fetch in this route out of Next's Data Cache. Without this,
// supabase-js's internal PostgREST fetch gets cached (this route has no query
// params → one frozen cache key), so newly published responses never appear
// even though the handler runs fresh. force-dynamic alone doesn't cover it here.
export const fetchCache = 'force-no-store'
export const revalidate = 0

// GET /api/feedback/responses — public; returns feedback items where show_response = true
export async function GET() {
  try {
    const admin = createAdminClient()
    const run = (cols: string) => (admin.from('feedback') as any)
      .select(cols).not('admin_response', 'is', null)
      .order('response_at', { ascending: false }).limit(100)

    // Try with helpful_count (migration 118); fall back if the column isn't there yet.
    let { data, error } = await run('id, category, message, admin_response, response_at, show_response, helpful_count')
    if (error) ({ data, error } = await run('id, category, message, admin_response, response_at, show_response'))

    if (error) return NextResponse.json({ responses: [], error: error.message, code: error.code }, { headers: { 'Cache-Control': 'no-store' } })

    const responses = (data ?? []).filter((r: any) => r.show_response === true)
    return NextResponse.json({ responses }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err: any) {
    return NextResponse.json({ responses: [], error: err?.message }, { headers: { 'Cache-Control': 'no-store' } })
  }
}

// POST /api/feedback/responses — register a "👍 Helpful" on a published response.
// Public + lightweight: increments helpful_count. Repeat-vote prevention is
// client-side (localStorage); this is a soft signal, not a hardened tally.
export async function POST(request: NextRequest) {
  try {
    const { id } = await request.json().catch(() => ({} as any))
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const admin = createAdminClient()
    const { data: row } = await (admin.from('feedback') as any)
      .select('helpful_count, show_response, admin_response').eq('id', id).maybeSingle()
    if (!row || (row as any).show_response !== true || !(row as any).admin_response) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const next = (Number((row as any).helpful_count) || 0) + 1
    await (admin.from('feedback') as any).update({ helpful_count: next }).eq('id', id)
    return NextResponse.json({ ok: true, helpful_count: next }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 })
  }
}
