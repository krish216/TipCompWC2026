'use client'

import React, { useCallback, useState } from 'react'
import { ShareButton } from '@/components/game/ShareCard'
import { clsx } from 'clsx'
import { PointsBadge } from '@/components/ui'
import type { Fixture, MatchScore, RoundId } from '@/types'
import { calcPoints, SCORING, FAV_TEAM_DOUBLE_ROUNDS, KNOCKOUT_ROUNDS, EXACT_SCORE_ROUNDS, OUTCOME_ROUNDS, getOutcome } from '@/types'
import { formatKickoff } from '@/lib/timezone'

const FLAGS: Record<string, string> = {
  Algeria:'🇩🇿', Argentina:'🇦🇷', Australia:'🇦🇺', Austria:'🇦🇹',
  Belgium:'🇧🇪', 'Bosnia and Herzegovina':'🇧🇦', Brazil:'🇧🇷',
  Canada:'🇨🇦', 'Cape Verde':'🇨🇻', Colombia:'🇨🇴', Croatia:'🇭🇷',
  Curacao:'🏝️', Czechia:'🇨🇿', 'DR Congo':'🇨🇩',
  Ecuador:'🇪🇨', Egypt:'🇪🇬', England:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', France:'🇫🇷',
  Germany:'🇩🇪', Ghana:'🇬🇭', Haiti:'🇭🇹', Iran:'🇮🇷',
  Iraq:'🇮🇶', 'Ivory Coast':'🇨🇮', Japan:'🇯🇵', Jordan:'🇯🇴',
  Mexico:'🇲🇽', Morocco:'🇲🇦', Netherlands:'🇳🇱', 'New Zealand':'🇳🇿',
  Norway:'🇳🇴', Panama:'🇵🇦', Paraguay:'🇵🇾', Portugal:'🇵🇹',
  Qatar:'🇶🇦', 'Saudi Arabia':'🇸🇦', Scotland:'🏴󠁧󠁢󠁳󠁣󠁴󠁿', Senegal:'🇸🇳',
  'South Africa':'🇿🇦', 'South Korea':'🇰🇷', Spain:'🇪🇸', Sweden:'🇸🇪',
  Switzerland:'🇨🇭', Tunisia:'🇹🇳', Turkey:'🇹🇷', Uruguay:'🇺🇾',
  USA:'🇺🇸', Uzbekistan:'🇺🇿',
}
const flag = (t: string) => FLAGS[t] ?? '🏳️'

interface Props {
  fixture: Fixture
  round: RoundId
  prediction?: { home: number; away: number; outcome?: 'H'|'D'|'A'|null; pen_winner?: string|null } | null
  result?: (MatchScore & { pen_winner?: string|null; result_outcome?: string|null }) | null
  locked?: boolean
  saving?: boolean
  isFavourite?: boolean
  challenge?: { prize: string; sponsor?: string|null; org_name?: string } | null
  timezone?: string
  onPredict:    (fixtureId: number, side: 'home'|'away', value: number) => void
  onOutcome?:   (fixtureId: number, outcome: 'H'|'D'|'A') => void
  onPenWinner?: (fixtureId: number, team: string) => void
}

