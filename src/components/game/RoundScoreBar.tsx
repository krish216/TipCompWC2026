import { RoundScorePills } from '@/components/ui'
import { getDefaultScoringConfig, type RoundId } from '@/types'

interface Props {
  round: RoundId
  played: number
  total: number
  pts: number
  exactCount: number
  correctCount: number
}

export function RoundScoreBar({ round, played, total, pts, exactCount, correctCount }: Props) {
  const sc = getDefaultScoringConfig().rounds[round]
  return (
    <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 mb-3 flex-wrap gap-2">
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="font-medium text-gray-700">{sc?.round_name ?? round}</span>
        <span>{played} of {total} results in</span>
        {played > 0 && (
          <span className="text-gray-400">
            · ★{exactCount} exact · ✓{correctCount} correct
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <RoundScorePills exact={sc?.exact_bonus ?? 0} result={sc?.result_pts ?? 0} />
        {pts > 0 && (
          <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs font-semibold rounded-full">
            {pts} pts this round
          </span>
        )}
      </div>
    </div>
  )
}
