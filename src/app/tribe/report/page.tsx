'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Spinner } from '@/components/ui'
import { WeeklyIntelligenceReport } from '@/components/comp-admin/WeeklyIntelligenceReport'

function Msg({ title, body }: { title: string; body: string }) {
  return (
    <div className="max-w-md mx-auto px-4 py-24 text-center">
      <h1 className="text-lg font-bold text-gray-900">{title}</h1>
      <p className="text-sm text-gray-500 mt-2">{body}</p>
    </div>
  )
}

function ReportInner() {
  const tribeId = useSearchParams().get('tribe_id')
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'unauth' | 'error'>('loading')
  const [data, setData]   = useState<any>(null)

  useEffect(() => {
    if (!tribeId) { setState('error'); return }
    fetch(`/api/tribes/report?tribe_id=${tribeId}`)
      .then(async r => {
        if (r.status === 401) return setState('unauth')
        if (r.status === 403) return setState('forbidden')
        if (!r.ok)            return setState('error')
        setData(await r.json()); setState('ok')
      })
      .catch(() => setState('error'))
  }, [tribeId])

  if (state === 'loading')   return <div className="flex justify-center py-24"><Spinner className="w-8 h-8" /></div>
  if (state === 'unauth')    return <Msg title="Sign in required" body="Log in to TribePicks to view this report." />
  if (state === 'forbidden') return <Msg title="Members only" body="This intelligence report is restricted to members of this tribe." />
  if (state === 'error' || !data) return <Msg title="Report unavailable" body="Couldn't load this report — the link may be invalid." />

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-3">
      <WeeklyIntelligenceReport data={data} />
      <p className="text-[10px] text-gray-400 text-center">A bit of fun — not an actual accusation. 🙂 · TribePicks</p>
    </div>
  )
}

export default function TribeReportPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-24"><Spinner className="w-8 h-8" /></div>}>
      <ReportInner />
    </Suspense>
  )
}
