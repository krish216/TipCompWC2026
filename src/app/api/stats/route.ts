import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/stats — public, no auth required
export async function GET() {
  try {
    const admin = createAdminClient()
    const [{ count: tipsters }, { count: comps }] = await Promise.all([
      admin.from('users').select('*', { count: 'exact', head: true }),
      admin.from('comps').select('*', { count: 'exact', head: true }),
    ])
    return NextResponse.json(
      { tipster_count: tipsters ?? 0, comp_count: comps ?? 0 },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return NextResponse.json({ tipster_count: 0, comp_count: 0 })
  }
}
