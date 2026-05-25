import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/feedback/responses — public; returns feedback items where show_response = true
export async function GET() {
  try {
    const admin = createAdminClient()
    const { data, error } = await (admin.from('feedback') as any)
      .select('id, category, message, admin_response, response_at')
      .eq('show_response', true)
      .not('admin_response', 'is', null)
      .order('response_at', { ascending: false })
      .limit(20)

    if (error) return NextResponse.json({ responses: [], error: error.message, code: error.code }, { headers: { 'Cache-Control': 'no-store' } })
    return NextResponse.json({ responses: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err: any) {
    return NextResponse.json({ responses: [], error: err?.message }, { headers: { 'Cache-Control': 'no-store' } })
  }
}
