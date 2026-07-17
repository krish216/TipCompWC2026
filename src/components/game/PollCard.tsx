'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { PollItem, type Poll } from '@/components/game/PollItem'

// Homepage "quick poll" card. Shows the most recent active poll the signed-in user
// hasn't dismissed; vote inline (via PollItem), then see live results. Dismiss is per-poll.
export function PollCard({ className }: { className?: string }) {
  const { session } = useSupabase()
  const [poll, setPoll] = useState<Poll | null>(null)
  const [dismissed, setDismissed] = useState<string[]>([])

  useEffect(() => {
    try { setDismissed(JSON.parse(localStorage.getItem('dismissed_polls') || '[]')) } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (!session) { setPoll(null); return }
    fetch('/api/polls').then(r => r.json())
      .then(d => {
        const list = (d?.polls ?? []) as Poll[]
        setPoll(list.find(p => !dismissed.includes(p.id)) ?? null)
      })
      .catch(() => setPoll(null))
  }, [session, dismissed])

  if (!poll) return null

  const dismiss = () => {
    const next = [...dismissed, poll.id]
    setDismissed(next)
    try { localStorage.setItem('dismissed_polls', JSON.stringify(next.slice(-50))) } catch { /* ignore */ }
    setPoll(null)
  }

  return <PollItem key={poll.id} poll={poll} className={className} onDismiss={dismiss} />
}
