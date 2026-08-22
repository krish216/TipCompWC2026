'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Spinner } from '@/components/ui'
import { useSupabase } from '@/components/layout/SupabaseProvider'

interface Prize { id: string; label: string; value_cents: number; total: number; awarded: number; sort: number; scheduled: boolean }
interface Unlock { prize_id: string; unlock_at: string; claimed_by: string | null }
interface Lead { email: string; prize_label: string; source: string | null; created_at: string }
type Config = { show_starts_at: string; show_ends_at: string; active: boolean } | null

// datetime-local wants "YYYY-MM-DDTHH:mm" in LOCAL time; convert an ISO string to that.
const toLocalInput = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const fmt = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function WheelAdminPage() {
  const { session } = useSupabase()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [data, setData] = useState<{ config: Config; prizes: Prize[]; unlocks: Unlock[]; recent: Lead[]; entrants: number } | null>(null)
  const [starts, setStarts] = useState(''); const [ends, setEnds] = useState(''); const [active, setActive] = useState(false)
  const [saving, setSaving] = useState(false); const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!session) { setIsAdmin(false); return }
    fetch('/api/admin').then(r => r.json()).then(d => setIsAdmin(!!d.is_admin)).catch(() => setIsAdmin(false))
  }, [session])

  const load = () => fetch('/api/admin/petzbff-wheel').then(r => r.json()).then(d => {
    setData(d)
    if (d.config) { setStarts(toLocalInput(d.config.show_starts_at)); setEnds(toLocalInput(d.config.show_ends_at)); setActive(!!d.config.active) }
  }).catch(() => setData({ config: null, prizes: [], unlocks: [], recent: [], entrants: 0 }))

  useEffect(() => { if (isAdmin) load() }, [isAdmin])

  const save = async () => {
    if (!starts || !ends) { setMsg('Set both a start and end time.'); return }
    setSaving(true); setMsg('')
    const r = await fetch('/api/admin/petzbff-wheel', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showStartsAt: new Date(starts).toISOString(), showEndsAt: new Date(ends).toISOString(), active }),
    })
    const d = await r.json().catch(() => ({}))
    setSaving(false)
    if (!r.ok) { setMsg(d.error || 'Save failed'); return }
    setMsg(`Saved. ${d.unlocksScheduled} scarce-prize unlocks scheduled across the window.`)
    load()
  }

  if (isAdmin === false) return <main className="max-w-2xl mx-auto px-4 py-16 text-center text-sm text-gray-500">Admins only.</main>
  if (isAdmin === null || data === null) return <main className="flex justify-center py-24"><Spinner className="h-7 w-7" /></main>

  const claimed = (id: string) => data.unlocks.filter(u => u.prize_id === id && u.claimed_by).length

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 pb-20">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-black text-gray-900">PetzBFF wheel</h1>
        <a href="/api/admin/petzbff-wheel?format=csv" className="text-sm font-semibold text-violet-600 hover:underline">Export entrants CSV →</a>
      </div>

      {/* Status */}
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${data.config?.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
          {data.config?.active ? '● Live' : '○ Closed'}
        </span>
        <span className="text-sm text-gray-600">{data.entrants} entrant{data.entrants === 1 ? '' : 's'}</span>
        {data.config && <span className="ml-auto text-xs text-gray-400">{fmt(data.config.show_starts_at)} → {fmt(data.config.show_ends_at)}</span>}
      </div>

      {/* Inventory */}
      <div className="mb-5 rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold text-gray-900">Inventory</h2>
        <div className="space-y-3">
          {data.prizes.filter(p => p.id !== 'none').map(p => {
            const remaining = p.total - p.awarded
            const pct = p.total > 0 ? Math.round((p.awarded / p.total) * 100) : 0
            return (
              <div key={p.id}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-semibold text-gray-800">{p.label}{p.scheduled && <span className="ml-2 text-[11px] font-bold uppercase tracking-wide text-amber-600">staggered</span>}</span>
                  <span className="tabular-nums text-gray-500">{p.awarded}/{p.total} won · {remaining} left{p.scheduled ? ` · ${claimed(p.id)} released` : ''}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-[#e08151]" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Config */}
      <div className="mb-5 rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold text-gray-900">Show window</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-gray-600">Opens
            <input type="datetime-local" value={starts} onChange={e => setStarts(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-xs font-semibold text-gray-600">Closes
            <input type="datetime-local" value={ends} onChange={e => setEnds(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
          Wheel is live (players can spin)
        </label>
        <button type="button" onClick={save} disabled={saving}
          className="mt-4 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save window & rebuild schedule'}
        </button>
        {msg && <p className="mt-2 text-[13px] font-semibold text-gray-600">{msg}</p>}
        <p className="mt-2 text-xs text-gray-400">Saving spreads the 3 mats + 6 containers evenly across the window. Set this before doors open; rescheduling resets only unclaimed unlock times.</p>
      </div>

      {/* Recent entrants */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold text-gray-900">Recent entrants</h2>
        {data.recent.length === 0 ? <p className="text-sm text-gray-400">No spins yet.</p> : (
          <ul className="divide-y divide-gray-100 text-sm">
            {data.recent.map((l, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 flex-1 truncate text-gray-800">{l.email}</span>
                <span className="shrink-0 text-gray-500">{l.prize_label}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-gray-400">{fmt(l.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
