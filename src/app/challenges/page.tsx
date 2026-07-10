'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'
import { Spinner } from '@/components/ui'
import { Flag } from '@/components/ui/Flag'
import { CountdownBanner } from '@/components/game/CountdownBanner'

interface MatchResult { final: string; pred: string; points: number; exact: boolean; rank: number; total: number }
interface MatchC {
  slug: string; name: string; href: string; sponsor: { name: string; prize: string } | null
  state: 'open' | 'completed'; entered: boolean; result: MatchResult | null
  home_image: string | null; away_image: string | null; home_team: string | null; away_team: string | null
}
interface Hub {
  tournament: { slug: string; name: string } | null
  flagship: { type: 'predictor' | 'bracket'; href: string; label: string; blurb: string; entered: boolean } | null
  matches: MatchC[]
  logged_in: boolean
}

type TabKey = 'bracket' | 'top-bottom' | 'match'
const TAB_META: Record<TabKey, { label: string; icon: string }> = {
  bracket: { label: 'Bracket', icon: '🥊' },
  'top-bottom': { label: 'Top-Bottom', icon: '🪜' },
  match: { label: 'Match', icon: '🆚' },
}

export default function ChallengesHub() {
  const { selectedTourn } = useUserPrefs()
  const [hub, setHub] = useState<Hub | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabKey | null>(null)

  useEffect(() => {
    setLoading(true)
    setTab(null)
    const qs = selectedTourn?.slug ? `?tournament=${encodeURIComponent(selectedTourn.slug)}` : ''
    fetch(`/api/challenges/hub${qs}`, { cache: 'no-store' })
      .then(r => r.json()).then(setHub).catch(() => setHub(null)).finally(() => setLoading(false))
  }, [selectedTourn?.slug])

  // Which tabs apply to this tournament, in a fixed order.
  const tabs = useMemo<TabKey[]>(() => {
    const t: TabKey[] = []
    if (hub?.flagship?.type === 'bracket') t.push('bracket')
    if (hub?.flagship?.type === 'predictor') t.push('top-bottom')
    if ((hub?.matches?.length ?? 0) > 0) t.push('match')
    return t
  }, [hub])

  // Land on Match by default (the actionable, time-sensitive challenges); fall back to
  // the flagship tab when there are no open match challenges.
  const active = tab ?? (tabs.includes('match') ? 'match' : tabs[0]) ?? null

  if (loading) return <div className="flex justify-center py-24"><Spinner className="w-7 h-7" /></div>

  const flagship = hub?.flagship
  const matches = hub?.matches ?? []
  const openMatches = matches.filter(m => m.state === 'open')
  const doneMatches = matches.filter(m => m.state === 'completed')

  return (
    <div className="max-w-xl mx-auto px-4 py-6 pb-24">
      <CountdownBanner />
      <h1 className="text-2xl font-black text-gray-900">Challenges</h1>
      {hub?.tournament && <p className="text-sm text-gray-500 mt-0.5">{hub.tournament.name}</p>}

      {tabs.length === 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center">
          <div className="text-4xl mb-2">🎯</div>
          <p className="text-sm text-gray-500">No challenges open right now — check back soon.</p>
        </div>
      )}

      {/* Tabs */}
      {tabs.length > 0 && (
        <div className="flex gap-2 mt-5 border-b border-gray-200">
          {tabs.map(k => (
            <button key={k} onClick={() => setTab(k)}
              className={
                'relative -mb-px px-4 py-2.5 text-sm font-bold transition-colors ' +
                (k === active
                  ? 'text-emerald-700 border-b-2 border-emerald-600'
                  : 'text-gray-400 border-b-2 border-transparent hover:text-gray-600')
              }>
              {TAB_META[k].icon} {TAB_META[k].label}
              {k === 'match' && openMatches.length > 0 && <span className="ml-1 text-[11px] font-black text-gray-400">{openMatches.length}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Flagship tab (bracket / top-bottom) */}
      {flagship && (active === 'bracket' || active === 'top-bottom') && (
        <Link href={flagship.href}
          className="block mt-5 rounded-2xl overflow-hidden shadow-lg" style={{ background: 'linear-gradient(160deg,#0a2e1c 0%,#153d26 55%,#0d3320 100%)' }}>
          <div className="px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">Flagship challenge</p>
              {flagship.entered && <span className="text-[10px] font-black uppercase tracking-wide text-emerald-950 bg-emerald-400 px-2 py-0.5 rounded-full">✓ You're in</span>}
            </div>
            <p className="text-xl font-black text-white mt-1.5">{TAB_META[active].icon} {flagship.label}</p>
            <p className="text-sm text-white/70 mt-1 leading-snug">{flagship.blurb}</p>
            <span className="mt-3 inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">
              {flagship.entered ? 'View / edit my picks →' : 'Play now →'}
            </span>
          </div>
        </Link>
      )}

      {/* Match tab */}
      {active === 'match' && (
        <div className="mt-5">
          {openMatches.length > 0 ? (
            <div className="space-y-2.5">{openMatches.map(m => <MatchCard key={m.slug} m={m} />)}</div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">No open match challenges right now.</p>
          )}

          {doneMatches.length > 0 && <CompletedMatches items={doneMatches} />}
        </div>
      )}

      <p className="text-center text-[11px] text-gray-400 mt-8">
        In a private comp? See your comp&apos;s challenge results under <Link href="/tribe?tab=challenges" className="text-emerald-600 underline">My Tribe → Challenges</Link>.
      </p>
    </div>
  )
}

// A team's visual on a match card: the sponsor's custom image if set, else its flag.
function TeamViz({ image, team }: { image: string | null; team: string | null }) {
  if (image) return <img src={image} alt={team ?? ''} className="w-9 h-9 rounded-lg object-cover border border-black/5" />
  if (team)  return <Flag team={team} className="text-[26px] rounded shadow-sm" />
  return null
}

// ── Match challenge card ────────────────────────────────────────────────────────
function MatchCard({ m }: { m: MatchC }) {
  const done = m.state === 'completed'
  const r = m.result
  return (
    <Link href={m.href}
      className={
        'block rounded-xl border px-4 py-3.5 transition-colors ' +
        (done
          ? 'border-gray-200 bg-gray-50 hover:border-gray-300'
          : m.entered
            ? 'border-emerald-300 bg-emerald-50/70 hover:border-emerald-400'
            : 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white hover:border-emerald-300')
      }>
      <div className="flex items-center gap-3">
        {(m.home_team || m.away_team || m.home_image || m.away_image) && (
          <div className={'flex items-center gap-1.5 flex-shrink-0 ' + (done ? 'opacity-60' : '')}>
            <TeamViz image={m.home_image} team={m.home_team} />
            <span className="text-[10px] font-bold text-gray-400">v</span>
            <TeamViz image={m.away_image} team={m.away_team} />
          </div>
        )}
        <p className={'flex-1 min-w-0 text-sm font-bold ' + (done ? 'text-gray-600' : 'text-gray-900')}>{m.name}</p>
        {!done && m.entered && <span className="flex-shrink-0 text-[10px] font-black uppercase tracking-wide text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">✓ Entered</span>}
      </div>
      {m.sponsor?.name && (
        <p className={'text-[11px] font-semibold mt-0.5 ' + (done ? 'text-gray-400' : 'text-amber-700')}>🤝 {m.sponsor.name}{m.sponsor.prize ? <> · win <span className={done ? '' : 'text-amber-800'}>{m.sponsor.prize}</span></> : ''}</p>
      )}

      {/* Completed: your result, inline */}
      {done && r ? (
        <div className="mt-2 flex items-center flex-wrap gap-x-3 gap-y-1 text-xs">
          <span className="font-semibold text-gray-700">Final <span className="font-black tabular-nums">{r.final}</span></span>
          <span className="text-gray-400">·</span>
          <span className="text-gray-500">you tipped <span className="font-bold tabular-nums text-gray-700">{r.pred}</span></span>
          {r.exact && <span className="text-[10px] font-black uppercase text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">Exact ✓</span>}
          <span className="ml-auto flex items-center gap-2">
            <span className="font-black tabular-nums text-emerald-700">{r.points} pt{r.points === 1 ? '' : 's'}</span>
            <span className="text-gray-400 tabular-nums">#{r.rank}/{r.total}</span>
          </span>
        </div>
      ) : (
        <span className={'text-xs font-bold mt-1 inline-block ' + (done ? 'text-gray-500' : 'text-emerald-600')}>
          {done ? 'View result →' : m.entered ? 'Edit my pick →' : 'Pick the score →'}
        </span>
      )}
    </Link>
  )
}

// ── Your completed entries (collapsed by default) ───────────────────────────────
function CompletedMatches({ items }: { items: MatchC[] }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="mt-6">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-wider text-gray-400 hover:text-gray-600 transition-colors">
        <span>Your results · {items.length}</span>
        <span className={'transition-transform ' + (open ? 'rotate-180' : '')}>▾</span>
      </button>
      {open && <div className="space-y-2.5 mt-2.5">{items.map(m => <MatchCard key={m.slug} m={m} />)}</div>}
    </section>
  )
}
