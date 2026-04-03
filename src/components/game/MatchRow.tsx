'use client'

import { useCallback, useRef } from 'react'
import { clsx } from 'clsx'
import { PointsBadge } from '@/components/ui'
import type { Fixture, MatchScore, RoundId } from '@/types'
import { calcPoints, SCORING } from '@/types'
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
  timezone?: string
  onPredict: (fixtureId: number, side: 'home' | 'away', value: number) => void
}

export function MatchRow({
  fixture, round, prediction, result,
  locked = false, saving = false, isFavourite = false,
  timezone = 'UTC',
  onPredict,
}: Props) {
  const homeRef = useRef<HTMLInputElement>(null)
  const awayRef = useRef<HTMLInputElement>(null)

  const hasPred  = prediction != null && prediction.home >= 0 && prediction.away >= 0
  const pts      = hasPred ? calcPoints(prediction, result ?? null, round) : result ? 0 : null
  const sc       = SCORING[round]

  // Format kickoff in player's timezone
  const kickoffLabel = formatKickoff(fixture.kickoff_utc, timezone)

  const rowClass = clsx(
    'border rounded-lg p-3 mb-2 transition-colors',
    result && pts === sc.exact               && 'match-exact border-green-400',
    result && pts === sc.result && pts > 0   && 'match-correct border-blue-400',
    result && pts === 0 && hasPred           && 'match-wrong border-red-300',
    !result && !hasPred && !locked           && 'match-open',
    locked && !result                        && 'bg-gray-50 border-gray-200',
    !result && hasPred && !locked            && 'border-gray-200 bg-white',
    isFavourite && !result                   && 'ring-1 ring-purple-300',
  )

  const handleInput = useCallback((side: 'home' | 'away', raw: string) => {
    const n = raw === '' ? -1 : parseInt(raw, 10)
    if (!isNaN(n)) onPredict(fixture.id, side, n < 0 ? -1 : n)
    if (side === 'home' && raw !== '') awayRef.current?.focus()
  }, [fixture.id, onPredict])

  return (
    <div className={rowClass}>
      {/* Meta row — kickoff in player's timezone */}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
          <span>{kickoffLabel}</span>
          <span className="w-1 h-1 rounded-full bg-gray-300" />
          <span className="truncate max-w-[180px]">{fixture.venue}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {isFavourite && (
            <span className="text-[11px] text-purple-600 flex items-center gap-0.5">⭐ 2× pts</span>
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
          {!locked && hasPred && <span className="text-[11px] text-green-600">✓ confirmed</span>}
          {!locked && !hasPred && !result && <span className="text-[11px] text-amber-600">not entered</span>}
          {saving && <span className="text-[11px] text-gray-400 animate-pulse">saving…</span>}
          <PointsBadge pts={pts} maxExact={sc.exact} />
        </div>
      </div>

      {/* Teams + scores */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 min-w-[90px] justify-end text-[13px] font-medium text-right">
          <span className="hidden sm:inline">{fixture.home}</span>
          <span className="sm:hidden text-xs">{fixture.home.length > 10 ? fixture.home.split(' ')[0] : fixture.home}</span>
          <span className="text-base">{flag(fixture.home)}</span>
        </div>

        <div className="flex items-end gap-2">
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] text-gray-400">Your pick</span>
            <div className="flex items-center gap-1">
              <input ref={homeRef} type="number" min={0} max={20} placeholder=""
                value={hasPred ? prediction!.home : ''}
                disabled={locked || !!result}
                className={clsx('score-input', !hasPred && !locked && !result && 'unpredicted')}
                onChange={e => handleInput('home', e.target.value)}
                aria-label={`${fixture.home} score prediction`}
              />
              <span className="text-gray-300 text-xs">–</span>
              <input ref={awayRef} type="number" min={0} max={20} placeholder=""
                value={hasPred ? prediction!.away : ''}
                disabled={locked || !!result}
                className={clsx('score-input', !hasPred && !locked && !result && 'unpredicted')}
                onChange={e => handleInput('away', e.target.value)}
                aria-label={`${fixture.away} score prediction`}
              />
            </div>
          </div>

          {result && (
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-gray-400">Result</span>
              <div className="flex items-center gap-1">
                <div className="w-9 h-8 flex items-center justify-center text-sm font-semibold bg-gray-100 rounded-md border border-gray-200">{result.home}</div>
                <span className="text-gray-300 text-xs">–</span>
                <div className="w-9 h-8 flex items-center justify-center text-sm font-semibold bg-gray-100 rounded-md border border-gray-200">{result.away}</div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 min-w-[90px] text-[13px] font-medium">
          <span className="text-base">{flag(fixture.away)}</span>
          <span className="hidden sm:inline">{fixture.away}</span>
          <span className="sm:hidden text-xs">{fixture.away.length > 10 ? fixture.away.split(' ')[0] : fixture.away}</span>
        </div>
      </div>
    </div>
  )
}
