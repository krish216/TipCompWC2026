'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { clsx } from 'clsx'
import { Avatar, Medal, Spinner } from '@/components/ui'
import { AdSlot } from '@/components/ui/AdSlot'
import { BracketEntryModal } from '@/components/game/BracketEntryModal'
import { SponsorLogoMark } from '@/components/game/SponsorLogoMark'
import { Flag } from '@/components/ui/Flag'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'

type RoundKey = 'r32' | 'r16' | 'qf' | 'sf' | 'tp' | 'final'
interface Entry {
  user_id: string; display_name: string; avatar_url: string | null; total: number; rank: number
  by_round: Record<RoundKey, number>; correct: Record<RoundKey, number>
}
interface SlotCard {
  slot: string; round: RoundKey; pick: string | null
  winner: string | null; loser: string | null; played: boolean; correct: boolean; points: number
}
interface Data {
  entries: Entry[]; total_entrants: number; me: Entry | null; max: number; scoring_started: boolean; simulated?: boolean
  full?: boolean   // true → entries is the complete field (sponsored board), not a top-12 cut
  scorecard?: SlotCard[] | null
  champion?: { team: string; status: 'in' | 'out' | 'won' } | null
  challenge?: { slug: string; name: string } | null
}

const ROUND_META: { key: RoundKey; label: string; outOf: number; pts: number }[] = [
  { key: 'r32', label: 'R32', outOf: 16, pts: 1 },
  { key: 'r16', label: 'R16', outOf: 8,  pts: 2 },
  { key: 'qf',  label: 'QF',  outOf: 4,  pts: 4 },
  { key: 'sf',  label: 'SF',  outOf: 2,  pts: 8 },
  { key: 'tp',  label: '3rd', outOf: 1,  pts: 4 },
  { key: 'final', label: 'Final', outOf: 1, pts: 12 },
]

const norm = (s?: string | null) => (s ?? '').trim().toLowerCase()

// Adapts the resolved-config shape to the shared SponsorLogoMark.
function CfgLogoMark({ cfg, surface, className }: { cfg: any; surface: 'dark' | 'light'; className?: string }) {
  return <SponsorLogoMark logo={cfg?.sponsor_logo} name={cfg?.sponsor_name} logoTone={cfg?.logo_tone} surface={surface} className={className} />
}

// Readable ink for a sponsor banner: dark slate on a light brand colour, white on a
// dark one (sRGB luminance). Falls back to white for the default dark-green banner.
function readableInk(hex?: string | null): string {
  const m = (hex ?? '').replace('#', '').match(/^([0-9a-fA-F]{6})$/)
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.6 ? '#0f172a' : '#ffffff'
}

// One match within an expanded round, framed from the player's pick.
function MatchRow({ s }: { s: SlotCard }) {
  let subject = s.pick, verb: string | null = null, object: string | null = null, note: string | null = null
  if (!s.played) {
    return (
      <div className="grid grid-cols-[1fr_auto] gap-2 items-center px-4 py-2.5 border-b border-gray-50 last:border-0">
        <span className="text-sm text-gray-500 truncate">{s.pick ? <><Flag team={s.pick} className="text-sm mr-1 rounded-sm" /><span className="font-medium text-gray-700">{s.pick}</span></> : <span className="italic text-gray-400">No pick</span>}</span>
        <span className="text-xs font-semibold text-gray-400">to play</span>
      </div>
    )
  }
  if (s.correct) { subject = s.pick; verb = 'def.'; object = s.loser }
  else if (s.pick && norm(s.pick) === norm(s.loser)) { subject = s.pick; verb = 'lost to'; object = s.winner }
  else { subject = s.winner; verb = s.loser ? 'def.' : null; object = s.loser; note = s.pick ? `your pick: ${s.pick}` : 'no pick' }

  return (
    <div className="grid grid-cols-[1fr_auto] gap-2 items-center px-4 py-2.5 border-b border-gray-50 last:border-0">
      <div className="min-w-0 text-sm truncate">
        <span><Flag team={subject} className="text-sm mr-1 rounded-sm" /><span className="font-semibold text-gray-900">{subject}</span></span>
        {verb && object && <span className="text-gray-400"> {verb} <Flag team={object} className="text-sm mx-0.5 rounded-sm" /><span className="text-gray-500">{object}</span></span>}
        {note && <span className="block text-[11px] text-gray-400 truncate">{note}</span>}
      </div>
      {s.correct
        ? <span className="text-sm font-bold text-emerald-600 whitespace-nowrap">✓ +{s.points}</span>
        : <span className="text-sm font-semibold text-gray-300 whitespace-nowrap">✗ 0</span>}
    </div>
  )
}

