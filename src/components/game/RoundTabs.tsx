'use client'

import { clsx } from 'clsx'
import type { RoundId } from '@/types'

const ROUNDS: { id: RoundId; label: string }[] = [
  { id: 'gs',  label: 'Group stage' },
  { id: 'r32', label: 'Rd of 32' },
  { id: 'r16', label: 'Rd of 16' },
  { id: 'qf',  label: 'Quarters' },
  { id: 'sf',  label: 'Semis' },
  { id: 'tp',  label: '3rd place' },
  { id: 'f',   label: 'Final' },
]

interface Props {
  active: RoundId
  roundPoints: Partial<Record<RoundId, number>>
  onChange: (round: RoundId) => void
}

export function RoundTabs({ active, roundPoints, onChange }: Props) {
  return (
    <div className="flex gap-1.5 flex-wrap mb-3">
      {ROUNDS.map(r => {
        const pts = roundPoints[r.id]
        return (
          <button
            key={r.id}
            onClick={() => onChange(r.id)}
            className={clsx('round-tab', active === r.id && 'active')}
          >
            {r.label}
            {pts != null && pts > 0 && (
              <span className={clsx(
                'absolute -top-1.5 -right-1.5 text-[9px] font-semibold rounded-full px-1 min-w-[16px] text-center',
                active === r.id ? 'bg-amber-400 text-amber-900' : 'bg-amber-100 text-amber-700'
              )}>
                {pts}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export { ROUNDS }
