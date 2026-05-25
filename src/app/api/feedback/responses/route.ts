import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/feedback/responses — public; returns feedback items where show_response = true
export async function GET() {
  try {
    const admin = createAdminClient()
    const { data } = await (admin.from('feedback') as any)
      .select('id, category, message, admin_response, response_at')
      .eq('show_response', true)
      .not('admin_response', 'is', null)
      .order('response_at', { ascending: false })
      .limit(20)

    return NextResponse.json({ responses: data ?? [] })
  } catch {
    return NextResponse.json({ responses: [] })
  }
}
