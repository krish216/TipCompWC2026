'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUserPrefs, type Tournament } from '@/components/layout/UserPrefsContext'
import { Spinner } from '@/components/ui'
import { isPracticeSlug } from '@/lib/sweep/practice'

const startsLabel = (t: Tournament): string =>
  t.start_date ? `Starts ${new Date(`${t.start_date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'Upcoming'

// A tournament is over once its end_date has passed (a plain date → end of that UTC day).
const hasEnded = (t: Tournament | null): boolean =>
  t?.end_date ? new Date(`${t.end_date}T23:59:59Z`).getTime() < Date.now() : false

// Shared "switch tournament" bottom sheet — used by both CountdownBanner (its own bespoke
// trigger button) and TournamentSwitcher below (a smaller, standalone trigger for pages
// that don't want the full countdown banner, e.g. /sweep).
export function TournamentSheet({ tournaments, currentId, onPick, onClose }: {
  tournaments: Tournament[]; currentId: string | null
  onPick: (id: string) => Promise<void> | void; onClose: () => void
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  // Upcoming sweeps the user ISN'T already in. Sweeps (Melbourne Cup etc.) deliberately
  // never join the tournament rotation (they stay is_active=false forever; see migration
  // 188), so `tournaments` only carries one for a member. These extra rows open /sweep
  // rather than switching the global tournament — that keeps the football context intact.
  const [extraSweeps, setExtraSweeps] = useState<Tournament[]>([])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    fetch('/api/tournaments')
      .then(r => r.json())
      .then(({ data }) => {
        const known = new Set(tournaments.map(t => t.id))
        setExtraSweeps(((data ?? []) as Tournament[])
          .filter(t => t.format === 'sweep' && !known.has(t.id) && !hasEnded(t))
          .sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? '')))
      })
      .catch(() => {})
  }, [tournaments])

  const openSweep = () => { onClose(); router.push('/sweep') }

  const choose = async (id: string) => {
    if (id === currentId) { onClose(); return }
    setBusyId(id)
    try { await onPick(id) } finally { onClose() }
  }

  const now = Date.now()
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col justify-end sm:justify-center sm:items-center"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white w-full sm:w-[420px] sm:max-w-[96vw] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[70vh]">
        <div className="sm:hidden flex justify-center pt-3 pb-1 flex-shrink-0"><div className="w-10 h-1 rounded-full bg-gray-300" /></div>
        <div className="flex items-center justify-between px-4 pt-2 pb-3 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">Switch tournament</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none p-1" aria-label="Close">×</button>
        </div>
        <div className="overflow-y-auto p-2">
          {/* One plain list of tournaments: the user's own (football, plus any sweep they're
              in, which switches like any other), then upcoming sweeps they're not in yet. */}
          {/* The practice sweep (migration 200) isn't a real event — it lives in /sweep's
              "My practice sweeps" card, never in the tournament list. */}
          {[...tournaments, ...extraSweeps].filter(t => !isPracticeSlug((t as any).slug)).map(t => {
            const isExtra = extraSweeps.includes(t)
            const isSweep = t.format === 'sweep'
            const ended = hasEnded(t)
            const started = t.start_date ? new Date(`${t.start_date}T00:00:00Z`).getTime() <= now : true
            const isCur = t.id === currentId
            const statusLabel = ended
              ? '✓ Complete'
              : isSweep
              ? (started ? '● Race day' : `Race day ${new Date(`${t.start_date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`)
              : started ? '● Live' : startsLabel(t)
            return (
              <button key={t.id} type="button"
                onClick={() => isExtra && !isCur ? openSweep() : choose(t.id)} disabled={!!busyId}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors disabled:opacity-60 ${isCur ? 'bg-emerald-50' : isSweep ? 'hover:bg-amber-50' : 'hover:bg-gray-50'}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {t.logo_url
                  ? <img src={t.logo_url} alt="" className="w-8 h-8 rounded object-contain flex-shrink-0" />
                  : <span className="w-8 h-8 flex items-center justify-center text-lg flex-shrink-0">{isSweep ? '🐎' : '⚽'}</span>}
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-gray-900 truncate">{t.name}</span>
                  <span className={`text-[11px] font-semibold ${ended ? 'text-gray-400' : started ? 'text-red-500' : 'text-gray-400'}`}>{statusLabel}</span>
                </span>
                {busyId === t.id ? <Spinner className="w-4 h-4" />
                  : isCur ? <span className="text-emerald-600 font-bold flex-shrink-0">✓</span>
                  : isExtra ? <span className="text-gray-400 flex-shrink-0">→</span>
                  : null}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// A small, standalone "switch tournament" trigger + sheet — for pages that don't render
// (or shouldn't render) the full CountdownBanner, e.g. /sweep, where a race-countdown UI
// makes no sense but someone still needs a way back to their football tournament. Renders
// nothing if there's nothing to switch to (e.g. logged out, or only one tournament).
export function TournamentSwitcher({ className = '', current, leaveOnPick = false, chip = false }: {
  className?: string
  // A small "Switch ⇄" chip for a dark card (the sweep card on /tribe), instead of the
  // labelled button — the card already names the tournament.
  chip?: boolean
  // Overrides the global selection for DISPLAY only (label + which row gets the ✓ in the
  // sheet) — doesn't touch selectedTournId/user_preferences. For a page like /sweep that has
  // its own specific tournament context (resolved via /api/sweep/context) which is
  // deliberately never written to the global "one active tournament" state, this is what
  // makes the switcher say "Melbourne Cup" instead of whatever the user's last football
  // pick happened to be.
  current?: { id: string; name: string }
  // For a page that isn't about any football tournament at all (e.g. /sweep's browse view,
  // with no sweep of the user's to pin as `current`): ANY pick — including the one already
  // selected globally — means "take me to that tournament", so always go home, and don't ✓
  // the global pick as if the user were already looking at it.
  leaveOnPick?: boolean
}) {
  const router = useRouter()
  let selectedTourn: Tournament | null = null
  let tournaments: Tournament[] = []
  let pick: ((id: string) => Promise<void> | void) | null = null
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const prefs = useUserPrefs()
    selectedTourn = prefs.selectedTourn
    tournaments   = prefs.activeTournaments
    pick          = prefs.pickTournament
  } catch { /* no context (e.g. logged out) */ }

  const [sheet, setSheet] = useState(false)
  if (!pick || (tournaments.length === 0 && !current)) return null

  const currentId   = current?.id   ?? selectedTourn?.id   ?? null
  const currentName = current?.name ?? selectedTourn?.name ?? 'Switch tournament'

  // When `current` is supplied, this page is tied to one specific tournament (e.g. /sweep)
  // — picking a DIFFERENT one switches the global context away from it, so staying on this
  // page would show stale content against a now-mismatched nav/context. Bounce home, same
  // as the opposite direction (My Comps → /sweep) already does for a sweep selection.
  // Pages without `current` (the CountdownBanner-driven ones) are generic across any
  // football tournament and just re-render in place — no navigation needed there.
  const handlePick = async (id: string) => {
    await pick!(id)
    if (leaveOnPick || (current && id !== current.id)) router.push('/')
  }
  const sheetCurrentId = leaveOnPick && !current ? null : currentId

  return (
    <>
      {chip ? (
        <button type="button" onClick={() => setSheet(true)} aria-label="Switch tournament"
          className={`flex-shrink-0 text-[10px] font-bold text-white bg-white/15 border border-white/25 hover:bg-white/25 rounded-full px-2 py-0.5 leading-none ${className}`}>
          Switch ⇄
        </button>
      ) : (
        <button type="button" onClick={() => setSheet(true)}
          className={`inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 border border-emerald-300 rounded-full px-3 py-1.5 hover:bg-emerald-50 transition-colors ${className}`}>
          {current ? '🐎' : '🏆'} {currentName}
          <span className="text-emerald-700 font-bold">· Switch ⇄</span>
        </button>
      )}
      {sheet && (
        <TournamentSheet tournaments={tournaments} currentId={sheetCurrentId} onPick={handlePick} onClose={() => setSheet(false)} />
      )}
    </>
  )
}
