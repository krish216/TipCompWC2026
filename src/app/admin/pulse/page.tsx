'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Spinner, Card } from '@/components/ui'
import { useSupabase } from '@/components/layout/SupabaseProvider'

interface Summary { total: number; promoters: number; passives: number; detractors: number; nps: number | null; avg: number | null; invited: number; email: number }
interface Resp { score: number; comment: string | null; source: string | null; created_at: string; display_name: string }

const scoreColor = (s: number) => s <= 6 ? 'bg-red-500' : s <= 8 ? 'bg-amber-500' : 'bg-emerald-600'

export default function PulseAdminPage() {
  const { session } = useSupabase()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [responses, setResponses] = useState<Resp[]>([])
  const [loading, setLoading] = useState(true)

  const [testEmail, setTestEmail] = useState('')
  const [list, setList] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [live, setLive] = useState(false)
  const [togglingLive, setTogglingLive] = useState(false)

  useEffect(() => {
    if (!session) { setIsAdmin(false); return }
    fetch('/api/admin').then(r => r.json()).then(d => setIsAdmin(!!d.is_admin)).catch(() => setIsAdmin(false))
  }, [session])

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/admin/survey').then(r => r.json())
      .then(d => { setSummary(d.summary ?? null); setResponses(d.responses ?? []); setLive(!!d.live) })
      .catch(() => toast.error('Failed to load results'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { if (isAdmin) load() }, [isAdmin, load])

  const toggleLive = async () => {
    const next = !live
    setTogglingLive(true)
    try {
      const res = await fetch('/api/admin/survey', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ live: next }) })
      if (res.ok) { setLive(next); toast.success(next ? 'In-app pulse is now LIVE for everyone' : 'In-app pulse turned off') }
      else toast.error('Could not update')
    } catch {
      toast.error('Network error')
    } finally {
      setTogglingLive(false)
    }
  }

  const send = async (body: any, label: string, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return
    setBusy(label)
    try {
      const res = await fetch('/api/admin/survey', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { toast.success(`Sent to ${d.sent} recipient${d.sent === 1 ? '' : 's'}`); load() }
      else toast.error(d.error ?? 'Send failed')
    } catch {
      toast.error('Network/timeout error — some may have sent.')
    } finally {
      setBusy(null)
    }
  }

  if (isAdmin === null) return <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
  if (!isAdmin) return <div className="max-w-md mx-auto py-20 text-center text-gray-500">Admin access required.</div>

  const emails = list.split(/[\n,;]+/).map(e => e.trim()).filter(e => /\S+@\S+\.\S+/.test(e))

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div>
        <Link href="/admin" className="text-sm text-emerald-600 hover:underline">← Admin</Link>
        <h1 className="text-2xl font-extrabold text-gray-900 mt-1">Customer Pulse (NPS)</h1>
        <p className="text-sm text-gray-500">Send a one-tap “how are we doing?” email and track sentiment. Responses are attributed but confidential.</p>
      </div>

      {/* In-app pulse on/off */}
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900">In-app pulse {live ? <span className="text-emerald-600">· LIVE</span> : <span className="text-gray-400">· off</span>}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {live ? 'Showing to all signed-in users who haven’t responded.' : 'Hidden from users — only admins see it (preview).'} Admins always see it.
            </p>
          </div>
          <button onClick={toggleLive} disabled={togglingLive} aria-pressed={live}
            className={clsx('relative w-12 h-7 rounded-full transition-colors flex-shrink-0 disabled:opacity-50', live ? 'bg-emerald-600' : 'bg-gray-300')}>
            <span className={clsx('absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform', live ? 'translate-x-5' : 'translate-x-0.5')} />
          </button>
        </div>
      </Card>

      {/* Results */}
      <Card>
        {loading ? (
          <div className="flex justify-center py-8"><Spinner className="w-6 h-6" /></div>
        ) : !summary || summary.total === 0 ? (
          <p className="text-center text-sm text-gray-400 py-6">No responses yet.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-end justify-between flex-wrap gap-3">
              <div className="leading-none">
                <span className={clsx('text-5xl font-black', (summary.nps ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500')}>{summary.nps}</span>
                <span className="text-sm font-bold text-gray-400 ml-1">NPS</span>
              </div>
              <div className="text-right text-xs text-gray-500">
                <p><strong className="text-gray-900">{summary.total}</strong> responses · avg <strong className="text-gray-900">{summary.avg}</strong></p>
                <p>{summary.invited} emailed · {summary.invited ? Math.round((summary.email / summary.invited) * 100) : 0}% response rate <span className="text-gray-300">(email)</span></p>
              </div>
            </div>
            <div className="flex h-4 rounded-md overflow-hidden text-[9px] font-bold text-white">
              {summary.detractors > 0 && <div className="bg-red-500 flex items-center justify-center" style={{ width: `${(summary.detractors / summary.total) * 100}%` }}>{summary.detractors}</div>}
              {summary.passives > 0 && <div className="bg-amber-500 flex items-center justify-center" style={{ width: `${(summary.passives / summary.total) * 100}%` }}>{summary.passives}</div>}
              {summary.promoters > 0 && <div className="bg-emerald-600 flex items-center justify-center" style={{ width: `${(summary.promoters / summary.total) * 100}%` }}>{summary.promoters}</div>}
            </div>
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>🔴 Detractors {summary.detractors}</span><span>🟡 Passives {summary.passives}</span><span>🟢 Promoters {summary.promoters}</span>
            </div>

            {/* Comments */}
            <div className="divide-y divide-gray-100 border-t border-gray-100 pt-1">
              {responses.filter(r => r.comment).map((r, i) => (
                <div key={i} className="py-2.5 flex gap-3">
                  <span className={clsx('flex-shrink-0 w-7 h-7 rounded-md text-white text-xs font-bold flex items-center justify-center', scoreColor(r.score))}>{r.score}</span>
                  <div className="min-w-0">
                    <p className="text-sm text-gray-800">{r.comment}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{r.display_name} · {r.source} · {new Date(r.created_at).toLocaleDateString('en-AU')}</p>
                  </div>
                </div>
              ))}
              {responses.filter(r => r.comment).length === 0 && <p className="text-[11px] text-gray-400 py-2">No written comments yet.</p>}
            </div>
          </div>
        )}
      </Card>

      {/* Send */}
      <Card className="space-y-4">
        <h2 className="text-sm font-bold text-gray-900">Send the pulse email</h2>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">1 · Send yourself a test first</label>
          <div className="flex gap-2">
            <input value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="you@example.com"
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
            <button disabled={!!busy || !testEmail.trim()} onClick={() => send({ test_email: testEmail.trim() }, 'test')}
              className="px-4 py-2 rounded-lg bg-gray-800 text-white text-sm font-semibold hover:bg-gray-900 disabled:opacity-50 whitespace-nowrap">
              {busy === 'test' ? 'Sending…' : 'Send test'}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">2 · Or send to a specific list (one per line / comma-separated)</label>
          <textarea value={list} onChange={e => setList(e.target.value)} rows={3} placeholder={'alice@example.com\nbob@example.com'}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
          <button disabled={!!busy || !emails.length} onClick={() => send({ emails }, 'list', `Send the pulse to ${emails.length} address${emails.length === 1 ? '' : 'es'}?`)}
            className="mt-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
            {busy === 'list' ? 'Sending…' : `Send to ${emails.length} list recipient${emails.length === 1 ? '' : 's'}`}
          </button>
        </div>

        <div className="border-t border-gray-100 pt-3">
          <label className="block text-xs font-medium text-gray-500 mb-1">3 · Send to everyone</label>
          <button disabled={!!busy} onClick={() => send({ scope: 'all' }, 'all', 'Send the NPS pulse to ALL users with an email address? This emails your whole base.')}
            className="px-4 py-2 rounded-lg bg-red-50 text-red-600 text-sm font-semibold hover:bg-red-100 disabled:opacity-50">
            {busy === 'all' ? 'Sending…' : 'Send to all users'}
          </button>
          <p className="text-[11px] text-gray-400 mt-1.5">Test first. Each recipient gets a unique confidential link; re-sending reuses their existing link.</p>
        </div>
      </Card>
    </div>
  )
}
