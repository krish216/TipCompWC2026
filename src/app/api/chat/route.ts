import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'
import { z } from 'zod'

const PostSchema = z.object({
  tribe_id:   z.string().uuid(),
  content:    z.string().min(1).max(1000).trim(),
  round_code: z.string().optional().nullable(),
})

// GET /api/chat?tribe_id=&round_code=&limit=60&before=
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const tribe_id   = searchParams.get('tribe_id')
  const round_code = searchParams.get('round_code')   // null = general chat
  const limit      = Math.min(parseInt(searchParams.get('limit') ?? '60'), 100)
  const before     = searchParams.get('before')

  if (!tribe_id) return NextResponse.json({ error: 'tribe_id required' }, { status: 400 })

  // Verify tribe membership
  const [{ data: tmRow }, { data: userRow }] = await Promise.all([
    supabase.from('tribe_members').select('tribe_id').eq('user_id', user.id).eq('tribe_id', tribe_id).maybeSingle(),
    supabase.from('users').select('tribe_id').eq('id', user.id).single(),
  ])
  const isMember = !!(tmRow as any)?.tribe_id || (userRow as any)?.tribe_id === tribe_id
  if (!isMember) return NextResponse.json({ error: 'Not a member of this tribe' }, { status: 403 })

  let query = (supabase
    .from('chat_messages') as any)
    .select('id, content, created_at, user_id, round_code, users(display_name, avatar_url)')
    .eq('tribe_id', tribe_id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (round_code && round_code !== 'general') {
    query = query.eq('round_code', round_code)
  } else {
    query = query.is('round_code', null)
  }

  if (before) query = query.lt('created_at', before)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const messageIds = (data ?? []).map((m: any) => m.id)
  let reactionsMap: Record<string, { emoji: string; count: number; users: string[] }[]> = {}

  if (messageIds.length > 0) {
    const { data: reactions } = await (supabase.from('chat_reactions') as any)
      .select('message_id, user_id, emoji')
      .in('message_id', messageIds)

    for (const r of (reactions ?? [])) {
      if (!reactionsMap[r.message_id]) reactionsMap[r.message_id] = []
      const existing = reactionsMap[r.message_id].find(x => x.emoji === r.emoji)
      if (existing) { existing.count++; existing.users.push(r.user_id) }
      else reactionsMap[r.message_id].push({ emoji: r.emoji, count: 1, users: [r.user_id] })
    }
  }

  const messages = (data ?? []).reverse().map((m: any) => {
    const usr = Array.isArray(m.users) ? m.users[0] : m.users
    return { ...m, user: usr ?? { display_name: 'Unknown', avatar_url: null }, reactions: reactionsMap[m.id] ?? [] }
  })

  return NextResponse.json({ data: messages })
}

// POST /api/chat
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body   = await request.json().catch(() => null)
  const parsed = PostSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 422 })

  const { tribe_id, content, round_code } = parsed.data

  // Verify membership
  const [{ data: tmRow2 }, { data: userRow2 }] = await Promise.all([
    supabase.from('tribe_members').select('tribe_id').eq('user_id', user.id).eq('tribe_id', tribe_id).maybeSingle(),
    supabase.from('users').select('tribe_id').eq('id', user.id).single(),
  ])
  const isMember2 = !!(tmRow2 as any)?.tribe_id || (userRow2 as any)?.tribe_id === tribe_id
  if (!isMember2) return NextResponse.json({ error: 'Not a member of this tribe' }, { status: 403 })

  const { data, error } = await (supabase
    .from('chat_messages') as any)
    .insert({ tribe_id, user_id: user.id, content, round_code: round_code ?? null })
    .select('id, content, created_at, user_id, round_code, users(display_name, avatar_url)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const raw = data as any
  const usr = Array.isArray(raw.users) ? raw.users[0] : raw.users
  return NextResponse.json({ data: { ...raw, user: usr ?? { display_name: 'Unknown', avatar_url: null }, reactions: [] } }, { status: 201 })
}
