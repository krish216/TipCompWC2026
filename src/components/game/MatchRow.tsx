'use client'

import React, { useCallback, useState } from 'react'
import { ShareButton } from '@/components/game/ShareCard'
import { clsx } from 'clsx'
import { PointsBadge } from '@/components/ui'
import type { Fixture, MatchScore, RoundId } from '@/types'
import { calcPoints, getDefaultScoringConfig, type TournamentScoringConfig } from '@/types'
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
const short = (t: string) => t.length > 14 ? t.replace('and ', '& ').split(' ').map((w,i) => i === 0 ? w : w[0]+'.').join(' ') : t

interface Props {
  fixture:     Fixture
  round:       RoundId
  prediction?: { home: number; away: number; outcome?: 'H'|'D'|'A'|null; pen_winner?: string|null } | null
  result?:     (MatchScore & { pen_winner?: string|null; result_outcome?: string|null }) | null
  locked?:     boolean
  saving?:     boolean
  isFavourite?: boolean
  challenge?:  { prize: string; sponsor?: string|null } | null
  timezone?:   string
  scoringConfig?: TournamentScoringConfig
  celebrating?: boolean
  onPredict:    (fixtureId: number, side: 'home'|'away', value: number) => void
  onFocusScore?: () => void
  onBlurScore?:  () => void
  onOutcome?:   (fixtureId: number, outcome: 'H'|'D'|'A') => void
  onPenWinner?: (fixtureId: number, team: string) => void
}

