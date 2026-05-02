'use client'

import { useState, useEffect, useRef } from 'react'

interface Team {
  name:       string
  fifa_code:  string
  flag_emoji: string
}

interface Props {
  teams:          Team[]
  value:          string | null
  disabled?:      boolean
  saving?:        boolean
  onSelect:       (team: string) => void
}

export function FavTeamPicker({ teams, value, disabled, saving, onSelect }: Props) {
  const [open,   setOpen]   = useState(false)
  const [query,  setQuery]  = useState('')
  const inputRef            = useRef<HTMLInputElement>(null)
  const sheetRef            = useRef<HTMLDivElement>(null)

  const selected = teams.find(t => t.name === value) ?? null

  const filtered = query.trim()
    ? teams.filter(t =>
        t.name.toLowerCase().includes(query.toLowerCase()) ||
        t.fifa_code.toLowerCase().includes(query.toLowerCase())
      )
    : teams

  // Focus search input when sheet opens
  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 60)
    }
  }, [open])

  // Close on backdrop click / Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function pick(team: Team) {
    onSelect(team.name)
    setOpen(false)
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation()
    onSelect('')
  }

  return (
    <>
      {/* ── Trigger row ── */}
      <div className="mb-3 flex items-center gap-2.5 bg-purple-50 border border-purple-200 rounded-xl px-3 py-2.5">
        <span className="text-base flex-shrink-0">⭐</span>

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
              <span className="text-base leading-none">{selected.flag_emoji}</span>
              <span>{selected.name}</span>
              {!disabled && (
                <span
                  role="button"
                  onClick={clear}
                  className="ml-0.5 text-purple-400 hover:text-purple-600 leading-none"
                  aria-label="Clear bonus team"
                >×</span>
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

        <span className="text-xs text-purple-700 flex-1 min-w-0">
          {selected
            ? <>2× base pts when you correctly predict any <strong>{selected.name}</strong> result — Group Stage only</>
            : 'Pick a team — earn 2× base pts when you correctly predict their result'}
        </span>
        {disabled && <span className="text-[10px] text-red-500 flex-shrink-0">Locked</span>}
      </div>
      <p className="text-[10px] text-purple-500 -mt-2 mb-3 px-1">
        ⭐ The 2× bonus applies whether your team wins, draws or loses — as long as you picked the correct result (1/X/2).
      </p>

      {/* ── Sheet / Modal ── */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center sm:items-center"
          onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" />

          {/* Panel */}
          <div
            ref={sheetRef}
            className="relative bg-white w-full sm:w-[480px] sm:max-w-[96vw] rounded-t-2xl sm:rounded-2xl
                       shadow-2xl flex flex-col max-h-[82vh] sm:max-h-[70vh]"
          >
            {/* Handle (mobile) */}
            <div className="sm:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-2 pb-3 border-b border-gray-100 flex-shrink-0">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Choose your Bonus Points team</h2>
                <p className="text-[11px] text-gray-500 mt-0.5">Earn 2× base pts when you correctly predict their result (win, draw or loss) — Group Stage only</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none p-1"
                aria-label="Close"
              >×</button>
            </div>

            {/* Search */}
            <div className="px-4 py-2.5 border-b border-gray-100 flex-shrink-0">
              <input
                ref={inputRef}
                type="text"
                placeholder="Search teams…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400 bg-gray-50"
              />
            </div>

            {/* Flag grid */}
            <div className="overflow-y-auto flex-1 px-3 py-3">
              {filtered.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No teams match "{query}"</p>
              ) : (
                <div className="grid grid-cols-6 gap-1.5">
                  {filtered.map(t => {
                    const isSelected = t.name === value
                    return (
                      <button
                        key={t.name}
                        type="button"
                        onClick={() => pick(t)}
                        title={t.name}
                        className={`flex flex-col items-center gap-0.5 rounded-xl p-2 transition-colors
                          ${isSelected
                            ? 'bg-purple-100 ring-2 ring-purple-500'
                            : 'hover:bg-gray-100 active:bg-gray-200'
                          }`}
                      >
                        <span className="text-2xl leading-none">{t.flag_emoji}</span>
                        <span className={`text-[9px] font-semibold leading-tight text-center truncate w-full
                          ${isSelected ? 'text-purple-700' : 'text-gray-500'}`}>
                          {t.fifa_code}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            {value && (
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
                <span className="text-xs text-gray-600">
                  Selected: <strong>{selected?.flag_emoji} {selected?.name}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => { onSelect(''); setOpen(false) }}
                  className="text-xs text-red-500 hover:text-red-700 font-medium"
                >
                  Clear selection
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
