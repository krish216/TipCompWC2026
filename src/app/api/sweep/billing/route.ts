import { NextResponse } from 'next/server'
import { billingInfo } from '@/lib/sweep/billing'

export const dynamic = 'force-dynamic'

// GET /api/sweep/billing — public pool pricing, so the "Start your own sweep" form can show
// what extra pools cost before the organiser creates anything.
export async function GET() {
  return NextResponse.json(billingInfo())
}
