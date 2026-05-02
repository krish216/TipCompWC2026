'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { RoundConfig } from '@/types'

interface Props {
  rc:              RoundConfig | undefined
  tournamentSlug?: string
}

export function RoundScoringCheatSheet({ rc, tournamentSlug = 'wc2026' }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (!rc) return null

  const isScore   = rc.predict_mode === 'score'
  const hasExact  = rc.exact_bonus  > 0
  const hasMargin = rc.margin_bonus > 0
  const hasPen    = rc.pen_bonus    > 0
  const hasFav    = rc.fav_team_2x

  const summaryParts: string[] = [
    `${rc.result_pts} pts correct result`,
    ...(hasFav    ? ['2× ⭐ Bonus Team']                   : []),
    ...(hasExact  ? [`+${rc.exact_bonus} exact score`]    : []),
    ...(hasMargin ? [`+${rc.margin_bonus} correct margin`]: []),
    ...(hasPen    ? [`+${rc.pen_bonus} correct pens`]     : []),
  ]

  return (
    <div className="mb-3 rounded-xl border border-gray-200 bg-white overflow-hidden text-xs shadow-sm">

      {/* ── Collapsed header / toggle ── */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-[13px] flex-shrink-0">📋</span>
        <span className="flex-1 min-w-0 truncate text-gray-500">
          <span className="font-semibold text-gray-700">{rc.round_name}: </span>
          {summaryParts.join(' · ')}
        </span>
        <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2">
          {expanded ? 'hide ▲' : 'how scoring works ▼'}
        </span>
      </button>

      {/* ── Expanded breakdown ── */}
      {expanded && (
        <div className="border-t border-gray-100 px-3 pt-2.5 pb-3 space-y-2">

          <ScoreRow
            pts={rc.result_pts}
            label="Correct result (home win / draw / away win)"
            color="text-green-700"
            note={hasFav ? `× 2 with ⭐ Bonus Team → ${rc.result_pts * 2} pts` : undefined}
          />

          {hasExact && (
            <ScoreRow
              pts={rc.result_pts + rc.exact_bonus}
              label="Exact scoreline"
              color="text-purple-700"
              note={`${rc.result_pts} base + ${rc.exact_bonus} exact bonus`}
            />
          )}

          {hasMargin && (
            <ScoreRow
              pts={rc.result_pts + rc.margin_bonus}
              label="Correct result + matching goal difference"
              color="text-orange-500"
              note={`e.g. predict 3–2, result 1–0 (margin = 1)`}
            />
          )}

          {hasPen && (
            <ScoreRow
              pts={`+${rc.pen_bonus}`}
              label="Correct penalty winner (drawn scores only)"
              color="text-amber-600"
              note="stacks on top of result pts"
            />
          )}

          <div className="flex items-center justify-between pt-1">
            <p className="text-[10px] text-gray-400">
              Pick type:{' '}
              {isScore
                ? <><span className="font-semibold text-purple-600">Score</span> — predict the exact scoreline</>
                : <><span className="font-semibold text-blue-600">1 / X / 2</span> — home win, draw, or away win</>
              }
            </p>
            <Link
              href={`/rules/${tournamentSlug}`}
              className="text-[10px] text-green-600 hover:underline flex-shrink-0 ml-3"
            >
              Full rules →
            </Link>
          </div>

        </div>
      )}
    </div>
  )
}

function ScoreRow({
  pts, label, color, note,
}: {
  pts: number | string
  label: string
  color: string
  note?: string
}) {
  return (
    <div className="flex items-baseline gap-2 flex-wrap">
      <span className={`font-bold flex-shrink-0 ${color}`}>
        {typeof pts === 'number' ? `${pts} pts` : pts}
      </span>
      <span className="text-gray-700 flex-1">{label}</span>
      {note && (
        <span className="text-gray-400 text-[10px] flex-shrink-0 ml-auto">{note}</span>
      )}
    </div>
  )
}
