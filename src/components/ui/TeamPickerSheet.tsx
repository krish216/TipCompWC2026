'use client'

import { useState, useEffect, useRef } from 'react'
import { TeamBadge } from '@/components/game/TeamBadge'

interface Team {
  name:       string
  fifa_code:  string
  flag_emoji: string
  logo_url?:  string | null   // club crest (EPL); when absent the flag emoji is used
}

interface Props {
  open:         boolean
  onClose:      () => void
  teams:        Team[]
  value:        string | null
  onSelect:     (team: string) => void
  title?:       string
  subtitle?:    string
}

export function TeamPickerSheet({ open, onClose, teams, value, onSelect, title = 'Choose a team', subtitle }: Props) {
  const [query,    setQuery]   = useState('')
  const inputRef               = useRef<HTMLInputElement>(null)

  const selected = teams.find(t => t.name === value) ?? null

  const filtered = query.trim()
    ? teams.filter(t =>
        t.name.toLowerCase().includes(query.toLowerCase()) ||
        t.fifa_code.toLowerCase().includes(query.toLowerCase())
      )
    : teams

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 60)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col justify-end sm:justify-center sm:items-center"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white w-full sm:w-[480px] sm:max-w-[96vw] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[82vh] sm:max-h-[70vh]">

        {/* Handle (mobile) */}
        <div className="sm:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-2 pb-3 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none p-1" aria-label="Close">×</button>
        </div>

        {/* Search */}
        <div className="px-4 py-2.5 border-b border-gray-100 flex-shrink-0">
          <input ref={inputRef} type="text" placeholder="Search teams…"
            value={query} onChange={e => setQuery(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-400 bg-gray-50" />
        </div>

        {/* Flag grid */}
        <div className="overflow-y-auto flex-1 px-3 py-3">
          {filtered.length === 0
            ? <p className="text-sm text-gray-400 text-center py-8">No teams match &ldquo;{query}&rdquo;</p>
            : (
              <div className="grid grid-cols-6 gap-1.5">
                {filtered.map(t => {
                  const isSelected = t.name === value
                  return (
                    <button key={t.name} type="button"
                      onClick={() => { onSelect(t.name); onClose() }}
                      title={t.name}
                      className={`flex flex-col items-center gap-0.5 rounded-xl p-2 transition-colors
                        ${isSelected ? 'bg-sky-100 ring-2 ring-sky-500' : 'hover:bg-gray-100 active:bg-gray-200'}`}>
                      <TeamBadge flag={t.flag_emoji} logo={t.logo_url} name={t.name} size={28} className="rounded-sm" />
                      <span className={`text-[9px] font-semibold leading-tight text-center truncate w-full
                        ${isSelected ? 'text-sky-700' : 'text-gray-500'}`}>
                        {t.fifa_code}
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          }
        </div>

        {/* Footer */}
        {value && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
            <span className="text-xs text-gray-600">
              Selected: {selected && <TeamBadge flag={selected.flag_emoji} logo={selected.logo_url} name={selected.name} size={16} className="mr-1 rounded-sm" />}<strong>{selected?.name}</strong>
            </span>
            <button type="button" onClick={() => { onSelect(''); onClose() }}
              className="text-xs text-red-500 hover:text-red-700 font-medium">
              Clear
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
