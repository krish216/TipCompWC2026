'use client'

import React, { useCallback, useState } from 'react'
import { ShareButton } from '@/components/game/ShareCard'
import type { SharePayload } from '@/components/game/ShareCard'
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
  prediction?: { home: number; away: number } | null
  result?: MatchScore | null
  locked?: boolean
  saving?: boolean
  isFavourite?: boolean
  challenge?: { prize: string; sponsor?: string | null; org_name?: string } | null
  timezone?: string
  onPredict:    (fixtureId: number, side: 'home' | 'away', value: number) => void
  onOutcome?:   (fixtureId: number, outcome: 'H' | 'D' | 'A') => void
  onPenWinner?: (fixtureId: number, team: string) => void
}

export function MatchRow({
  fixture, round, prediction, result,
  locked = false, saving = false, isFavourite = false, challenge,
  timezone = 'UTC',
  onPredict, onOutcome, onPenWinner,
}: Props) {
  // Local state for input display — allows spinners and direct typing to work
  // independently without waiting for the parent state to propagate
  const [localHome, setLocalHome] = useState<string>(
    prediction && prediction.home >= 0 ? String(prediction.home) : ''
  )
  const [localAway, setLocalAway] = useState<string>(
    prediction && prediction.away >= 0 ? String(prediction.away) : ''
  )
  // Keep local state in sync when predictions load after mount
  const prevPredRef = React.useRef(prediction)
  if (prevPredRef.current !== prediction) {
    prevPredRef.current = prediction
    if (prediction && prediction.home >= 0 && localHome === '') setLocalHome(String(prediction.home))
    if (prediction && prediction.away >= 0 && localAway === '') setLocalAway(String(prediction.away))
  }

  // Sync from parent only on initial load (when local state is still empty)
  // We don't want to overwrite what the user is actively typing
  const predHome = prediction && prediction.home >= 0 ? String(prediction.home) : ''
  const predAway = prediction && prediction.away >= 0 ? String(prediction.away) : ''

  const isExactRound = EXACT_SCORE_ROUNDS.includes(round)
  const isOutcomeRound = OUTCOME_ROUNDS.includes(round)
  const isKnockout   = KNOCKOUT_ROUNDS.includes(round)
  const selectedOutcome = (prediction as any)?.outcome ?? null
  const isPredDraw   = isExactRound
    ? (prediction != null && prediction.home === prediction.away && prediction.home >= 0)
    : selectedOutcome === 'D'
  const showPenPick  = isKnockout && !result && !locked && isPredDraw
  const hasPred = isOutcomeRound
    ? selectedOutcome != null
    : prediction != null && prediction.home >= 0 && prediction.away >= 0
  const pts      = hasPred ? calcPoints(prediction, result ?? null, round) : result ? 0 : null
  const sc       = SCORING[round] ?? SCORING['f']  // fallback for safety
  const kickoffLabel = formatKickoff(fixture.kickoff_utc, timezone)

  const rowClass = clsx(
    'border rounded-lg p-3 mb-2 transition-colors',
    result && !isOutcomeRound && pts === sc.exact     && 'match-exact border-green-400',
    result && pts === sc.result && pts > 0            && 'match-correct border-blue-400',
    result && pts === 0 && hasPred                    && 'match-wrong border-red-300',
    !result && !hasPred && !locked           && 'match-open',
    locked && !result                        && 'bg-gray-50 border-gray-200',
    !result && hasPred && !locked            && 'border-gray-200 bg-white',
    isFavourite && !result                   && 'ring-1 ring-purple-300',
    challenge && !result                     && 'ring-1 ring-purple-400 border-purple-200',
  )

  const handleChange = useCallback((side: 'home' | 'away', raw: string) => {
    // Clamp value between 0 and 20, allow empty string while typing
    let display = raw
    if (raw !== '') {
      const n = parseInt(raw, 10)
      if (isNaN(n) || n < 0) display = '0'
      else if (n > 20) display = '20'
      else display = String(n)
    }

    if (side === 'home') {
      setLocalHome(display)
      const n = display === '' ? -1 : parseInt(display, 10)
      onPredict(fixture.id, 'home', n)
    } else {
      setLocalAway(display)
      const n = display === '' ? -1 : parseInt(display, 10)
      onPredict(fixture.id, 'away', n)
    }
  }, [fixture.id, onPredict])

  // Handle all input changes — same logic for typing and spinner arrows
  const handleSpinner = useCallback((side: 'home' | 'away', raw: string) => {
    handleChange(side, raw)
  }, [handleChange])

  const inputClass = (val: string) => clsx(
    'w-10 h-10 text-center text-base font-semibold border rounded-lg',
    'focus:outline-none focus:ring-2 focus:ring-green-400',
    'disabled:bg-gray-50 disabled:cursor-not-allowed',
    'transition-colors',
    val === '' && !locked && !result
      ? 'border-dashed border-gray-300 bg-gray-50 text-gray-400'
      : 'border-gray-300 bg-white text-gray-900',
    // Highlight when value is entered
    val !== '' && !result && 'border-green-300 bg-green-50 text-gray-900',
  )

  return (
    <div className={rowClass}>
      {/* Meta row */}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
          <span>{kickoffLabel}</span>
          <span className="w-1 h-1 rounded-full bg-gray-300" />
          <span className="truncate max-w-[180px]">{fixture.venue}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {isFavourite && FAV_TEAM_DOUBLE_ROUNDS.includes(round) && (
            <span className="text-[11px] text-purple-600">⭐ 2× pts</span>
          )}
          {showPenPick && (
            <span className="text-[11px] text-amber-600 font-medium">Penalties — pick winner</span>
          )}
          {challenge && !result && (
            <span className="text-[11px] text-purple-600 font-medium flex items-center gap-1">
              🎯 {challenge.prize}{challenge.sponsor ? ` · ${challenge.sponsor}` : ''}
            </span>
          )}
          {locked && !result && (
            <span className="text-[11px] text-red-500 flex items-center gap-1">
              <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
                <rect x="1" y="5" width="10" height="7" rx="1.5"/>
                <path d="M3.5 5V3.5a2.5 2.5 0 015 0V5" fill="none" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
              Locked
            </span>
          )}
          {!locked && hasPred && !result && (
              <span className="text-[11px] text-green-600">✓ saved</span>
            )}
            {!locked && hasPred && !result && (
              <ShareButton
                compact
                payload={{
                  type: 'prediction',
                  home: fixture.home,
                  away: fixture.away,
                  homeScore: prediction!.home,
                  awayScore: prediction!.away,
                  roundLabel: round,
                  isFavourite,
                }}
              />
            )}
          {!locked && !hasPred && !result && <span className="text-[11px] text-amber-500">tap to predict</span>}
          {saving && <span className="text-[11px] text-gray-400 animate-pulse">saving…</span>}
          <PointsBadge pts={pts} maxExact={sc.exact} />
        </div>
      </div>

      {/* Teams + prediction area */}
      <div className="flex items-center justify-between gap-2 flex-wrap">

        {/* Home team */}
        <div className="flex items-center gap-1.5 min-w-[90px] justify-end">
          <span className="hidden sm:inline text-[13px] font-medium text-right">{fixture.home}</span>
          <span className="sm:hidden text-xs font-medium">
            {fixture.home.length > 12 ? fixture.home.split(' ')[0] : fixture.home}
          </span>
          <span className="text-lg">{flag(fixture.home)}</span>
        </div>

        {/* Prediction input: outcome buttons (gs–sf) or score inputs (tp, f) */}
        <div className="flex items-end gap-3">
          {isOutcomeRound ? (
            /* ── Outcome picker ── */
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-gray-400 font-medium">Pick</span>
              {result ? (
                /* Show result outcome after match */
                <div className="flex gap-1">
                  {(['H','D','A'] as const).map(o => {
                    const resultOutcome = result.home > result.away ? 'H' : result.away > result.home ? 'A' : 'D'
                    const isResult = o === resultOutcome
                    const isPick   = o === selectedOutcome
                    return (
                      <div key={o} className={clsx(
                        'w-8 h-8 flex items-center justify-center text-xs font-bold rounded-lg border',
                        isResult && isPick  && 'bg-green-100 border-green-400 text-green-800',
                        isResult && !isPick && 'bg-green-50 border-green-300 text-green-600',
                        !isResult && isPick && 'bg-red-100 border-red-300 text-red-700',
                        !isResult && !isPick && 'bg-gray-50 border-gray-200 text-gray-300',
                      )}>
                        {o === 'H' ? '1' : o === 'D' ? 'X' : '2'}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="flex gap-1">
                  {(['H','D','A'] as const).map(o => (
                    <button key={o}
                      disabled={locked}
                      onClick={() => !locked && onOutcome && onOutcome(fixture.id, o)}
                      className={clsx(
                        'w-9 h-9 flex items-center justify-center text-sm font-bold rounded-lg border transition-colors',
                        locked && 'cursor-not-allowed opacity-60',
                        !locked && selectedOutcome !== o && 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50 hover:border-gray-400',
                        selectedOutcome === o && o === 'H' && 'bg-blue-600 border-blue-700 text-white shadow-sm',
                        selectedOutcome === o && o === 'D' && 'bg-gray-600 border-gray-700 text-white shadow-sm',
                        selectedOutcome === o && o === 'A' && 'bg-red-600 border-red-700 text-white shadow-sm',
                        selectedOutcome !== o && 'border-gray-200 bg-white text-gray-400',
                      )}>
                      {o === 'H' ? '1' : o === 'D' ? 'X' : '2'}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-1 text-[9px] text-gray-400 w-full justify-between px-0.5">
                <span>{fixture.home.split(' ')[0]}</span>
                <span>Draw</span>
                <span>{fixture.away.split(' ')[0]}</span>
              </div>
            </div>
          ) : (
          /* ── Score inputs (tp, f) ── */
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] text-gray-400 font-medium">Pick</span>
            <div className="flex items-center gap-1.5">
              <input
                type="number" min={0} max={20}
                value={localHome}
                disabled={locked || !!result}
                className={inputClass(localHome)}
                onChange={e => handleSpinner('home', e.target.value)}
                onFocus={e => e.target.select()}
                aria-label={`${fixture.home} score`}
                inputMode="numeric"
              />
              <span className="text-gray-300 text-sm font-light">–</span>
              <input
                type="number" min={0} max={20}
                value={localAway}
                disabled={locked || !!result}
                className={inputClass(localAway)}
                onChange={e => handleSpinner('away', e.target.value)}
                onFocus={e => e.target.select()}
                aria-label={`${fixture.away} score`}
                inputMode="numeric"
              />
            </div>
          </div>

          )} {/* end score inputs ternary */}

          {/* Result (shown when available) */}
          {result && (
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-gray-400 font-medium">Result</span>
              <div className="flex items-center gap-1.5">
                <div className="w-10 h-10 flex items-center justify-center text-base font-semibold bg-gray-100 rounded-lg border border-gray-200">
                  {result.home}
                </div>
                <span className="text-gray-300 text-sm">–</span>
                <div className="w-10 h-10 flex items-center justify-center text-base font-semibold bg-gray-100 rounded-lg border border-gray-200">
                  {result.away}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Away team */}
        <div className="flex items-center gap-1.5 min-w-[90px]">
          <span className="text-lg">{flag(fixture.away)}</span>
          <span className="hidden sm:inline text-[13px] font-medium">{fixture.away}</span>
          <span className="sm:hidden text-xs font-medium">
            {fixture.away.length > 12 ? fixture.away.split(' ')[0] : fixture.away}
          </span>
        </div>
      </div>

      {/* Penalty winner picker — shown when draw predicted in knockout round */}
      {showPenPick && onPenWinner && (
        <div className="mt-2 pt-2 border-t border-amber-200">
          <p className="text-[11px] text-amber-700 font-medium mb-1.5">
            🥅 Draw predicted — who wins on penalties?
          </p>
          <div className="flex gap-2">
            {[fixture.home, fixture.away].map(team => (
              <button
                key={team}
                onClick={() => onPenWinner(fixture.id, team)}
                className={clsx(
                  'flex-1 py-1.5 px-2 text-xs font-medium rounded-lg border transition-colors',
                  (prediction as any)?.pen_winner === team
                    ? 'bg-amber-500 border-amber-600 text-white'
                    : 'bg-white border-amber-300 text-amber-800 hover:bg-amber-50'
                )}
              >
                {flag(team)} {team}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Show penalty result when available */}
      {result && isKnockout && (result as any).pen_winner && (
        <div className="mt-1.5 pt-1.5 border-t border-gray-100">
          <p className="text-[11px] text-gray-500">
            🥅 Won on penalties: <span className="font-semibold">{flag((result as any).pen_winner)} {(result as any).pen_winner}</span>
            {(prediction as any)?.pen_winner && (
              (prediction as any).pen_winner === (result as any).pen_winner
                ? <span className="text-green-600 ml-1.5">✓ correct</span>
                : <span className="text-red-500 ml-1.5">✗ wrong</span>
            )}
          </p>
        </div>
      )}
    </div>
  )
}
