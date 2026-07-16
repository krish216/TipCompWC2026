'use client'

import { useState } from 'react'
import { TeamPickerSheet } from './TeamPickerSheet'
import { TeamBadge } from '@/components/game/TeamBadge'

interface Team {
  name:       string
  fifa_code:  string
  flag_emoji: string
  logo_url?:  string | null   // club crest (EPL); when absent the flag emoji is used
}

interface Props {
  teams:     Team[]
  value:     string | null
  disabled?: boolean
  saving?:   boolean
  onSelect:  (team: string) => void
  // EPL "exact-focus" model: the favourite team is your season-long club, and the bonus is
  // for nailing its exact score each matchweek (not a 2× result multiplier). When true, all
  // the copy switches from "Bonus Team · 2×" to "your club · exact score". Defaults to the
  // World-Cup bonus-team framing.
  favExactFocus?: boolean
}

export function FavTeamPicker({ teams, value, disabled, saving, onSelect, favExactFocus }: Props) {
  const [open,       setOpen]       = useState(false)
  const [howItWorks, setHowItWorks] = useState(false)

  const selected = teams.find(t => t.name === value) ?? null

  function clear(e: React.MouseEvent) {
    e.stopPropagation()
    onSelect('')
  }

  // Copy differs by mechanic: WC = bonus team (2× on correct result); EPL = your club
  // (bonus for nailing its exact score).
  const c = favExactFocus
    ? {
        emoji:  '⚽',
        header: 'Your season-long club — call its exact score each matchweek',
        empty:  'Pick your club…',
        clearLabel: 'Clear your club',
        descSelected: (t: string) => <>Call <strong>{t}</strong>&rsquo;s exact score each matchweek — nail it and <strong>bank bonus points</strong></>,
        descEmpty:    <>Pick your club — call its exact score each matchweek and <strong>bank bonus points</strong> when you nail it</>,
        sheetTitle:    'Pick your club',
        sheetSubtitle: 'Each matchweek, call your club’s exact score. Nail it and bank bonus points.',
      }
    : {
        emoji:  '⭐',
        header: 'Counts in GS3 + the Round of 32 · pick before 24 Jun',
        empty:  'Pick a team…',
        clearLabel: 'Clear bonus team',
        descSelected: (t: string) => <>e.g. <strong>6 pts instead of 3</strong> when you correctly predict any <strong>{t}</strong> result</>,
        descEmpty:    <>Pick a team — earn <strong>e.g. 6 pts instead of 3</strong> when you correctly predict their result</>,
        sheetTitle:    'Choose your Bonus Points team',
        sheetSubtitle: 'Earn 2× base pts when you correctly predict their result (win, draw or loss) — in GS3 + the Round of 32',
      }

  return (
    <>
      {/* ── Trigger row ── */}
      <div className="mb-1 bg-purple-50 border border-purple-200 rounded-xl px-3 py-2.5">
        <div className="flex items-start gap-2.5">
          <span className="text-base flex-shrink-0 mt-0.5">{c.emoji}</span>

          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-purple-500 mb-1.5">
              {c.header}
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
                    <TeamBadge flag={selected.flag_emoji} logo={selected.logo_url} name={selected.name} size={16} className="rounded-sm" />
                    <span>{selected.name}</span>
                    {!disabled && (
                      <span role="button" onClick={clear}
                        className="ml-0.5 text-purple-400 hover:text-purple-600 leading-none"
                        aria-label={c.clearLabel}>×</span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="text-purple-400">＋</span>
                    <span>{c.empty}</span>
                  </>
                )}
                {saving && <span className="ml-1 text-purple-400 animate-pulse">•</span>}
              </button>

              {/* EPL never locks (exact-focus is self-gating), so only show the lock note for the 2× model. */}
              {disabled && !favExactFocus && <span className="text-[10px] text-red-500 flex-shrink-0">Locked at tournament start</span>}
            </div>

            {/* Description on its own line so it wraps naturally (was crushed beside the
                button on narrow/iOS screens, wrapping one word per line). */}
            <p className="mt-1.5 text-xs text-purple-700">
              {selected ? c.descSelected(selected.name) : c.descEmpty}
            </p>

            <button type="button" onClick={() => setHowItWorks(v => !v)}
              className="mt-1.5 flex items-center gap-1 text-[10px] text-purple-500 hover:text-purple-700 font-medium">
              How it works {howItWorks ? '▲' : '▼'}
            </button>

            {howItWorks && (
              <div className="mt-2 bg-white border border-purple-100 rounded-lg px-3 py-2.5 text-[11px] text-gray-700 space-y-1.5">
                {favExactFocus ? (
                  <>
                    <p className="font-semibold text-purple-700">Focus-pick example</p>
                    <p>You pick <strong>Arsenal</strong> as your club.</p>
                    <p>Arsenal play Chelsea this matchweek. You call it <strong>2–1</strong> — and it finishes 2–1.</p>
                    <p>Bonus: <strong>+3 pts</strong> for nailing your club&rsquo;s exact score ⚽</p>
                    <p className="text-gray-500 text-[10px] pt-0.5">You still tip 1/X/2 on the other matches — the exact-score bonus applies only to your club&rsquo;s game, and you can change your club anytime.</p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-purple-700">Bonus team example</p>
                    <p>You pick <strong>🇧🇷 Brazil</strong> as your bonus team.</p>
                    <p>Brazil play Spain in the Round of 32. You predict <strong>Brazil win</strong> — and Brazil win.</p>
                    <p>Normal: <strong>5 pts</strong> · With bonus team: <strong>10 pts</strong> ⭐</p>
                    <p className="text-gray-500 text-[10px] pt-0.5">The 2× applies whether your team wins, draws or loses — as long as you predicted the correct result (1/X/2). Counts in the final group round (GS3) and the Round of 32.</p>
                  </>
                )}
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
        title={c.sheetTitle}
        subtitle={c.sheetSubtitle}
      />
    </>
  )
}
