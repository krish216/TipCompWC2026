'use client'

import { useEffect, useState, type ReactNode } from 'react'

type PoolStat = { id: string; name: string; tickets: number; claimed: number; race_run: boolean }

// "Run the race" for a PRACTICE sweep, on the sweep card above every pool — one pretend race
// for the whole sweep, the same result in every pool, like the real Cup
// (/api/comps/:id/sweep/practice-race). Organisers only. Ready once at least one ticket is sold
// and every ticket sold, in every pool, has a horse. `onRaced` refreshes the pool below.
// `pills` — the sweep card's pool pills, laid out on the same line as the buttons.
export function PracticeRaceBar({ compId, pills, onRaced }: { compId: string; pills?: ReactNode; onRaced: () => void }) {
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

  if (!pools) return pills ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>{pills}</div> : null
  const raceRun = pools.some(p => p.race_run)
  const sold = pools.reduce((n, p) => n + p.tickets, 0)
  const toSpin = pools.filter(p => p.tickets > p.claimed)
  const ready = sold > 0 && toSpin.length === 0

  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {pills}
        <button onClick={() => race('POST')} disabled={racing || (!raceRun && !ready)}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-[11px] font-bold px-3 py-1 rounded-full">
          {racing ? 'They’re racing…' : raceRun ? '🔁 Run the race again' : '🏁 Run the race'}
        </button>
        {raceRun && (
          <button onClick={() => race('DELETE')} disabled={racing}
            className="text-[11px] font-bold text-violet-200 border border-violet-300/40 hover:bg-white/10 disabled:opacity-50 px-3 py-1 rounded-full">
            Reset race
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
