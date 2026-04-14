import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/organisations/domain?org_id= — get email domain restriction
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const orgId    = new URL(request.url).searchParams.get('org_id')
  if (!orgId) return NextResponse.json({ error: 'org_id required' }, { status: 400 })

  const { data } = await supabase
    .from('organisations').select('email_domain').eq('id', orgId).single()
  return NextResponse.json({ email_domain: (data as any)?.email_domain ?? null })
}

// POST /api/organisations/domain — set email domain (enterprise org admin only)
export async function POST(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { org_id, email_domain } = await request.json()
  if (!org_id) return NextResponse.json({ error: 'org_id required' }, { status: 400 })

  // Verify org admin
  const { data: isOrgAdmin } = await (adminClient.from('org_admins') as any)
    .select('user_id').eq('user_id', user.id).eq('org_id', org_id).single()
  if (!isOrgAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Verify enterprise tier
  const { data: sub } = await (adminClient.from('org_subscriptions') as any)
    .select('tier').eq('org_id', org_id).single()
  const tier = (sub as any)?.tier ?? 'trial'

  // Check monetisation toggle — if off, allow regardless of tier
  const { data: settings } = await supabase.from('app_settings').select('value').eq('key', 'monetisation_enabled').single()
  const monetisationOn = (settings as any)?.value === 'true'

  if (monetisationOn && tier !== 'enterprise') {
    return NextResponse.json({ error: 'Domain restriction is an Enterprise feature' }, { status: 403 })
  }

  // Validate domain format if provided
  const domain = email_domain?.trim().toLowerCase().replace(/^@/, '') || null
  if (domain && !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z]{2,})+$/.test(domain)) {
    return NextResponse.json({ error: 'Invalid domain format — use e.g. acmecorp.com' }, { status: 400 })
  }

  await (adminClient.from('organisations') as any)
    .update({ email_domain: domain }).eq('id', org_id)

  return NextResponse.json({ success: true })
}
