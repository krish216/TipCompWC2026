import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

export const TIERS = {
  trial:      { label: 'Free Trial (14 days)', max_players: 50,  max_tribes: 1,  price_aud: 0    },
  starter:    { label: 'Starter',              max_players: 50,  max_tribes: 3,  price_aud: 29   },
  business:   { label: 'Business',             max_players: 200, max_tribes: -1, price_aud: 99   },
  enterprise: { label: 'Enterprise',           max_players: -1,  max_tribes: -1, price_aud: null },
  public:     { label: 'Public',               max_players: -1,  max_tribes: 1,  price_aud: 0    },
}

// GET /api/comp-subscriptions?comp_id= — get subscription for org
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const compId = new URL(request.url).searchParams.get('comp_id')
  if (!compId) return NextResponse.json({ error: 'comp_id required' }, { status: 400 })

  try {
    const { data, error } = await supabase
      .from('comp_subscriptions')
      .select('*')
      .eq('comp_id', compId)
      .maybeSingle()
    if (error) throw error
    return NextResponse.json({ data: data ?? { tier: 'trial' }, tiers: TIERS })
  } catch (e: any) {
    // Table may not exist or no subscription row — default to trial
    console.warn('[comp-subscriptions GET]', e?.message)
    return NextResponse.json({ data: { tier: 'trial' }, tiers: TIERS })
  }
}

// POST /api/comp-subscriptions — upgrade tier (tournament admin or org admin)
export async function POST(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { comp_id, tier, payment_ref } = await request.json()
  if (!comp_id || !tier) return NextResponse.json({ error: 'comp_id and tier required' }, { status: 400 })

  // Allow tournament admin or org admin
  const { data: isAdmin } = await adminClient.from('admin_users').select('user_id').eq('user_id', user.id).single()
  const { data: isCompAdmin } = await (adminClient.from('comp_admins') as any)
    .select('user_id').eq('user_id', user.id).eq('comp_id', comp_id).single()
  if (!isAdmin && !isCompAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const tierConfig = TIERS[tier as keyof typeof TIERS]
  if (!tierConfig) return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })

  const update: any = {
    tier,
    max_players: tierConfig.max_players,
    max_tribes:  tierConfig.max_tribes,
    paid_at:     tier !== 'trial' ? new Date().toISOString() : null,
    payment_ref: payment_ref || null,
    // Licence valid for 90 days from payment (covers tournament + buffer)
    expires_at:  tier !== 'trial' ? new Date(Date.now() + 90 * 86400000).toISOString() : null,
  }

  const { error } = await (adminClient.from('comp_subscriptions') as any)
    .upsert({ comp_id, ...update })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
