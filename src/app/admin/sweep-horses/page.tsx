'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Spinner } from '@/components/ui'

type Horse = { id: string; number: number; name: string; scratched: boolean; finish_position: number | null }

// Platform-admin-only screen for the ONE shared Melbourne Cup field — entered centrally,
// not per comp (see docs/plans/melbourne-cup-sweep-plan.md §4). The API routes
// (/api/admin/sweep-horses) do the real admin_users check; this page just renders
// whatever they allow and surfaces a 403 plainly if not.
export default function AdminSweepHorsesPage() {
  const [tournamentId, setTournamentId] = useState<string | null>(null)
  const [horses, setHorses] = useState<Horse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bulk, setBulk] = useState('')
  const [saving, setSaving] = useState(false)
  const [raceStartAt, setRaceStartAt] = useState('')     // datetime-local string, local browser time
  const [savingStart, setSavingStart] = useState(false)

  async function load() {
    setLoading(true); setError(null)
    const ctx = await fetch('/api/sweep/context').then(r => r.json())
    if (!ctx.tournament) { setError("Melbourne Cup tournament not found — has migration 188 been run?"); setLoading(false); return }
    setTournamentId(ctx.tournament.id)
    const res = await fetch(`/api/admin/sweep-horses?tournament_id=${ctx.tournament.id}`).then(r => r.json())
    if (res.error) { setError(res.error); setLoading(false); return }
    setHorses(res.data ?? [])
    setRaceStartAt(res.race_start_at ? toLocalInputValue(res.race_start_at) : '')
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function toLocalInputValue(iso: string): string {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  async function saveRaceStart() {
    if (!tournamentId) return
    setSavingStart(true); setError(null)
    const res = await fetch(`/api/admin/tournaments/${tournamentId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ race_start_at: raceStartAt ? new Date(raceStartAt).toISOString() : null }),
    }).then(r => r.json())
    setSavingStart(false)
    if (res.error) setError(res.error)
  }

  async function addBulk() {
    if (!tournamentId || !bulk.trim()) return
    const horsesToAdd = bulk.trim().split('\n').map(line => {
      const [number, ...rest] = line.split(',')
      return { number: Number(number.trim()), name: rest.join(',').trim() }
    }).filter(h => h.number && h.name)
    if (!horsesToAdd.length) return
    setSaving(true)
    const res = await fetch('/api/admin/sweep-horses', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournament_id: tournamentId, horses: horsesToAdd }),
    }).then(r => r.json())
    setSaving(false)
    if (res.error) { setError(res.error); return }
    setBulk('')
    load()
  }

  async function patch(id: string, update: Partial<Pick<Horse, 'scratched' | 'finish_position'>>) {
    setHorses(hs => hs.map(h => h.id === id ? { ...h, ...update } : h))
    const res = await fetch('/api/admin/sweep-horses', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...update }),
    }).then(r => r.json())
    if (res.error) setError(res.error)
  }

  async function scratchAll(value: boolean) {
    const ids = horses.filter(h => h.scratched !== value).map(h => h.id)
    if (!ids.length) return
    setHorses(hs => hs.map(h => ({ ...h, scratched: value })))
    const results = await Promise.all(ids.map(id =>
      fetch('/api/admin/sweep-horses', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, scratched: value }),
      }).then(r => r.json())
    ))
    const failed = results.find(r => r.error)
    if (failed) setError(failed.error)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner className="w-8 h-8" /></div>

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <Link href="/admin" className="text-xs font-bold text-gray-400 hover:text-gray-600 mb-3 inline-block">← Back to Tournament Admin</Link>
      <h1 className="text-xl font-black text-gray-900 mb-1">Melbourne Cup field — admin</h1>
      <p className="text-xs text-gray-500 mb-6">One shared field for every sweep pool. Scratchings and the result here update every tribe's podium automatically.</p>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-5">{error}</div>}

      <div className="border border-gray-200 rounded-2xl p-5 mb-6">
        <h2 className="font-bold text-gray-900 mb-2 text-sm">Race start</h2>
        <p className="text-xs text-gray-500 mb-2">Every sweep pool auto-locks (no more new picks, joins, or ticket requests) 30 minutes before this time. Leave blank to disable auto-lock.</p>
        <div className="flex gap-2">
          <input type="datetime-local" value={raceStartAt} onChange={e => setRaceStartAt(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <button onClick={saveRaceStart} disabled={savingStart}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-lg whitespace-nowrap">
            {savingStart ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="border border-gray-200 rounded-2xl p-5 mb-6">
        <h2 className="font-bold text-gray-900 mb-2 text-sm">Add/update the field</h2>
        <p className="text-xs text-gray-500 mb-2">One horse per line: <code>number, name</code></p>
        <textarea
          value={bulk} onChange={e => setBulk(e.target.value)}
          placeholder={'1, Media Package\n2, Vauban\n3, Buckaroo'}
          rows={6}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono mb-3"
        />
        <button onClick={addBulk} disabled={saving || !bulk.trim()}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-lg">
          {saving ? 'Saving…' : 'Save field →'}
        </button>
      </div>

      <div className="border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-900 text-sm">Field ({horses.length})</h2>
          {horses.length > 0 && (
            <div className="flex items-center gap-3 text-xs">
              <button onClick={() => scratchAll(true)} className="font-bold text-red-500 hover:underline">Scratch all</button>
              <button onClick={() => scratchAll(false)} className="font-bold text-emerald-600 hover:underline">Clear all scratches</button>
            </div>
          )}
        </div>
        <div className="divide-y divide-gray-100">
          {horses.map(h => (
            <div key={h.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-10 text-gray-400">#{h.number}</span>
              <span className={`flex-1 ${h.scratched ? 'line-through text-red-400' : 'text-gray-900'}`}>{h.name}</span>
              <label className="flex items-center gap-1 text-xs text-gray-500">
                <input type="checkbox" checked={h.scratched} onChange={e => patch(h.id, { scratched: e.target.checked })} />
                Scratched
              </label>
              <select
                value={h.finish_position ?? ''}
                onChange={e => patch(h.id, { finish_position: e.target.value ? Number(e.target.value) : null })}
                className="border border-gray-300 rounded px-2 py-1 text-xs"
              >
                <option value="">—</option>
                <option value="1">🥇 1st</option>
                <option value="2">🥈 2nd</option>
                <option value="3">🥉 3rd</option>
              </select>
            </div>
          ))}
          {horses.length === 0 && <p className="text-xs text-gray-400 py-2">No horses yet — add the field above.</p>}
        </div>
      </div>
    </main>
  )
}
