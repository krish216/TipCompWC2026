'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { PollItem, type Poll } from '@/components/game/PollItem'
import { Spinner } from '@/components/ui'

export function PollsClient({ topic, pollId }: { topic: string | null; pollId: string | null }) {
  const { session } = useSupabase()
  const [polls, setPolls] = useState<Poll[] | null>(null)

  useEffect(() => {
    if (!session) { setPolls([]); return }
    fetch('/api/polls').then(r => r.json())
      .then(d => {
        let list = (d?.polls ?? []) as Poll[]
        if (pollId)      list = list.filter(p => p.id === pollId)
        else if (topic)  list = list.filter(p => p.topic === topic)
        setPolls(list)
      })
      .catch(() => setPolls([]))
  }, [session, topic, pollId])

  const loading = polls === null && !!session

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-xl font-black text-gray-900">A couple of quick questions 👇</h1>
      <p className="text-sm text-gray-500 mt-1 mb-5">One tap each — your answers shape what we build next. Thanks for the two minutes.</p>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner className="w-7 h-7" /></div>
      ) : !session ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
          <p className="text-sm text-gray-600 mb-3">Sign in to answer.</p>
          <Link href="/login" className="inline-block px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700">Sign in →</Link>
        </div>
      ) : (polls && polls.length > 0) ? (
        <div className="space-y-3">
          {polls.map(p => <PollItem key={p.id} poll={p} />)}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
          No active questions for you right now — thanks for stopping by!
        </div>
      )}

      <div className="mt-7 text-center">
        <Link href="/" className="text-sm text-gray-400 hover:text-gray-600">← Back to TribePicks</Link>
      </div>
    </div>
  )
}
