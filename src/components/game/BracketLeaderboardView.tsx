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

function LeaderboardList({ data, poolLabel, cfg }: { data: Data; poolLabel: string; cfg?: any }) {
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
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold leading-tight" style={{ color: ink }}>{poolLabel}</p>
                <p className="text-[10px] sm:text-xs mt-0.5" style={{ color: ink, opacity: 0.72 }}>presented by {cfg.sponsor_name}</p>
              </div>
            </div>
          )
        })()}
        <div className="grid grid-cols-[36px_1fr_56px] gap-2 px-3 py-2 bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-wide">
          <span className="text-center">#</span><span>Player · top 12</span><span className="text-right">Pts</span>
        </div>
        {data.entries.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-8">No entries yet.</p>
        ) : data.entries.map(e => <Row key={e.user_id} e={e} isMe={data.me?.user_id === e.user_id} />)}

        {/* Your position row when outside the top 12 */}
        {data.me && data.me.rank > 12 && (
          <>
            <div className="text-center text-gray-300 py-1">⋯</div>
            <Row e={data.me} isMe />
          </>
        )}
      </div>

      <p className="text-[11px] text-gray-400 text-center mt-3">
        {data.total_entrants} bracket{data.total_entrants === 1 ? '' : 's'} entered · {poolLabel}
      </p>
    </>
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
              {cfg.sponsor_name && <span className="text-xs sm:text-sm font-bold text-white">{cfg.sponsor_name}</span>}
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
          <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-600">🔒 Entries closed — the knockouts have started.</div>
        ) : es.entered ? (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800 flex items-start justify-between gap-2">
            <span className="min-w-0">✓ You&apos;re in the draw! Tie-breakers — Final <strong>{es.entry?.final_goals}</strong> goal{es.entry?.final_goals === 1 ? '' : 's'} · 3rd place <strong>{es.entry?.tp_goals}</strong> goal{es.entry?.tp_goals === 1 ? '' : 's'}.</span>
            <button onClick={() => { setEditingEntry(true); setShowEnter(true) }} className="flex-shrink-0 font-semibold underline hover:text-emerald-900">Edit</button>
          </div>
        ) : (
          // Not yet entered (guest, no bracket, or bracket-ready): explain the loop
          // and link to the builder. The slug travels with the link so finishing
          // there enters THIS challenge and lands the player on this board.
          <div className="mb-4 rounded-2xl border-2 border-emerald-300 bg-emerald-50 overflow-hidden">
            <div className="px-4 pt-3 pb-2">
              <p className="text-sm font-extrabold text-emerald-900">🏆 How to get on this leaderboard</p>
              <ol className="mt-1.5 text-[12px] text-emerald-800 space-y-0.5 list-decimal list-inside">
                <li>
                  <Link href={bracketHref} className="font-bold text-emerald-700 underline hover:text-emerald-800">
                    Build your bracket{cfg?.sponsor_name ? ` with ${cfg.sponsor_name}` : ''} now{cfg?.prize ? ' for a chance to win' : ''} →
                  </Link>
                </li>
                <li>Enter the <strong>{challengeName}</strong>{cfg?.prize ? <> for a shot at <strong className="text-emerald-700">{cfg.prize}</strong></> : null}</li>
                <li>Score points all tournament — your name appears right here</li>
              </ol>
            </div>
            <div className="px-4 pb-3 pt-1">
              {!es.logged_in ? (
                <>
                  <Link href={bracketHref} className="block text-center px-4 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white">Build your bracket →</Link>
                  <p className="text-center text-[11px] text-emerald-700 mt-2">No account needed to start · <a href="/login" className="underline font-semibold">log in</a> if you already have one</p>
                </>
              ) : !es.has_bracket ? (
                <>
                  <Link href={bracketHref} className="block text-center px-4 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white">Finish your bracket →</Link>
                  <p className="text-center text-[11px] text-emerald-700 mt-2">Pick your champion to complete it, then enter.</p>
                </>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] text-emerald-700 min-w-0">Your bracket&apos;s ready · {es.closes_at ? `entries ${closesLabel(es.closes_at)}` : 'open now'}</p>
                  <button onClick={() => setShowEnter(true)} className="flex-shrink-0 px-4 py-2 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white">Enter to win →</button>
                </div>
              )}
            </div>
          </div>
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

          {/* Segmented toggle — only when the caller has a bracket to show. */}
          {data.me ? (
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
          onClose={() => { setShowEnter(false); setEditingEntry(false) }}
          onEntered={() => { setShowEnter(false); setEditingEntry(false); loadBoard(resolvedSlug) }}
        />
      )}
    </div>
  )
}
