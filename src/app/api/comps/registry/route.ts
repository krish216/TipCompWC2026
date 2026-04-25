import { NextResponse } from 'next/server'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/organisations/registry — tournament admin only, full list with contact details
export async function GET() {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: isAdmin } = await adminClient
    .from('admin_users').select('user_id').eq('user_id', user.id).single()
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await (adminClient.from('organisations') as any)
    .select('id, name, slug, invite_code, logo_url, owner_name, owner_email, owner_phone, is_self_created, approved, created_at')
    .neq('slug', 'public')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: (data ?? []) as any[] })
}
