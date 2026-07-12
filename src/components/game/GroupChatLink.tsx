'use client'

import { useEffect, useState } from 'react'
import { clsx } from 'clsx'

// "Join the group chat" CTA for a comp. Self-gating: it asks the members-only endpoint,
// so on a public comp page a stranger simply sees nothing, while a member sees the link.
// Safe to drop onto public pages for that reason.
const STYLE: Record<string, { label: string; bg: string }> = {
  whatsapp: { label: 'Join the WhatsApp group', bg: 'bg-[#25D366] hover:bg-[#1ebe5b]' },
  telegram: { label: 'Join the Telegram group', bg: 'bg-[#2AABEE] hover:bg-[#1e97d4]' },
  discord:  { label: 'Join the Discord',        bg: 'bg-[#5865F2] hover:bg-[#4a56d6]' },
  chat:     { label: 'Join the group chat',     bg: 'bg-emerald-600 hover:bg-emerald-700' },
}

export function GroupChatLink({ compId, className }: { compId: string; className?: string }) {
  const [data, setData] = useState<{ url: string; platform: string } | null>(null)

  useEffect(() => {
    let alive = true
    fetch(`/api/comps/group-chat?comp_id=${compId}`)
      .then(r => r.json())
      .then(d => { if (alive && d.url) setData({ url: d.url, platform: d.platform ?? 'chat' }) })
      .catch(() => {})
    return () => { alive = false }
  }, [compId])

  if (!data) return null
  const s = STYLE[data.platform] ?? STYLE.chat

  return (
    <a href={data.url} target="_blank" rel="noopener noreferrer"
      className={clsx('inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-colors', s.bg, className)}>
      <span aria-hidden>💬</span> {s.label} →
    </a>
  )
}
