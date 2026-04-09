import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// POST /api/org-admins/self-register
// Assigns a user to an org using the org's invite code.
// Regular join: assigns org membership only (no org admin role).
// The invite code is proof of authorisation to join.
export async function POST(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { org_id, invite_code } = await request.json()
  if (!org_id || !invite_code) {
    return NextResponse.json({ error: 'org_id and invite_code required' }, { status: 400 })
  }

  // Verify the invite code matches the org
  const { data: org } = await supabase
    .from('organisations')
    .select('id, invite_code, name, email_domain, min_age')
    .eq('id', org_id)
    .eq('invite_code', invite_code.toUpperCase())
    .neq('slug', 'public')
    .single()

  if (!org) return NextResponse.json({ error: 'Invalid organisation code' }, { status: 403 })

  // Check email domain restriction if set
  const orgEmailDomain = (org as any).email_domain ?? null
  if (orgEmailDomain) {
    const userEmail  = user.email ?? ''
    const userDomain = userEmail.split('@')[1]?.toLowerCase() ?? ''
    if (userDomain !== orgEmailDomain.toLowerCase()) {
      return NextResponse.json({
        error: `This organisation is restricted to ${orgEmailDomain} email addresses. Your email (${userEmail}) does not match.`
      }, { status: 403 })
    }
  }

  // Check minimum age requirement if set
  const minAge = (org as any).min_age ?? null
  if (minAge) {
    const { data: userData } = await supabase
      .from('users').select('date_of_birth').eq('id', user.id).single()
    const dob = (userData as any)?.date_of_birth ?? null
    if (!dob) {
      return NextResponse.json({
        error: `This organisation requires members to be at least ${minAge} years old. Please add your date of birth in Settings before joining.`
      }, { status: 403 })
    }
    const age = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000))
    if (age < minAge) {
      return NextResponse.json({
        error: `This organisation requires members to be at least ${minAge} years old.`
      }, { status: 403 })
    }
  }

  // Assign user to org as an ordinary member — no org admin role granted
  await (adminClient.from('users') as any)
    .update({ org_id }).eq('id', user.id)

  return NextResponse.json({ success: true, org_name: (org as any).name })
}
