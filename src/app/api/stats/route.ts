import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/stats — public, no auth required
export async function GET() {
  try {
    const admin = createAdminClient()
    const { count } = await admin
      .from('users')
      .select('*', { count: 'exact', head: true })
    return NextResponse.json({ tipster_count: count ?? 0 })
  } catch {
    return NextResponse.json({ tipster_count: 0 })
  }
}
