import type { RoundId } from '@/types'

interface Props {
  round:        RoundId
  played:       number
  total:        number
  pts:          number
  bonusPts:     number
  correctCount: number
  toPredict:    number
}

export function RoundScoreBar({ round, played, total, pts, bonusPts, correctCount, toPredict }: Props) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2 mb-3">
      <div className="grid grid-cols-4 gap-2 text-center">
        <div>
          <div className="text-xs text-gray-500 mb-0.5">Total pts</div>
          <div className="text-sm font-bold text-green-700">{pts}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-0.5">Bonus pts</div>
          <div className="text-sm font-bold text-amber-600">{bonusPts}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-0.5">Correct</div>
          <div className="text-sm font-bold text-blue-700">{correctCount}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-0.5">To predict</div>
          <div className={`text-sm font-bold ${toPredict > 0 ? 'text-amber-500' : 'text-gray-400'}`}>{toPredict}</div>
        </div>
      </div>
      {played > 0 && (
        <div className="mt-1.5 text-center text-xs text-gray-400">{played} of {total} results in</div>
      )}
    </div>
  )
}
