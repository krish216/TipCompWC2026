import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/app-settings — public read of all settings
export async function GET() {
  const supabase = createServerSupabaseClient()
  const { data } = await supabase.from('app_settings').select('key, value')
  const settings: Record<string, string> = {}
  ;(data ?? []).forEach((r: any) => { settings[r.key] = r.value })
  return NextResponse.json({ data: settings })
}

// POST /api/app-settings — tournament admin only
export async function POST(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: isAdmin } = await adminClient.from('admin_users').select('user_id').eq('user_id', user.id).single()
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { key, value } = await request.json()
  if (!key || value === undefined) return NextResponse.json({ error: 'key and value required' }, { status: 400 })

  await (adminClient.from('app_settings') as any).upsert({ key, value, updated_at: new Date().toISOString() })
  return NextResponse.json({ success: true })
}
