import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'

const ALLOWED_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥']

// POST /api/chat/reactions — toggle a reaction (add if not present, remove if already reacted)
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { message_id, emoji } = await request.json().catch(() => ({}))
  if (!message_id || !emoji) return NextResponse.json({ error: 'message_id and emoji required' }, { status: 400 })
  if (!ALLOWED_EMOJIS.includes(emoji)) return NextResponse.json({ error: 'Invalid emoji' }, { status: 400 })

  // Verify message exists and user is a tribe member
  const { data: msg } = await (supabase.from('chat_messages') as any)
    .select('tribe_id').eq('id', message_id).single()
  if (!msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 })

  const [{ data: tmRow }, { data: userRow }] = await Promise.all([
    supabase.from('tribe_members').select('tribe_id').eq('user_id', user.id).eq('tribe_id', (msg as any).tribe_id).maybeSingle(),
    supabase.from('users').select('tribe_id').eq('id', user.id).single(),
  ])
  const isMember = !!(tmRow as any)?.tribe_id || (userRow as any)?.tribe_id === (msg as any).tribe_id
  if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Check if already reacted
  const { data: existing } = await (supabase.from('chat_reactions') as any)
    .select('message_id').eq('message_id', message_id).eq('user_id', user.id).eq('emoji', emoji).maybeSingle()

  if (existing) {
    await (supabase.from('chat_reactions') as any).delete()
      .eq('message_id', message_id).eq('user_id', user.id).eq('emoji', emoji)
    return NextResponse.json({ action: 'removed' })
  } else {
    await (supabase.from('chat_reactions') as any)
      .insert({ message_id, user_id: user.id, emoji })
    return NextResponse.json({ action: 'added' })
  }
}
