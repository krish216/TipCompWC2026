'use client'

import { useEffect, useState } from 'react'

type PoolStat = { id: string; name: string; tickets: number; claimed: number; race_run: boolean }

// "Run the race" for a PRACTICE sweep, on the sweep card above every pool — one pretend race
// for the whole sweep, the same result in every pool, like the real Cup
// (/api/comps/:id/sweep/practice-race). Organisers only. Ready once at least one ticket is sold
// and every ticket sold, in every pool, has a horse. `onRaced` refreshes the pool below.
export function PracticeRaceBar({ compId, onRaced }: { compId: string; onRaced: () => void }) {
  const [pools, setPools] = useState<PoolStat[] | null>(null)
  const [racing, setRacing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const res = await fetch(`/api/comps/${compId}/sweep/pools`).then(r => r.json()).catch(() => null)
    if (res?.data) setPools(res.data)
  }
  useEffect(() => { load() }, [compId])   // eslint-disable-line react-hooks/exhaustive-deps

  async function race(method: 'POST' | 'DELETE') {
    setRacing(true); setError(null)
    const res = await fetch(`/api/comps/${compId}/sweep/practice-race`, { method }).then(r => r.json())
    setRacing(false)
    if (res.error) { setError(res.error); return }
    await load()
    onRaced()
  }

  if (!pools) return null
  const raceRun = pools.some(p => p.race_run)
  const sold = pools.reduce((n, p) => n + p.tickets, 0)
  const toSpin = pools.filter(p => p.tickets > p.claimed)
  const ready = sold > 0 && toSpin.length === 0

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => race('POST')} disabled={racing || (!raceRun && !ready)}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
          {racing ? 'They’re racing…' : raceRun ? '🔁 Run the race again' : '🏁 Run the race'}
        </button>
        {raceRun && (
          <button onClick={() => race('DELETE')} disabled={racing}
            className="text-xs font-bold text-violet-200 border border-violet-300/40 hover:bg-white/10 disabled:opacity-50 px-3 py-1.5 rounded-lg">
            Reset &amp; reopen the pools
          </button>
        )}
      </div>
      {!raceRun && !ready && (
        <p style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
          {sold === 0
            ? 'Practice race: opens once tickets are sold and drawn.'
            : `Practice race: opens once every ticket has a horse — ${toSpin.map(p => `${p.tickets - p.claimed} to spin in ${p.name}`).join(', ')} (tap Draw for them).`}
        </p>
      )}
      {error && <p style={{ marginTop: 6, fontSize: 11, color: '#fca5a5' }}>{error}</p>}
    </div>
  )
}
