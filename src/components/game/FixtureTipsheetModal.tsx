'use client'

import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { Avatar, Spinner } from '@/components/ui'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'
import { track } from '@vercel/analytics'

interface Pick {
  user_id: string; display_name: string; avatar_url: string | null
  home: number; away: number; outcome: 'H' | 'D' | 'A'; pen_winner: string | null; is_me: boolean
}
interface Data {
  fixture: { id: number; round: string; home: string; away: string; kickoff_utc: string }
  is_exact: boolean
  final?: boolean
  pro?: boolean
  locked_count: number
  total_members: number
  picks: Pick[]
  aggregate: { H: number; D: number; A: number; home_pct: number; draw_pct: number; away_pct: number }
}

const OUTCOME_CHIP: Record<'H' | 'D' | 'A', string> = {
  H: 'bg-emerald-100 text-emerald-700',
  D: 'bg-gray-100 text-gray-600',
  A: 'bg-sky-100 text-sky-700',
}

export function FixtureTipsheetModal({ fixtureId, tribeId, onClose }: { fixtureId: number; tribeId: string; onClose: () => void }) {
  const { flag } = useUserPrefs()
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading')
  const [data,  setData]  = useState<Data | null>(null)

  useEffect(() => {
    fetch(`/api/predictions/fixture-tipsheet?fixture_id=${fixtureId}&tribe_id=${tribeId}`)
      .then(async r => {
        if (r.status === 403) return setState('forbidden')
        if (!r.ok)            return setState('error')
        setData(await r.json()); setState('ok')
      })
      .catch(() => setState('error'))
  }, [fixtureId, tribeId])

  const pickValue = (p: Pick, d: Data) => {
    if (d.is_exact) return `${p.home}–${p.away}`
    if (p.outcome === 'H') return `${flag(d.fixture.home)} ${d.fixture.home}`
    if (p.outcome === 'A') return `${flag(d.fixture.away)} ${d.fixture.away}`
    return 'Draw'
  }
  const outcomeText: Record<'H' | 'D' | 'A', string> = data
    ? { H: data.fixture.home, D: 'Draw', A: data.fixture.away }
    : { H: 'H', D: 'D', A: 'A' }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:px-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <h3 className="text-sm font-bold text-gray-900">📋 Tribe tipsheet</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1" aria-label="Close">✕</button>
        </div>

        {state === 'loading'   && <div className="flex justify-center py-14"><Spinner className="w-6 h-6" /></div>}
        {state === 'forbidden' && <p className="px-4 py-12 text-center text-sm text-gray-500">Lock in your prediction to view the tipsheet.</p>}
        {state === 'error'     && <p className="px-4 py-12 text-center text-sm text-gray-500">Couldn&apos;t load the tipsheet.</p>}

        {state === 'ok' && data && (
          <>
            {/* Fixture + aggregate — pinned while the tipster list scrolls */}
            <div className="flex-shrink-0">
            {/* Fixture + lock count */}
            <div className="px-4 pt-3 pb-2 text-center">
              <p className="text-sm font-semibold text-gray-800">
                {flag(data.fixture.home)} {data.fixture.home} <span className="text-gray-300 font-normal">v</span> {data.fixture.away} {flag(data.fixture.away)}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {data.locked_count} of {data.total_members} {data.total_members === 1 ? 'member' : 'members'} {data.final ? 'tipped' : 'locked in'}
              </p>
            </div>

            {/* Aggregate %H / %D / %A */}
            {data.locked_count > 0 && (
              <div className="px-4 pb-3">
                <div className="flex h-6 rounded-lg overflow-hidden text-[10px] font-bold text-white">
                  {data.aggregate.home_pct > 0 && <div className="bg-emerald-500 flex items-center justify-center" style={{ width: `${data.aggregate.home_pct}%` }}>{data.aggregate.home_pct}%</div>}
                  {data.aggregate.draw_pct > 0 && <div className="bg-gray-400 flex items-center justify-center"    style={{ width: `${data.aggregate.draw_pct}%` }}>{data.aggregate.draw_pct}%</div>}
                  {data.aggregate.away_pct > 0 && <div className="bg-sky-500 flex items-center justify-center"      style={{ width: `${data.aggregate.away_pct}%` }}>{data.aggregate.away_pct}%</div>}
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-0.5">
                  <span>🏠 {data.fixture.home} {data.aggregate.home_pct}%</span>
                  <span>Draw {data.aggregate.draw_pct}%</span>
                  <span>{data.fixture.away} {data.aggregate.away_pct}% 🛫</span>
                </div>
              </div>
            )}
            </div>

            {/* Pro gate — free users get the bar above, but not the individual picks */}
            {data.pro === false ? (
              <div className="flex-1 min-h-0 relative px-2 py-2">
                {/* Blurred placeholder rows */}
                <div className="blur-[4px] opacity-50 space-y-2 pointer-events-none px-2">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="flex items-center gap-2.5 py-2">
                      <div className="w-7 h-7 rounded-full bg-gray-200 flex-shrink-0" />
                      <div className="flex-1 h-3 bg-gray-200 rounded" />
                      <div className="w-16 h-4 bg-gray-200 rounded" />
                    </div>
                  ))}
                </div>
                {/* Upsell overlay */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
                  <div className="text-2xl mb-1">🔒</div>
                  <p className="text-sm font-bold text-gray-900">See who picked what</p>
                  <p className="text-[11px] text-gray-500 mt-1 mb-3 max-w-[240px]">
                    {data.locked_count} of {data.total_members} tipped — unlock every tribe-mate’s pick, on every game, with Tipster Pro.
                  </p>
                  <a href="/pro/tipster" onClick={() => track('tipsheet_upsell_click')}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors">
                    Unlock Tipster Pro · $6.95 →
                  </a>
                </div>
              </div>
            ) : (
            <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2">
              {data.picks.length === 0 ? (
                <p className="px-2 py-10 text-center text-sm text-gray-400">
                  {data.final ? 'No one in your tribe tipped this match.' : 'No one else has locked in yet — you’re first! 🥇'}
                </p>
              ) : data.picks.map(p => (
                <div key={p.user_id} className={clsx('flex items-center gap-2.5 px-2 py-2 rounded-lg', p.is_me && 'bg-emerald-50/60')}>
                  <Avatar name={p.display_name} src={p.avatar_url} size="xs" className="flex-shrink-0" />
                  <span className="flex-1 text-sm text-gray-800 truncate">
                    {p.display_name}{p.is_me && <span className="text-emerald-600 font-semibold"> (you)</span>}
                  </span>
                  <span className="text-sm font-bold text-gray-900 whitespace-nowrap">{pickValue(p, data)}</span>
                  <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap', OUTCOME_CHIP[p.outcome])}>
                    {outcomeText[p.outcome]}
                  </span>
                </div>
              ))}
            </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
