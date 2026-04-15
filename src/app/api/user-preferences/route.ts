import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// GET /api/user-preferences
// Returns the user's stored tournament + comp selection
export async function GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('user_preferences')
    .select('tournament_id, comp_id, updated_at')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json({ data: data ?? null })
}

// PUT /api/user-preferences
// Upserts tournament and/or comp selection
export async function PUT(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { tournament_id, comp_id } = body

  // Build update payload — only include fields that were sent
  const payload: Record<string, any> = { user_id: user.id, updated_at: new Date().toISOString() }
  if (tournament_id !== undefined) payload.tournament_id = tournament_id ?? null
  if (comp_id       !== undefined) payload.comp_id       = comp_id ?? null

  const { error } = await supabase
    .from('user_preferences')
    .upsert(payload, { onConflict: 'user_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
