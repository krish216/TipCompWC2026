import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/comp-invitations/pending
// Returns all pending (not yet joined) comp invitations for the current user's email.
// Used on the home page and first-login onboarding to surface one-tap join cards.
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Use the email stored in the users table (most reliable source)
  const { data: userRow } = await admin
    .from('users').select('email').eq('id', user.id).single()
  const email = (userRow as any)?.email ?? user.email
  if (!email) return NextResponse.json({ data: [] })

  // Pending invitations — joined_at IS NULL means not yet accepted
  const { data: invRows } = await (admin.from('comp_invitations') as any)
    .select('id, comp_id, invited_at')
    .ilike('email', email)
    .is('joined_at', null)

  if (!invRows?.length) return NextResponse.json({ data: [] })

  // Fetch comp details in a single query
  const compIds = (invRows as any[]).map((r: any) => r.comp_id)
  const { data: comps } = await (admin.from('comps') as any)
    .select('id, name, logo_url, invite_code')
    .in('id', compIds)

  const compMap: Record<string, any> = {}
  ;(comps ?? []).forEach((c: any) => { compMap[c.id] = c })

  const data = (invRows as any[])
    .map((row: any) => {
      const comp = compMap[row.comp_id]
      if (!comp?.invite_code) return null
      return {
        invitation_id: row.id,
        comp_id:       comp.id,
        comp_name:     comp.name,
        comp_logo_url: comp.logo_url ?? null,
        invite_code:   comp.invite_code,
        invited_at:    row.invited_at,
      }
    })
    .filter(Boolean)

  return NextResponse.json({ data })
}
