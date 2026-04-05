import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { z } from 'zod'

const PostSchema = z.object({
  tribe_id:   z.string().uuid(),
  content:    z.string().min(1).max(1000).trim(),
  fixture_id: z.number().int().positive().optional().nullable(),
})

// GET /api/chat?tribe_id=&fixture_id=&limit=60&before=
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const tribe_id   = searchParams.get('tribe_id')
  const fixture_id = searchParams.get('fixture_id')   // null = general chat
  const limit      = Math.min(parseInt(searchParams.get('limit') ?? '60'), 100)
  const before     = searchParams.get('before')

  if (!tribe_id) return NextResponse.json({ error: 'tribe_id required' }, { status: 400 })

  // Verify tribe membership
  const { data: me } = await supabase.from('users').select('tribe_id').eq('id', user.id).single()
  if ((me as any)?.tribe_id !== tribe_id) {
    return NextResponse.json({ error: 'Not a member of this tribe' }, { status: 403 })
  }

  let query = supabase
    .from('chat_messages')
    .select('id, content, created_at, user_id, fixture_id, users(display_name, avatar_url)')
    .eq('tribe_id', tribe_id)
    .order('created_at', { ascending: false })
    .limit(limit)

  // Filter by fixture topic — if fixture_id provided, show only that match's chat
  // If fixture_id is 'general' or absent, show messages where fixture_id is null
  if (fixture_id && fixture_id !== 'general') {
    query = query.eq('fixture_id', parseInt(fixture_id))
  } else {
    query = query.is('fixture_id', null)
  }

  if (before) query = query.lt('created_at', before)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Normalise user join shape
  const messages = (data ?? []).reverse().map((m: any) => {
    const usr = Array.isArray(m.users) ? m.users[0] : m.users
    return { ...m, user: usr ?? { display_name: 'Unknown', avatar_url: null } }
  })

  return NextResponse.json({ data: messages })
}

// POST /api/chat
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body   = await request.json().catch(() => null)
  const parsed = PostSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 422 })
  }

  const { tribe_id, content, fixture_id } = parsed.data

  // Verify membership
  const { data: me } = await supabase.from('users').select('tribe_id').eq('id', user.id).single()
  if ((me as any)?.tribe_id !== tribe_id) {
    return NextResponse.json({ error: 'Not a member of this tribe' }, { status: 403 })
  }

  const { data, error } = await (supabase
    .from('chat_messages') as any)
    .insert({ tribe_id, user_id: user.id, content, fixture_id: fixture_id ?? null })
    .select('id, content, created_at, user_id, fixture_id, users(display_name, avatar_url)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const raw = data as any
  const usr = Array.isArray(raw.users) ? raw.users[0] : raw.users
  return NextResponse.json({ data: { ...raw, user: usr ?? { display_name: 'Unknown', avatar_url: null } } }, { status: 201 })
}
