'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import toast from 'react-hot-toast'
import type { ChatMessage } from '@/types'

const PAGE_SIZE = 50

export function useTribeChat(tribeId: string | null) {
  const { supabase, session } = useSupabase()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  // ── Load message history ────────────────────────────────────
  useEffect(() => {
    if (!tribeId || !session) return
    setLoading(true)

    supabase
      .from('chat_messages')
      .select(`
        id, content, created_at,
        users!inner(display_name, avatar_url)
      `)
      .eq('tribe_id', tribeId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
      .then(({ data, error }) => {
        if (error) { toast.error('Failed to load chat'); return }
        setMessages((data ?? []).reverse() as unknown as ChatMessage[])
        setLoading(false)
        scrollToBottom()
      })
  }, [tribeId, session])

  // ── Realtime subscription ────────────────────────────────────
  useEffect(() => {
    if (!tribeId || !session) return

    const channel = supabase
      .channel(`tribe-chat-${tribeId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `tribe_id=eq.${tribeId}`,
        },
        async payload => {
          // Fetch the full row with user join since payload won't have it
          const { data } = await supabase
            .from('chat_messages')
            .select('id, content, created_at, user_id, users!inner(display_name, avatar_url)')
            .eq('id', payload.new.id)
            .single()

          if (data) {
            setMessages(prev => [...prev, data as unknown as ChatMessage])
            scrollToBottom()
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase, tribeId, session])

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }, [])

  // ── Send a message ──────────────────────────────────────────
  const sendMessage = useCallback(async (content: string) => {
    if (!tribeId || !session || !content.trim()) return
    setSending(true)

    const { error } = await (supabase.from('chat_messages') as any)
      .insert({
        tribe_id: tribeId,
        user_id: session.user.id,
        content: content.trim(),
      })

    setSending(false)
    if (error) {
      toast.error('Failed to send message')
    }
    // Message will arrive via realtime subscription
  }, [supabase, tribeId, session])

  return { messages, loading, sending, sendMessage, bottomRef }
}
