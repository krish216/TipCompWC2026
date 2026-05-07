import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/admin/email-templates?tournament_id=X&template_key=welcome
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tournament_id = searchParams.get('tournament_id')
  const template_key  = searchParams.get('template_key') ?? 'welcome'

  if (!tournament_id) return NextResponse.json({ error: 'tournament_id required' }, { status: 400 })

  const admin = createAdminClient()
  const { data } = await (admin.from('tournament_email_templates') as any)
    .select('subject, body, updated_at')
    .eq('tournament_id', tournament_id)
    .eq('template_key', template_key)
    .maybeSingle()

  return NextResponse.json({ data: data ?? null })
}

// PUT /api/admin/email-templates — save/update a template (platform admin only)
export async function PUT(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: isAdmin } = await admin
    .from('admin_users').select('user_id').eq('user_id', user.id).single()
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { tournament_id, template_key = 'welcome', subject, body } = await request.json()
  if (!tournament_id || !subject?.trim() || !body?.trim()) {
    return NextResponse.json({ error: 'tournament_id, subject and body required' }, { status: 400 })
  }

  const { error } = await (admin.from('tournament_email_templates') as any).upsert(
    {
      tournament_id,
      template_key,
      subject:    subject.trim(),
      body:       body.trim(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tournament_id,template_key' }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
