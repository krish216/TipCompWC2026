'use client'

import { useState } from 'react'
import { TeamPickerSheet } from './TeamPickerSheet'
import { Flag } from '@/components/ui/Flag'

interface Team {
  name:       string
  fifa_code:  string
  flag_emoji: string
}

interface Props {
  teams:     Team[]
  value:     string | null
  disabled?: boolean
  saving?:   boolean
  onSelect:  (team: string) => void
}

export function FavTeamPicker({ teams, value, disabled, saving, onSelect }: Props) {
  const [open,       setOpen]       = useState(false)
  const [howItWorks, setHowItWorks] = useState(false)

  const selected = teams.find(t => t.name === value) ?? null

  function clear(e: React.MouseEvent) {
    e.stopPropagation()
    onSelect('')
  }

  return (
    <>
      {/* ── Trigger row ── */}
      <div className="mb-1 bg-purple-50 border border-purple-200 rounded-xl px-3 py-2.5">
        <div className="flex items-start gap-2.5">
          <span className="text-base flex-shrink-0 mt-0.5">⭐</span>

          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-purple-500 mb-1.5">
              Group Stage only · pick once before Round 1 kicks off
            </p>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => { if (!disabled) setOpen(true) }}
                disabled={disabled}
                className={`flex items-center gap-2 text-xs font-medium rounded-lg border px-2.5 py-1.5 transition-colors flex-shrink-0
                  ${disabled
                    ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                    : 'border-purple-300 bg-white text-purple-800 hover:bg-purple-50 active:bg-purple-100'
                  }`}
              >
                {selected ? (
                  <>
                    <Flag team={selected.name} className="text-base rounded-sm" />
                    <span>{selected.name}</span>
                    {!disabled && (
                      <span role="button" onClick={clear}
                        className="ml-0.5 text-purple-400 hover:text-purple-600 leading-none"
                        aria-label="Clear bonus team">×</span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="text-purple-400">＋</span>
                    <span>Pick a team…</span>
                  </>
                )}
                {saving && <span className="ml-1 text-purple-400 animate-pulse">•</span>}
              </button>

              {disabled && <span className="text-[10px] text-red-500 flex-shrink-0">Locked at tournament start</span>}
            </div>

            {/* Description on its own line so it wraps naturally (was crushed beside the
                button on narrow/iOS screens, wrapping one word per line). */}
            <p className="mt-1.5 text-xs text-purple-700">
              {selected
                ? <>e.g. <strong>6 pts instead of 3</strong> when you correctly predict any <strong>{selected.name}</strong> result</>
                : <>Pick a team — earn <strong>e.g. 6 pts instead of 3</strong> when you correctly predict their result</>}
            </p>

            <button type="button" onClick={() => setHowItWorks(v => !v)}
              className="mt-1.5 flex items-center gap-1 text-[10px] text-purple-500 hover:text-purple-700 font-medium">
              How it works {howItWorks ? '▲' : '▼'}
            </button>

            {howItWorks && (
              <div className="mt-2 bg-white border border-purple-100 rounded-lg px-3 py-2.5 text-[11px] text-gray-700 space-y-1.5">
                <p className="font-semibold text-purple-700">Bonus team example</p>
                <p>You pick <strong>🇧🇷 Brazil</strong> as your bonus team.</p>
                <p>Brazil play Spain in Group Stage Round 1. You predict <strong>Brazil win</strong> — and Brazil win.</p>
                <p>Normal: <strong>3 pts</strong> · With bonus team: <strong>6 pts</strong> ⭐</p>
                <p className="text-gray-500 text-[10px] pt-0.5">The 2× applies whether your team wins, draws or loses — as long as you predicted the correct result (1/X/2). Group Stage rounds only.</p>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="mb-3" />

      <TeamPickerSheet
        open={open}
        onClose={() => setOpen(false)}
        teams={teams}
        value={value}
        onSelect={onSelect}
        title="Choose your Bonus Points team"
        subtitle="Earn 2× base pts when you correctly predict their result (win, draw or loss) — Group Stage only"
      />
    </>
  )
}