export function MatchRow({
  fixture, round, prediction, result,
  locked = false, saving = false, celebrating = false, isFavourite = false, challenge,
  timezone = 'UTC', scoringConfig,
  onPredict, onOutcome, onPenWinner, onFocusScore, onBlurScore,
}: Props) {
  const [localHome, setLocalHome] = useState<string>(
    prediction && prediction.home >= 0 ? String(prediction.home) : ''
  )
  const [localAway, setLocalAway] = useState<string>(
    prediction && prediction.away >= 0 ? String(prediction.away) : ''
  )
  const prevRef = React.useRef(prediction)
  if (prevRef.current !== prediction) {
    prevRef.current = prediction
    if (prediction && prediction.home >= 0 && localHome === '') setLocalHome(String(prediction.home))
    if (prediction && prediction.away >= 0 && localAway === '') setLocalAway(String(prediction.away))
  }

  const cfg = scoringConfig ?? getDefaultScoringConfig()
  const isExactRound   = cfg.exact_score_rounds.includes(round)
  const isOutcomeRound = cfg.outcome_rounds.includes(round)
  const isKnockout     = cfg.knockout_rounds.includes(round)
  const penWinner      = (prediction as any)?.pen_winner ?? null
  // Derive outcome: use stored outcome or infer from scores for outcome rounds
  const rawOutcome = (prediction as any)?.outcome ?? null
  const sel: 'H'|'D'|'A'|null = rawOutcome
    ?? (isOutcomeRound && prediction != null
        ? (prediction.home > prediction.away ? 'H' : prediction.away > prediction.home ? 'A' : prediction.home === prediction.away && prediction.home >= 0 ? 'D' : null)
        : null)
  const isPredDraw  = isExactRound
    ? (prediction != null && prediction.home === prediction.away && prediction.home >= 0)
    : sel === 'D'
  const showPenPick = isKnockout && !result && !locked && isPredDraw
  const awaitingPen = isKnockout && isOutcomeRound && sel === 'D' && !penWinner && !result && !locked
  const hasPred     = isOutcomeRound
    ? (sel != null && !awaitingPen)
    : (prediction != null && prediction.home >= 0 && prediction.away >= 0)

  // Ensure calcPoints receives the derived outcome (handles old predictions with null outcome)
  const predForCalc = prediction
    ? { ...prediction, outcome: sel ?? (prediction as any).outcome ?? null }
    : prediction
  const pts = hasPred ? calcPoints(predForCalc, result ?? null, round, isFavourite, cfg) : result ? 0 : null
  const sc  = cfg.rounds[round] ?? cfg.rounds['f']

  const resultOutcome = result
    ? (result.home > result.away ? 'H' : result.away > result.home ? 'A' : 'D')
    : null

  const isCorrect = hasPred && !!result && (pts ?? 0) > 0
  const isExact   = isCorrect && isExactRound && !!sc && pts === (sc.result_pts + sc.exact_bonus)
  const isWrong   = hasPred && !!result && pts === 0
  // pen bonus earned: outcome round, draw result, correct pen winner, pts > base result_pts
  const penBonusEarned = hasPred && !!result && !isExactRound && (pts ?? 0) > (sc?.result_pts ?? 0) && !!penWinner && penWinner === (result as any)?.pen_winner

  const handleChange = useCallback((side: 'home'|'away', raw: string) => {
    const v = raw.replace(/[^0-9]/g, '')
    if (side === 'home') { setLocalHome(v); onPredict(fixture.id, 'home', v === '' ? -1 : parseInt(v)) }
    else                 { setLocalAway(v); onPredict(fixture.id, 'away', v === '' ? -1 : parseInt(v)) }
  }, [fixture.id, onPredict])

  // ── Card border / bg based on result state ──────────────────────────────────
  const noTip = !!result && !hasPred  // result in but no prediction was made

  const cardClass = clsx(
    'rounded-2xl border mb-2.5 overflow-hidden transition-all',
    // Only colour-code when player actually made a prediction
    isCorrect && !noTip && 'border-green-300 bg-green-50',
    isWrong   && !noTip && 'border-red-200 bg-red-50/30',
    // No prediction — neutral always
    noTip               && 'border-gray-200 bg-white opacity-75',
    !result && hasPred  && 'border-gray-200 bg-white',
    awaitingPen              && 'border-amber-300 bg-amber-50/40',
    !result && !hasPred && !awaitingPen && !locked && 'border-gray-200 bg-white',
    locked && !result   && 'border-gray-200 bg-gray-50/60',
    isFavourite && !result && 'ring-1 ring-purple-200',
    celebrating && 'ring-2 ring-green-200 shadow-lg',
  )

  return (
    <div className={cardClass}>

      {/* ── Top meta bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 pt-2 pb-1.5">
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
          {locked && !result && (
            <svg className="w-3 h-3 text-gray-400" viewBox="0 0 12 12" fill="currentColor">
              <rect x="1" y="5" width="10" height="7" rx="1.5"/>
              <path d="M3.5 5V3.5a2.5 2.5 0 015 0V5" fill="none" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
          )}
          <span>{formatKickoff(fixture.kickoff_utc, timezone)}</span>
          <span className="text-gray-300">·</span>
          <span className="truncate max-w-[150px]">{fixture.venue}</span>
        </div>

        <div className="flex items-center gap-2 text-[11px]">
          {isFavourite && cfg.fav_team_rounds.includes(round) && (
            <span className="text-purple-600 font-semibold">⭐ 2×</span>
          )}
          {challenge && !result && (
            <span className="text-purple-600 font-medium">🎯 {challenge.prize}</span>
          )}
          {saving && <span className="text-gray-400 animate-pulse">saving…</span>}
          {!saving && celebrating && (
            <span className="text-green-600 font-semibold">🎉 Saved!</span>
          )}
          {!saving && !celebrating && !locked && !result && hasPred && (
            <span className="text-green-600 font-semibold">✓ saved</span>
          )}
          {!saving && awaitingPen && (
            <span className="text-amber-600 font-semibold animate-pulse">🥅 Pick penalties ↓</span>
          )}
          {!locked && !result && !hasPred && !awaitingPen && (
            <span className="text-amber-500 font-semibold">Pick now</span>
          )}
          {noTip && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 text-[11px] font-semibold rounded-full">
              ✗ No Tip Entered
            </span>
          )}
          {pts !== null && <PointsBadge pts={pts} maxExact={sc?.exact_bonus} penBonus={penBonusEarned} />}
        </div>
      </div>

      {/* ── Main row: flag · team · [buttons] · team · flag ────────────────── */}
      <div className="flex items-center px-3 pb-3 gap-2">

        {/* Home team */}
        <div className="flex flex-col items-center gap-1 w-14 flex-shrink-0">
          <span className="text-4xl leading-none">{flag(fixture.home)}</span>
          <span className={clsx(
            'text-[11px] font-semibold text-center leading-tight',
            result && !noTip && resultOutcome === 'H' ? 'text-gray-900' : result && !noTip ? 'text-gray-400' : 'text-gray-700'
          )}>
            {short(fixture.home)}
          </span>
        </div>

        {/* Centre prediction area */}
        <div className="flex-1 flex flex-col items-center gap-1.5">
          {isOutcomeRound ? (
            <>
              {/* Three outcome radio buttons filling the space */}
              <div className={clsx(
                'flex w-full rounded-xl p-1 gap-1',
                locked && !result ? 'bg-gray-100' : 'bg-gray-100',
              )}>
                {(['H','D','A'] as const).map(o => {
                  const isPick  = sel === o
                  const isRes   = resultOutcome === o

                  if (result) {
                    return (
                      <div key={o} className={clsx(
                        'flex-1 h-10 flex items-center justify-center rounded-lg transition-all',
                        !noTip && isRes && isPick  && 'bg-green-100',
                        !noTip && !isRes && isPick && 'bg-red-100',
                      )}>
                        <div className={clsx(
                          'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                          !noTip && isRes && isPick  && 'border-green-500',
                          !noTip && !isRes && isPick && 'border-red-400',
                          (!isPick || noTip)         && 'border-gray-200',
                        )}>
                          {!noTip && isPick && (
                            <div className={clsx(
                              'w-2.5 h-2.5 rounded-full',
                              isRes ? 'bg-green-500' : 'bg-red-400'
                            )} />
                          )}
                        </div>
                      </div>
                    )
                  }

                  return (
                    <button key={o}
                      disabled={locked}
                      onClick={() => !locked && onOutcome?.(fixture.id, o)}
                      className={clsx(
                        'flex-1 h-10 flex items-center justify-center rounded-lg transition-all',
                        !locked && 'hover:bg-gray-200 active:scale-95',
                        locked && 'cursor-not-allowed',
                        isPick && 'bg-white shadow-sm',
                      )}>
                      <div className={clsx(
                        'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all',
                        isPick  ? 'border-blue-500 bg-white' : 'border-gray-300 bg-white',
                      )}>
                        {isPick && <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />}
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Label row: home team · Draw · away team */}
              <div className="flex w-full text-[10px] text-gray-400 font-medium">
                <span className="flex-1 text-center">{short(fixture.home)}</span>
                <span className="flex-1 text-center">Draw</span>
                <span className="flex-1 text-center">{short(fixture.away)}</span>
              </div>

              {/* Result score */}
              {result && (
                <div className="text-xs font-bold text-gray-600 mt-0.5">
                  {result.home} – {result.away}
                </div>
              )}
            </>
          ) : (
            /* Exact score inputs (tp, f) */
            <>
              <div className="flex items-center gap-2">
                <input type="number" min={0} max={20}
                  value={localHome} disabled={locked || !!result}
                  className={clsx(
                    'w-12 h-12 text-center text-xl font-bold border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 transition-colors',
                    locked || result ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed' :
                    localHome !== '' ? 'bg-white border-green-400 text-gray-900' :
                    'bg-gray-50 border-dashed border-gray-300 text-gray-400'
                  )}
                  onChange={e => handleChange('home', e.target.value)}
                  onFocus={e => { e.target.select(); onFocusScore?.() }} onBlur={onBlurScore} inputMode="numeric"
                />
                <span className="text-gray-300 font-light text-2xl">–</span>
                <input type="number" min={0} max={20}
                  value={localAway} disabled={locked || !!result}
                  className={clsx(
                    'w-12 h-12 text-center text-xl font-bold border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 transition-colors',
                    locked || result ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed' :
                    localAway !== '' ? 'bg-white border-green-400 text-gray-900' :
                    'bg-gray-50 border-dashed border-gray-300 text-gray-400'
                  )}
                  onChange={e => handleChange('away', e.target.value)}
                  onFocus={e => { e.target.select(); onFocusScore?.() }} onBlur={onBlurScore} inputMode="numeric"
                />
              </div>
              {result && (
                <div className="text-xs font-bold text-gray-500 mt-1">
                  Result: {result.home}–{result.away}
                </div>
              )}
            </>
          )}
        </div>

        {/* Away team */}
        <div className="flex flex-col items-center gap-1 w-14 flex-shrink-0">
          <span className="text-4xl leading-none">{flag(fixture.away)}</span>
          <span className={clsx(
            'text-[11px] font-semibold text-center leading-tight',
            result && !noTip && resultOutcome === 'A' ? 'text-gray-900' : result && !noTip ? 'text-gray-400' : 'text-gray-700'
          )}>
            {short(fixture.away)}
          </span>
        </div>
      </div>

      {/* ── Penalty winner picker ──────────────────────────────────────────── */}
      {showPenPick && onPenWinner && (
        <div className="mx-3 mb-3 pt-2.5 border-t border-amber-200">
          <p className="text-[11px] text-amber-700 font-semibold mb-2 text-center">
            🥅 Who wins on penalties?
          </p>
          <div className="flex gap-2">
            {[fixture.home, fixture.away].map(team => (
              <button key={team} onClick={() => onPenWinner(fixture.id, team)}
                className={clsx(
                  'flex-1 py-2 px-3 text-xs font-semibold rounded-xl border-2 transition-all',
                  penWinner === team
                    ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-amber-300 hover:bg-amber-50'
                )}>
                {flag(team)} {team}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Penalty result ─────────────────────────────────────────────────── */}
      {result && isKnockout && (result as any).pen_winner && (
        <div className="mx-3 mb-3 pt-2 border-t border-gray-100 flex items-center justify-center gap-1.5">
          <span className="text-[11px] text-gray-500">
            Penalties: <span className="font-semibold text-gray-700">
              {flag((result as any).pen_winner)} {(result as any).pen_winner}
            </span>
          </span>
          {penWinner && (
            penWinner === (result as any).pen_winner
              ? <span className="text-[11px] text-green-600 font-bold">✓</span>
              : <span className="text-[11px] text-red-500 font-bold">✗</span>
          )}
        </div>
      )}
    </div>
  )
}
