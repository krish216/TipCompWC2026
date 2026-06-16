import { NextResponse } from 'next/server'
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
    const { data, error } = await (admin.from('feedback') as any)
      .select('id, category, message, admin_response, response_at, show_response')
      .not('admin_response', 'is', null)
      .order('response_at', { ascending: false })
      .limit(100)

    if (error) return NextResponse.json({ responses: [], error: error.message, code: error.code }, { headers: { 'Cache-Control': 'no-store' } })

    const responses = (data ?? []).filter((r: any) => r.show_response === true)
    return NextResponse.json({ responses }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err: any) {
    return NextResponse.json({ responses: [], error: err?.message }, { headers: { 'Cache-Control': 'no-store' } })
  }
}