function closesLabel(iso: string): string {
  const d = new Date(iso)
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000)
  const date = d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
  return days > 1 ? `close ${date} · ${days} days` : `close ${date}`
}

// The signed-in entrant's drill-in scorecard: score, rank, champion status,
// tie-breakers, and a tap-to-expand match-by-match breakdown per round.
function MeScorecard({ me, champion, scorecard, max, totalEntrants, entry }: {
  me: Entry; champion?: Data['champion']; scorecard?: SlotCard[] | null
  max: number; totalEntrants: number; entry?: any
}) {
  const [open, setOpen] = useState<RoundKey | null>(null)
  const pct = totalEntrants > 0 ? Math.max(1, Math.round((me.rank / totalEntrants) * 100)) : null

  const champBadge = champion && (
    champion.status === 'won' ? <span className="font-bold text-amber-600">champion 🏆</span>
    : champion.status === 'out' ? <span className="font-bold text-gray-400">knocked out ❌</span>
    : <span className="font-bold text-emerald-600">still in ✅</span>
  )

  return (
    <div className="mb-4 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Score + rank */}
      <div className="flex items-end justify-between px-4 pt-4 pb-3">
        <div className="leading-none">
          <span className="text-4xl font-black text-emerald-600">{me.total}</span>
          <span className="text-base font-bold text-gray-400"> / {max} pts</span>
        </div>
        <div className="text-right leading-tight">
          <p className="text-2xl font-black text-gray-900">#{me.rank}</p>
          <p className="text-[11px] font-semibold text-gray-500">of {totalEntrants}{pct !== null && <> · top {pct}%</>}</p>
        </div>
      </div>

      {/* Champion pick + live status */}
      {champion && (
        <div className="mx-4 mb-3 rounded-xl bg-gray-50 px-3 py-2.5 text-sm flex items-center gap-2">
          <span>🏆</span>
          <span className="text-gray-500">Champion pick:</span>
          <span className="font-bold text-gray-900 inline-flex items-center gap-1"><Flag team={champion.team} className="text-base rounded-sm" />{champion.team}</span>
          <span className="text-gray-300">—</span>
          {champBadge}
        </div>
      )}

      {entry && (entry.final_goals != null || entry.tp_goals != null) && (
        <p className="px-4 -mt-1 mb-3 text-[11px] text-gray-400">
          Tie-break (if level on points): your predicted <strong className="text-gray-500">Final {entry.final_goals} goal{entry.final_goals === 1 ? '' : 's'}</strong> · <strong className="text-gray-500">3rd place {entry.tp_goals} goal{entry.tp_goals === 1 ? '' : 's'}</strong>.
        </p>
      )}

      <p className="px-4 pb-2 text-[11px] text-gray-400">📋 Tap a round to see your match-by-match picks ↓</p>

      {/* Round rows */}
      <div className="border-t border-gray-100">
        {ROUND_META.map(({ key, label, outOf, pts }) => {
          const earned   = me.by_round[key]
          const correct  = me.correct[key]
          const maxRound = outOf * pts
          const slots    = (scorecard ?? []).filter(s => s.round === key)
          const played   = slots.filter(s => s.played).length
          const allPlayed = slots.length > 0 && played === outOf
          const isOpen   = open === key
          const hasDetail = slots.length > 0
          return (
            <div key={key} className={clsx('border-b border-gray-100 last:border-0', isOpen && 'bg-emerald-50/40')}>
              <button
                onClick={() => hasDetail && setOpen(isOpen ? null : key)}
                className="w-full grid grid-cols-[1fr_auto] gap-3 items-center px-4 py-3 text-left">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-gray-400 text-xs w-3">{hasDetail ? (isOpen ? '▾' : '▸') : '·'}</span>
                    <span className="font-bold text-gray-800">{label}</span>
                    <span className="text-[11px] text-gray-400">{played < outOf ? (played === 0 ? 'to play' : `${correct} / ${outOf} · ${outOf - played} to play`) : `${correct} / ${outOf} correct`}</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden ml-5">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${outOf ? (correct / outOf) * 100 : 0}%` }} />
                  </div>
                </div>
                <span className={clsx('text-sm font-extrabold whitespace-nowrap', earned > 0 ? 'text-emerald-600' : 'text-gray-300')}>
                  +{earned}{!allPlayed && <span className="text-gray-300 font-bold"> / {maxRound}</span>}
                </span>
              </button>
              {isOpen && hasDetail && (
                <div className="bg-white mx-3 mb-3 rounded-xl border border-gray-100 overflow-hidden">
                  {slots.map(s => <MatchRow key={s.slot} s={s} />)}
                  <div className="px-4 py-2 bg-gray-50 text-[11px] text-gray-500">{label}: <strong>{correct} / {outOf} correct</strong> · +{earned} pts ({pts} pt{pts === 1 ? '' : 's'} each)</div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Row({ e, isMe }: { e: Entry; isMe: boolean }) {
  return (
    <div className={clsx('grid grid-cols-[36px_1fr_56px] gap-2 items-center px-3 py-2.5 border-b border-gray-100 last:border-0', isMe && 'bg-emerald-50')}>
      <div className="flex justify-center"><Medal rank={e.rank} /></div>
      <div className="flex items-center gap-2 min-w-0">
        <Avatar name={e.display_name} src={e.avatar_url} size="xs" />
        <span className={clsx('text-sm font-medium truncate', isMe && 'text-emerald-700')}>{e.display_name}{isMe ? ' (you)' : ''}</span>
      </div>
      <span className="text-right text-sm font-extrabold text-gray-900">{e.total}</span>
    </div>
  )
}

// Sponsor insert below the bracket. Driven by the same per-challenge co-branding
// config as the header. Falls back to the generic AdSlot when no bracket sponsor
// is set; never shown to premium users (the insert space is ad-free for premium).
function BracketSponsorInsert({ cfg }: { cfg: any }) {
  const { isAdFree } = useUserPrefs()
  if (isAdFree) return null

  const hasSponsor = !!(cfg?.enabled && (cfg.sponsor_logo || cfg.sponsor_name))
  if (!hasSponsor) return <AdSlot slot="bracket-infeed" className="mt-4" />

  const inner = (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="flex-shrink-0"><CfgLogoMark cfg={cfg} surface="light" className="h-10 w-auto max-w-[140px]" /></div>
        <div className="min-w-0">
          {cfg.prize
            ? <p className="text-sm font-bold text-gray-900 truncate">🎁 Win <span className="text-emerald-700">{cfg.prize}</span></p>
            : <p className="text-sm font-bold text-gray-900 truncate">{cfg.sponsor_name || 'Our sponsor'}</p>}
          <p className="text-[11px] text-gray-400">Proud sponsor of the Bracket Challenge</p>
        </div>
      </div>
      <p className="text-center text-[9px] uppercase tracking-widest text-gray-400 pb-1.5">Sponsored</p>
    </div>
  )

  return (
    <div className="mt-4">
      {cfg.sponsor_url
        ? <a href={cfg.sponsor_url} target="_blank" rel="noopener noreferrer sponsored" className="block">{inner}</a>
        : inner}
    </div>
  )
}

// Sponsored boards list every entrant, paginated.
const SPONSORED_PAGE_SIZE = 50
function LeaderboardList({ data, poolLabel, cfg }: { data: Data; poolLabel: string; cfg?: any }) {
  const [page, setPage] = useState(0)
  const paginated  = !!data.full
  const totalPages = paginated ? Math.max(1, Math.ceil(data.entries.length / SPONSORED_PAGE_SIZE)) : 1
  const safePage   = Math.min(Math.max(0, page), totalPages - 1)
  const shown      = paginated
    ? data.entries.slice(safePage * SPONSORED_PAGE_SIZE, safePage * SPONSORED_PAGE_SIZE + SPONSORED_PAGE_SIZE)
    : data.entries
  const myPage     = data.me ? Math.floor((data.me.rank - 1) / SPONSORED_PAGE_SIZE) : -1
  return (
    <>
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Branded leaderboard header strip — sponsor on the brand colour, flush atop
            the standings. Shown only for sponsored brackets. */}
        {cfg?.enabled && (cfg.sponsor_name || cfg.sponsor_logo) && (() => {
          const brand = cfg.sponsor_brand_color || '#064e3b'
          const ink   = readableInk(cfg.sponsor_brand_color)
          return (
            <div className="flex items-center justify-between gap-3 px-5 py-3.5" style={{ background: brand }}>
              <div className="min-w-0">
                <p className="text-lg sm:text-xl font-black leading-tight uppercase tracking-tight truncate" style={{ color: ink }}>{cfg.sponsor_name}</p>
                {cfg.sponsor_tagline && <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.18em] mt-0.5 truncate" style={{ color: ink, opacity: 0.72 }}>{cfg.sponsor_tagline}</p>}
              </div>
              <div className="text-center flex-shrink-0">
                <p className="text-[10px] uppercase tracking-[0.12em] leading-none mb-0.5" style={{ color: ink, opacity: 0.72 }}>Presents</p>
                <p className="text-sm font-bold leading-tight" style={{ color: ink }}>{poolLabel}</p>
              </div>
            </div>
          )
        })()}
        <div className="grid grid-cols-[36px_1fr_56px] gap-2 px-3 py-2 bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-wide">
          <span className="text-center">#</span><span>Player{data.full ? '' : ' · top 12'}</span><span className="text-right">Pts</span>
        </div>
        {data.entries.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-8">No entries yet.</p>
        ) : shown.map(e => <Row key={e.user_id} e={e} isMe={data.me?.user_id === e.user_id} />)}

        {/* Your position row when you're not already in the shown list (top-12 cut) */}
        {data.me && !data.entries.some(e => e.user_id === data.me!.user_id) && (
          <>
            <div className="text-center text-gray-300 py-1">⋯</div>
            <Row e={data.me} isMe />
          </>
        )}
      </div>

      {/* Pagination — sponsored boards only */}
      {paginated && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-3">
          <button onClick={() => setPage(safePage - 1)} disabled={safePage === 0}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent">← Prev</button>
          <span className="text-xs font-medium text-gray-500">Page {safePage + 1} of {totalPages}</span>
          <button onClick={() => setPage(safePage + 1)} disabled={safePage >= totalPages - 1}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent">Next →</button>
        </div>
      )}
      {paginated && data.me && myPage !== safePage && (
        <p className="text-center text-[11px] text-emerald-700 mt-2">
          You&apos;re <strong>#{data.me.rank}</strong> · <button onClick={() => setPage(myPage)} className="underline font-semibold hover:text-emerald-800">jump to your spot</button>
        </p>
      )}

      <p className="text-[11px] text-gray-400 text-center mt-3">
        {data.total_entrants} bracket{data.total_entrants === 1 ? '' : 's'} entered · {poolLabel}
      </p>
    </>
  )
}

// Step-by-step onboarding for a visitor who hasn't entered yet — mirrors the
// homepage tipster onboarding (dark header band + numbered step list with
// done/now/locked states). Drives the build → enter → leaderboard funnel.
function OnboardingSteps({ es, cfg, champion, challengeName, bracketHref, onEnter }: {
  es: any; cfg: any; champion: string | null; challengeName: string; bracketHref: string; onEnter: () => void
}) {
  const sponsor = cfg?.enabled ? cfg?.sponsor_name : null
  const prize   = cfg?.enabled ? cfg?.prize : null
  const hasBracket = !!es?.has_bracket || !!champion
  // Step states: 1 build, 2 enter, 3 leaderboard.
  const s1: 'done' | 'now' = hasBracket ? 'done' : 'now'
  const s2: 'done' | 'now' | 'locked' = hasBracket ? 'now' : 'locked'

  const circle = (state: 'done' | 'now' | 'locked', n: number) =>
    state === 'done'
      ? <span className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">✓</span>
      : state === 'now'
      ? <span className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">{n}</span>
      : <span className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 text-gray-400 text-xs font-bold">{n}</span>
  const pill = (state: 'done' | 'now' | 'locked') =>
    state === 'done'
      ? <span className="text-[11px] font-semibold text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full ml-auto flex-shrink-0">Done</span>
      : state === 'now'
      ? <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full ml-auto flex-shrink-0">Now</span>
      : <span className="text-[11px] font-semibold text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full ml-auto flex-shrink-0">Locked</span>

  return (
    <div className="mb-4">
      <div className="rounded-2xl overflow-hidden shadow-lg">
        <div style={{ background: 'linear-gradient(160deg,#0a2e1c 0%,#153d26 50%,#0d3320 100%)', padding: '18px 20px 14px' }}>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px' }}>🏆 Get on the{sponsor ? ` ${sponsor}` : ''} leaderboard</p>
          <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>
            {prize ? <>Three steps to go in the draw for <strong style={{ color: '#fcd34d' }}>{prize}</strong>.</> : 'Three quick steps — no account needed to start.'}
          </p>
        </div>
        <div className="bg-white border border-t-0 border-gray-200 rounded-b-2xl divide-y divide-gray-100">
          {/* Step 1 — build bracket */}
          <div className="flex items-center gap-3 px-4 py-3.5">
            {circle(s1, 1)}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">Pick the World Cup 2026 winner</p>
              {s1 === 'done'
                ? <p className="text-[11px] text-gray-500 mt-0.5">{champion ? <>You picked <strong className="text-gray-700">{champion}</strong> 🏆 · <Link href={bracketHref} className="text-emerald-700 underline">edit</Link></> : <>Bracket built · <Link href={bracketHref} className="text-emerald-700 underline">edit</Link></>}</p>
                : <Link href={bracketHref} className="text-[12px] font-bold text-emerald-700 underline hover:text-emerald-800">Build your bracket →</Link>}
            </div>
            {pill(s1)}
          </div>
          {/* Step 2 — enter */}
          <div className="flex items-center gap-3 px-4 py-3.5">
            {circle(s2, 2)}
            <div className="flex-1 min-w-0">
              <p className={clsx('text-sm font-semibold', s2 === 'locked' ? 'text-gray-400' : 'text-gray-900')}>Enter the {challengeName}</p>
              {s2 === 'now'
                ? (es?.logged_in
                    ? <button onClick={onEnter} className="text-[12px] font-bold text-emerald-700 underline hover:text-emerald-800">Enter to win →</button>
                    : <Link href={bracketHref} className="text-[12px] font-bold text-emerald-700 underline hover:text-emerald-800">Enter to win →</Link>)
                : <p className="text-[11px] text-gray-400 mt-0.5">Finish your bracket first</p>}
            </div>
            {pill(s2)}
          </div>
          {/* Step 3 — leaderboard (locked until entered) */}
          <div className="flex items-center gap-3 px-4 py-3.5">
            {circle('locked', 3)}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-400">{prize ? `Climb the board & win ${prize}` : 'Climb the leaderboard'}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Score points all tournament — your name appears here</p>
            </div>
            {pill('locked')}
          </div>
        </div>
      </div>
      {!es?.logged_in && (
        <p className="text-center text-[11px] text-gray-400 mt-2">No account needed to start · <a href="/login" className="underline font-semibold">log in</a> if you already have one</p>
      )}
    </div>
  )
}

// Slim "top 3 + count" leaderboard teaser for visitors who haven't entered —
// social proof without burying the onboarding funnel above it.
function StandingsPeek({ data }: { data: Data }) {
  const top = data.entries.slice(0, 3)
  return (
    <div>
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">Current standings</p>
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {top.length === 0
          ? <p className="text-center text-sm text-gray-400 py-6">No entries yet — be the first on the board! 🏆</p>
          : top.map(e => <Row key={e.user_id} e={e} isMe={false} />)}
      </div>
      <p className="text-[11px] text-gray-400 text-center mt-2">
        {data.total_entrants} bracket{data.total_entrants === 1 ? '' : 's'} entered{data.total_entrants > 3 ? ' · enter to see the full leaderboard' : ''}
      </p>
    </div>
  )
}

// Shared bracket leaderboard. `slug` selects a specific challenge's pool; when
// omitted, the API resolves the tournament's default bracket challenge and tells
// us its slug (used for the entry/config calls so all three agree).
export function BracketLeaderboardView({ slug }: { slug?: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [err,  setErr]  = useState(false)
  const [es,   setEs]   = useState<any | null>(null)   // entry status (/api/bracket/enter)
  const [cfg,  setCfg]  = useState<any | null>(null)   // sponsor co-branding (/api/bracket/config)
  const [showEnter, setShowEnter] = useState(false)
  const [editingEntry, setEditingEntry] = useState(false)   // re-opening the modal to amend an existing entry
  const [tab,  setTab]  = useState<'leaderboard' | 'mine'>('leaderboard')
  const [resolvedSlug, setResolvedSlug] = useState<string | undefined>(slug)
  const [allChallenges, setAllChallenges] = useState<{ slug: string; name: string; entrants: number; sponsor: any }[]>([])
  // A guest's bracket lives in localStorage (the server can't see it), so detect a
  // built bracket here to mark onboarding step 1 done even before they sign in/enter.
  const [localChampion, setLocalChampion] = useState<string | null>(null)
  useEffect(() => {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && /^tribepicks_bracket_[0-9a-f-]{36}$/.test(k)) {
          const picks = JSON.parse(localStorage.getItem(k) || '{}')
          if (picks?.final) { setLocalChampion(picks.final); break }
        }
      }
    } catch { /* no localStorage */ }
  }, [])

  const qp = (s?: string) => (s ? `?challenge=${encodeURIComponent(s)}` : '')
  const loadEntry = (s?: string) => fetch(`/api/bracket/enter${qp(s)}`).then(r => r.json()).then(setEs).catch(() => {})

  // Re-fetch the standings + sponsor config + the caller's entry status for the
  // current challenge. Called on mount AND after entering/withdrawing so the
  // leaderboard list updates in place (no manual refresh needed).
  const loadBoard = (s?: string) =>
    fetch(`/api/bracket/leaderboard${qp(s)}`)
      .then(r => r.json())
      .then((d: Data) => {
        setData(d)
        const rs = d?.challenge?.slug ?? s
        setResolvedSlug(rs)
        fetch(`/api/bracket/config${qp(rs)}`).then(r => r.json()).then(setCfg).catch(() => {})
        loadEntry(rs)
      })
      .catch(() => setErr(true))

  useEffect(() => {
    loadBoard(slug)
    // Sibling challenges — to offer a switcher when several run at once.
    fetch('/api/bracket/challenges').then(r => r.json())
      .then(d => setAllChallenges(Array.isArray(d?.challenges) ? d.challenges : [])).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  const coBranded = !!(cfg?.enabled && (cfg.sponsor_name || cfg.sponsor_logo))
  const challengeName = data?.challenge?.name ?? 'Bracket Challenge'
  const otherChallenges = allChallenges.filter(c => c.slug !== resolvedSlug)
  // Carry the challenge slug to the builder so finishing there routes the entry
  // back to THIS challenge (and the bracket page can link back to this board).
  const bracketHref = resolvedSlug ? `/bracket?challenge=${encodeURIComponent(resolvedSlug)}` : '/bracket'

  // Anchor the sponsor context so the bracket page keeps a link back here even
  // when the user later navigates via the navbar (plain /bracket, no ?challenge=).
  // Only sponsor challenges are anchored — the generic global board isn't.
  useEffect(() => {
    if (resolvedSlug && coBranded) {
      try { localStorage.setItem('tribepicks_bracket_challenge', resolvedSlug) } catch {}
    }
  }, [resolvedSlug, coBranded])

  // A specific slug that resolves to no challenge (obsolete/typo/orphaned link) →
  // show a clean "not found" instead of a hollow, empty leaderboard.
  if (slug && data && !data.challenge) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="text-4xl mb-3">🏆</div>
        <h1 className="text-lg font-bold text-gray-900">Challenge not found</h1>
        <p className="text-sm text-gray-500 mt-1">This bracket challenge doesn&apos;t exist or is no longer available.</p>
        <Link href="/bracket/leaderboard" className="inline-block mt-5 px-4 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white">
          View the Bracket leaderboard →
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 pb-28">
      {coBranded ? (
        <div className="mb-4">
          {/* Green hero — challenge name, sponsor logo, headline prize */}
          <div className="bg-green-900 rounded-2xl px-5 py-6 flex flex-col items-center gap-4 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-3">
            <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight text-center sm:text-left min-w-0">{challengeName}</h1>
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-[8px] uppercase tracking-[0.2em] text-amber-300 whitespace-nowrap">Sponsored by</span>
              {cfg.sponsor_url
                ? <a href={cfg.sponsor_url} target="_blank" rel="noopener noreferrer sponsored" className="inline-flex"><CfgLogoMark cfg={cfg} surface="dark" className="max-h-16 sm:max-h-24 max-w-[160px] sm:max-w-[260px]" /></a>
                : <CfgLogoMark cfg={cfg} surface="dark" className="max-h-16 sm:max-h-24 max-w-[160px] sm:max-w-[260px]" />}
              {cfg.sponsor_name && !cfg.logo_includes_name && <span className="text-xs sm:text-sm font-bold text-white">{cfg.sponsor_name}</span>}
              {cfg.sponsor_tagline && <span className="text-[10px] text-white/70 leading-tight">{cfg.sponsor_tagline}</span>}
            </div>
            <div className="text-center min-w-0">
              {cfg.prize
                ? <p className="text-sm sm:text-base text-green-200">🏆 Win <strong className="text-amber-300 font-bold">{cfg.prize}</strong></p>
                : <p className="text-sm sm:text-base text-green-300">🏆 Predict the knockout bracket</p>}
            </div>
          </div>
          {/* Podium breakdown — 1st/2nd/3rd; each shown only when set. The headline
              total ({cfg.prize}) is already in the hero above. */}
          {(cfg.prize_1 || cfg.prize_2 || cfg.prize_3) && (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs">
              {cfg.prize_1 && <span>🥇 <span className="text-gray-400">1st</span> <strong className="text-gray-800">{cfg.prize_1}</strong></span>}
              {cfg.prize_2 && <span>🥈 <span className="text-gray-400">2nd</span> <strong className="text-gray-800">{cfg.prize_2}</strong></span>}
              {cfg.prize_3 && <span>🥉 <span className="text-gray-400">3rd</span> <strong className="text-gray-800">{cfg.prize_3}</strong></span>}
            </div>
          )}
          <div className="flex items-center justify-between mt-2 px-1">
            <p className="text-xs text-gray-500">max {data?.max ?? 80} pts · <Link href="/bracket/how-it-works" className="underline hover:text-gray-700">how it works</Link></p>
            <Link href={bracketHref} className="text-xs font-semibold text-emerald-600 hover:text-emerald-700">Edit bracket →</Link>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-lg font-bold text-gray-900">🏆 {challengeName}</h1>
            <p className="text-xs text-gray-500 mt-0.5">max {data?.max ?? 80} pts · <Link href="/bracket/how-it-works" className="underline hover:text-gray-700">how it works</Link></p>
          </div>
          <Link href={bracketHref} className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex-shrink-0">Edit bracket →</Link>
        </div>
      )}

      {/* Switch between concurrent challenges — only on the generic (slug-less) hub.
          A sponsor's own URL (/bracket/leaderboard/<slug>) stays dedicated to that
          sponsor and never cross-promotes other challenges. */}
      {!slug && otherChallenges.length > 0 && (
        <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-[11px] font-semibold text-gray-400 whitespace-nowrap">Other challenges:</span>
          {otherChallenges.map(c => (
            <Link key={c.slug} href={`/bracket/leaderboard/${c.slug}`}
              className="whitespace-nowrap text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1 hover:bg-emerald-100">
              {c.sponsor?.name ? `${c.sponsor.name} · ` : ''}{c.name} →
            </Link>
          ))}
        </div>
      )}

      {/* How you get on this board + entry CTA */}
      {es && es.available && (
        es.locked ? (
          <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-600">🔒 Entries closed — the semi-finals have started.</div>
        ) : es.entered ? (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800 flex items-start justify-between gap-2">
            <span className="min-w-0">✓ You&apos;re in the draw! Tie-breakers — Final <strong>{es.entry?.final_goals}</strong> goal{es.entry?.final_goals === 1 ? '' : 's'} · 3rd place <strong>{es.entry?.tp_goals}</strong> goal{es.entry?.tp_goals === 1 ? '' : 's'}.</span>
            <button onClick={() => { setEditingEntry(true); setShowEnter(true) }} className="flex-shrink-0 font-semibold underline hover:text-emerald-900">Edit</button>
          </div>
        ) : (
          // Not yet entered (guest, no bracket, or bracket-ready): a step-by-step
          // onboarding (mirrors the homepage tipster onboarding) that drives the
          // build → enter → leaderboard funnel.
          <OnboardingSteps
            es={es} cfg={cfg} champion={es.champion || data?.champion?.team || localChampion}
            challengeName={challengeName} bracketHref={bracketHref}
            onEnter={() => setShowEnter(true)}
          />
        )
      )}

      {!data && !err && <div className="flex justify-center py-16"><Spinner className="w-7 h-7" /></div>}
      {err && <p className="text-center text-sm text-gray-500 py-16">Couldn&apos;t load the leaderboard.</p>}

      {data && (
        <>
          {data.simulated && (
            <div className="mb-4 rounded-xl border border-purple-300 bg-purple-50 px-3 py-2.5 text-xs font-semibold text-purple-800">
              🧪 Simulation mode — these standings are a test simulation, not live results.
            </div>
          )}
          {!data.scoring_started && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              ⏳ Scoring begins at the <strong>Round of 32</strong> — everyone&apos;s on 0 until the knockouts kick off.
            </div>
          )}

          {/* Entrants see the full board (+ their scorecard). Everyone else gets a
              slim "top 3 + count" peek — social proof without burying the funnel. */}
          {es && !es.entered ? (
            <StandingsPeek data={data} />
          ) : data.me ? (
            <>
              <div className="mb-4 grid grid-cols-2 gap-1 p-1 rounded-xl bg-gray-100">
                {([['leaderboard', 'Leaderboard'], ['mine', 'My scorecard']] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setTab(key)}
                    className={clsx('py-2 rounded-lg text-sm font-bold transition-colors',
                      tab === key ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
                    {label}
                  </button>
                ))}
              </div>

              {tab === 'mine' ? (
                <MeScorecard
                  me={data.me}
                  champion={data.champion}
                  scorecard={data.scorecard}
                  max={data.max}
                  totalEntrants={data.total_entrants}
                  entry={es?.entry}
                />
              ) : (
                <LeaderboardList data={data} poolLabel={challengeName} cfg={cfg} />
              )}
            </>
          ) : (
            <LeaderboardList data={data} poolLabel={challengeName} cfg={cfg} />
          )}

          {/* Sponsor insert / ad space below the bracket (per-challenge config) */}
          <BracketSponsorInsert cfg={cfg} />
        </>
      )}

      {showEnter && (
        <BracketEntryModal
          challenge={resolvedSlug}
          challengeName={data?.challenge?.name}
          editing={editingEntry}
          initial={editingEntry ? { final_goals: es?.entry?.final_goals, tp_goals: es?.entry?.tp_goals, phone: es?.entry?.phone, postcode: es?.entry?.postcode } : undefined}
          hasPrize={!!cfg?.prize}
          sponsorName={cfg?.sponsor_name ?? null}
          sponsorSubsidiary={cfg?.sponsor_tagline ?? null}
          sponsorLogo={cfg?.sponsor_logo ?? null}
          sponsorLogoTone={cfg?.logo_tone ?? null}
          onClose={() => { setShowEnter(false); setEditingEntry(false) }}
          onEntered={() => { setShowEnter(false); setEditingEntry(false); loadBoard(resolvedSlug) }}
        />
      )}
    </div>
  )
}