export function MatchRow({
  fixture, round, prediction, result,
  locked = false, saving = false, isFavourite = false, challenge,
  timezone = 'UTC',
  onPredict, onOutcome, onPenWinner,
}: Props) {
  const [localHome, setLocalHome] = useState<string>(
    prediction && prediction.home >= 0 ? String(prediction.home) : ''
  )
  const [localAway, setLocalAway] = useState<string>(
    prediction && prediction.away >= 0 ? String(prediction.away) : ''
  )
  const prevPredRef = React.useRef(prediction)
  if (prevPredRef.current !== prediction) {
    prevPredRef.current = prediction
    if (prediction && prediction.home >= 0 && localHome === '') setLocalHome(String(prediction.home))
    if (prediction && prediction.away >= 0 && localAway === '') setLocalAway(String(prediction.away))
  }

  const isExactRound   = EXACT_SCORE_ROUNDS.includes(round)
  const isOutcomeRound = OUTCOME_ROUNDS.includes(round)
  const isKnockout     = KNOCKOUT_ROUNDS.includes(round)
  const selectedOutcome = (prediction as any)?.outcome ?? null
  const penWinner       = (prediction as any)?.pen_winner ?? null
  const isPredDraw      = isExactRound
    ? (prediction != null && prediction.home === prediction.away && prediction.home >= 0)
    : selectedOutcome === 'D'
  const showPenPick  = isKnockout && !result && !locked && isPredDraw
  const hasPred = isOutcomeRound
    ? selectedOutcome != null
    : prediction != null && prediction.home >= 0 && prediction.away >= 0

  const pts = hasPred ? calcPoints(prediction, result ?? null, round) : result ? 0 : null
  const sc  = SCORING[round] ?? SCORING['f']
  const kickoffLabel = formatKickoff(fixture.kickoff_utc, timezone)

  // State-derived card style
  const resultOutcome = result ? (result.home > result.away ? 'H' : result.away > result.home ? 'A' : 'D') : null
  const isCorrect = hasPred && pts !== null && pts > 0
  const isExact   = hasPred && pts === sc.exact && isExactRound
  const isWrong   = hasPred && result && pts === 0

  const handleChange = useCallback((side: 'home'|'away', raw: string) => {
    let display = raw
    if (raw !== '') {
      const n = parseInt(raw, 10)
      if (isNaN(n) || n < 0) display = '0'
      else if (n > 20) display = '20'
      else display = String(n)
    }
    if (side === 'home') {
      setLocalHome(display)
      onPredict(fixture.id, 'home', display === '' ? -1 : parseInt(display, 10))
    } else {
      setLocalAway(display)
      onPredict(fixture.id, 'away', display === '' ? -1 : parseInt(display, 10))
    }
  }, [fixture.id, onPredict])

  const shortName = (t: string) => t.length > 10 ? t.split(' ')[0] : t

  return (
    <div className={clsx(
      'rounded-xl border mb-2 overflow-hidden transition-all',
      isExact              && 'border-green-300 bg-green-50',
      isCorrect && !isExact && 'border-blue-200 bg-blue-50/40',
      isWrong              && 'border-red-200 bg-red-50/30',
      !result && hasPred   && 'border-gray-200 bg-white',
      !result && !hasPred && !locked && 'border-dashed border-amber-300 bg-amber-50/30',
      locked && !result    && 'border-gray-200 bg-gray-50',
      isFavourite && !result && 'ring-1 ring-purple-200',
    )}>

      {/* Top bar: kickoff + badges */}
      <div className={clsx(
        'flex items-center justify-between px-3 py-1.5 text-[11px] border-b',
        isExact   ? 'bg-green-100/60 border-green-200' :
        isCorrect ? 'bg-blue-50 border-blue-100' :
        isWrong   ? 'bg-red-50/50 border-red-100' :
        locked && !result ? 'bg-gray-100 border-gray-200' :
        !hasPred  ? 'bg-amber-50/60 border-amber-100' :
                    'bg-gray-50 border-gray-100'
      )}>
        <div className="flex items-center gap-2 text-gray-400">
          {locked && !result && (
            <svg className="w-3 h-3 text-gray-400 flex-shrink-0" viewBox="0 0 12 12" fill="currentColor">
              <rect x="1" y="5" width="10" height="7" rx="1.5"/>
              <path d="M3.5 5V3.5a2.5 2.5 0 015 0V5" fill="none" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
          )}
          <span className="font-medium text-gray-500">{kickoffLabel}</span>
          <span className="text-gray-300">·</span>
          <span className="truncate max-w-[160px] text-gray-400">{fixture.venue}</span>
        </div>
        <div className="flex items-center gap-2">
          {isFavourite && FAV_TEAM_DOUBLE_ROUNDS.includes(round) && (
            <span className="text-purple-600 font-semibold">⭐ 2×</span>
          )}
          {challenge && !result && (
            <span className="text-purple-600 font-medium">🎯 {challenge.prize}</span>
          )}
          {saving && <span className="text-gray-400 animate-pulse">saving…</span>}
          {!locked && !result && hasPred && !saving && (
            <span className="text-green-600 font-medium">✓</span>
          )}
          {!locked && !result && !hasPred && (
            <span className="text-amber-500 font-medium">Pick now</span>
          )}
          {pts !== null && <PointsBadge pts={pts} maxExact={sc.exact} />}
        </div>
      </div>

      {/* Main content: teams + prediction */}
      <div className="px-3 py-3">
        <div className="flex items-center gap-2">

          {/* Home team */}
          <div className="flex-1 flex items-center gap-2 justify-end min-w-0">
            <span className={clsx(
              'font-semibold text-sm truncate text-right',
              result && resultOutcome === 'H' ? 'text-gray-900' : result ? 'text-gray-400' : 'text-gray-800'
            )}>
              {shortName(fixture.home)}
            </span>
            <span className="text-2xl flex-shrink-0">{flag(fixture.home)}</span>
          </div>

          {/* Centre: prediction + result */}
          <div className="flex flex-col items-center gap-1 flex-shrink-0 px-1">
            {isOutcomeRound ? (
              /* Outcome buttons: 1 / X / 2 */
              <div className="flex gap-1">
                {(['H','D','A'] as const).map(o => {
                  const label   = o === 'H' ? '1' : o === 'D' ? 'X' : '2'
                  const isPick  = selectedOutcome === o
                  const isRes   = resultOutcome === o
                  if (result) {
                    return (
                      <div key={o} className={clsx(
                        'w-10 h-10 flex items-center justify-center text-sm font-bold rounded-lg border',
                        isRes && isPick   && 'bg-green-500 border-green-600 text-white',
                        isRes && !isPick  && 'bg-green-100 border-green-200 text-green-700',
                        !isRes && isPick  && 'bg-red-100 border-red-300 text-red-600',
                        !isRes && !isPick && 'bg-gray-50 border-gray-200 text-gray-300',
                      )}>{label}</div>
                    )
                  }
                  return (
                    <button key={o}
                      disabled={locked}
                      onClick={() => !locked && onOutcome?.(fixture.id, o)}
                      className={clsx(
                        'w-10 h-10 flex items-center justify-center text-sm font-bold rounded-lg border transition-all',
                        locked && 'opacity-50 cursor-not-allowed',
                        isPick && o === 'H' && 'bg-blue-600 border-blue-700 text-white shadow-md scale-105',
                        isPick && o === 'D' && 'bg-gray-700 border-gray-800 text-white shadow-md scale-105',
                        isPick && o === 'A' && 'bg-red-600 border-red-700 text-white shadow-md scale-105',
                        !isPick && !locked && 'bg-white border-gray-300 text-gray-400 hover:border-gray-500 hover:text-gray-600 hover:bg-gray-50',
                        !isPick && locked  && 'bg-gray-50 border-gray-200 text-gray-300',
                      )}>{label}</button>
                  )
                })}
              </div>
            ) : (
              /* Score inputs (tp, f) */
              <div className="flex items-center gap-1.5">
                <input type="number" min={0} max={20}
                  value={localHome} disabled={locked || !!result}
                  className={clsx(
                    'w-11 h-11 text-center text-base font-bold border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 transition-colors',
                    locked || result ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed' :
                    localHome !== '' ? 'bg-white border-green-400 text-gray-900' :
                    'bg-gray-50 border-dashed border-gray-300 text-gray-400'
                  )}
                  onChange={e => handleChange('home', e.target.value)}
                  onFocus={e => e.target.select()} inputMode="numeric"
                />
                <span className="text-gray-400 font-light text-lg">–</span>
                <input type="number" min={0} max={20}
                  value={localAway} disabled={locked || !!result}
                  className={clsx(
                    'w-11 h-11 text-center text-base font-bold border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 transition-colors',
                    locked || result ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed' :
                    localAway !== '' ? 'bg-white border-green-400 text-gray-900' :
                    'bg-gray-50 border-dashed border-gray-300 text-gray-400'
                  )}
                  onChange={e => handleChange('away', e.target.value)}
                  onFocus={e => e.target.select()} inputMode="numeric"
                />
              </div>
            )}

            {/* Result score (exact rounds always shown; outcome rounds shown below buttons) */}
            {result && isExactRound && (
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[10px] text-gray-400 font-medium">
                  {result.home}–{result.away}
                </span>
              </div>
            )}
            {result && isOutcomeRound && (
              <div className="text-[10px] text-gray-500 font-semibold mt-0.5">
                {result.home}–{result.away}
              </div>
            )}

            {/* Label row */}
            {!result && isOutcomeRound && (
              <div className="flex gap-1 text-[9px] text-gray-400 w-full justify-between mt-0.5">
                <span className="w-10 text-center">{shortName(fixture.home)}</span>
                <span className="w-10 text-center">Draw</span>
                <span className="w-10 text-center">{shortName(fixture.away)}</span>
              </div>
            )}
          </div>

          {/* Away team */}
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <span className="text-2xl flex-shrink-0">{flag(fixture.away)}</span>
            <span className={clsx(
              'font-semibold text-sm truncate',
              result && resultOutcome === 'A' ? 'text-gray-900' : result ? 'text-gray-400' : 'text-gray-800'
            )}>
              {shortName(fixture.away)}
            </span>
          </div>
        </div>

        {/* Penalty winner picker */}
        {showPenPick && onPenWinner && (
          <div className="mt-3 pt-2.5 border-t border-amber-200">
            <p className="text-[11px] text-amber-700 font-semibold mb-2 text-center">
              🥅 Who wins on penalties?
            </p>
            <div className="flex gap-2">
              {[fixture.home, fixture.away].map(team => (
                <button key={team} onClick={() => onPenWinner(fixture.id, team)}
                  className={clsx(
                    'flex-1 py-2 px-3 text-xs font-semibold rounded-xl border transition-all',
                    penWinner === team
                      ? 'bg-amber-500 border-amber-600 text-white shadow-sm scale-[1.02]'
                      : 'bg-white border-amber-200 text-amber-800 hover:bg-amber-50 hover:border-amber-300'
                  )}>
                  {flag(team)} {team}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Penalty result */}
        {result && isKnockout && (result as any).pen_winner && (
          <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-center gap-1.5">
            <span className="text-[11px] text-gray-500">
              Penalties: <span className="font-semibold text-gray-700">{flag((result as any).pen_winner)} {(result as any).pen_winner}</span>
            </span>
            {penWinner && (
              penWinner === (result as any).pen_winner
                ? <span className="text-[11px] text-green-600 font-semibold">✓</span>
                : <span className="text-[11px] text-red-500 font-semibold">✗</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
