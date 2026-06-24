'use client'

import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Spinner, Avatar } from '@/components/ui'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'
import type { TipsterStats } from '@/lib/tipster-stats'
import type { TipReview, TipReviewFixture, PopSplit } from '@/lib/tipster-tips'
import type { BonusStats } from '@/lib/tipster-bonus'
import type { H2H, H2HRival } from '@/lib/tipster-h2h'

// Tipster Pro — "My Stats" dashboard (Phase D). Renders the payload from
// /api/tipster/stats. The API is the single source of gating truth:
//   { pro:false }                  → teaser + Tipster Pro upsell ($6.95 ad-free checkout)
//   { pro:true, ready:false, n }   → "keep tipping" (under the min-scored gate)
//   { pro:true, ready:true, stats} → full dashboard
type ApiResp =
  | { pro: false }
  | { pro: true; ready: false; predictionsMade: number }
  | { pro: true; ready: true; stats: TipsterStats }

const pct = (n: number) => `${Math.round(n * 100)}%`

export default function StatsPage() {
  const { session } = useSupabase()
  const { selectedTournId, selectedCompId, selectedTribeId, tournsComps } = useUserPrefs()
  const [resp, setResp]       = useState<ApiResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [upLoading, setUpLoading] = useState(false)
  const [tab, setTab] = useState<'overview' | 'review' | 'rivals'>('overview')

  // Local comp switcher — scopes the "vs Comp/Tribe" comparisons without touching
  // global app state. Tribe is re-derived per comp.
  const [statsCompId, setStatsCompId]   = useState<string | null>(selectedCompId)
  const [statsTribeId, setStatsTribeId] = useState<string | null>(selectedTribeId)
  useEffect(() => { if (selectedCompId && statsCompId == null) setStatsCompId(selectedCompId) }, [selectedCompId, statsCompId])
  useEffect(() => {
    if (!statsCompId) { setStatsTribeId(null); return }
    if (statsCompId === selectedCompId) { setStatsTribeId(selectedTribeId); return }
    let live = true
    fetch(`/api/tribes?comp_id=${statsCompId}`).then(r => r.json())
      .then(d => { if (live) setStatsTribeId(d?.data?.id ?? null) })
      .catch(() => { if (live) setStatsTribeId(null) })
    return () => { live = false }
  }, [statsCompId, selectedCompId, selectedTribeId])

  useEffect(() => {
    if (!session) { setLoading(false); return }
    if (!selectedTournId) return
    let live = true
    setLoading(true)
    fetch(`/api/tipster/stats?tournament_id=${selectedTournId}`)
      .then(r => r.json())
      .then(d => { if (live) { setResp(d); setLoading(false) } })
      .catch(() => { if (live) { setResp({ pro: false }); setLoading(false) } })
    return () => { live = false }
  }, [session, selectedTournId])

  const unlock = async () => {
    if (!session) { window.location.href = '/login?next=' + encodeURIComponent('/stats'); return }
    if (!selectedTournId) { toast.error('No active tournament — open from your comp.'); return }
    setUpLoading(true)
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournament_id: selectedTournId, kind: 'ad_free' }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error ?? 'Something went wrong'); setUpLoading(false); return }
      window.location.href = d.url
    } catch { toast.error('Network error — please try again'); setUpLoading(false) }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h1 className="text-xl font-extrabold text-gray-900">📊 My Tipster Stats</h1>
          {tournsComps.length > 1 ? (
            <select value={statsCompId ?? ''} onChange={e => setStatsCompId(e.target.value || null)}
              className="shrink-0 max-w-[55%] text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-400">
              {tournsComps.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ) : tournsComps.length === 1 ? (
            <span className="shrink-0 max-w-[55%] truncate text-xs font-semibold text-gray-500 bg-gray-100 rounded-lg px-2.5 py-1.5">🏢 {tournsComps[0].name}</span>
          ) : null}
        </div>
        <p className="text-xs text-gray-500 mb-5">How you really tip — your edge, your tendencies, your tipster DNA.</p>

        {loading ? (
          <div className="flex justify-center py-20"><Spinner className="w-6 h-6" /></div>
        ) : !session ? (
          <SignInPrompt />
        ) : resp?.pro === false ? (
          <Teaser onUnlock={unlock} loading={upLoading} />
        ) : resp?.pro === true && resp.ready === false ? (
          <KeepTipping made={resp.predictionsMade} />
        ) : resp?.pro === true && resp.ready ? (
          <>
            <div className="flex gap-1 mb-4 p-1 bg-gray-100 rounded-xl">
              {([['overview', 'Overview'], ['review', 'By round'], ['rivals', '⚔️ Rivals']] as const).map(([t, label]) => (
                <button key={t} onClick={() => setTab(t)}
                  className={clsx('flex-1 py-2 text-xs font-bold rounded-lg transition-colors',
                    tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
                  {label}
                </button>
              ))}
            </div>
            {tab === 'overview' ? <Dashboard s={resp.stats} tournamentId={selectedTournId} compId={statsCompId} tribeId={statsTribeId} />
              : tab === 'review' ? <TipReviewView tournamentId={selectedTournId} compId={statsCompId} tribeId={statsTribeId} />
              : <RivalsView tournamentId={selectedTournId} tribeId={statsTribeId} />}
          </>
        ) : (
          <p className="text-sm text-gray-500 text-center py-12">Couldn’t load your stats. Try again shortly.</p>
        )}
      </div>
    </div>
  )
}

// ── States ──────────────────────────────────────────────────────────────────────
function SignInPrompt() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
      <p className="text-sm text-gray-600 mb-4">Sign in to see your tipster stats.</p>
      <a href="/login?next=/stats" className="inline-block px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700">Sign in →</a>
    </div>
  )
}

function KeepTipping({ made }: { made: number }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
      <div className="text-4xl mb-2">📈</div>
      <p className="text-sm font-bold text-gray-900 mb-1">Keep tipping!</p>
      <p className="text-xs text-gray-500 max-w-xs mx-auto">
        Your stats unlock once you’ve got <strong>10 scored predictions</strong> — you’re at <strong>{made}</strong>.
        Lock in a few more rounds and your tipster DNA appears here.
      </p>
    </div>
  )
}

function Teaser({ onUnlock, loading }: { onUnlock: () => void; loading: boolean }) {
  return (
    <div className="relative">
      {/* Blurred sample dashboard */}
      <div className="pointer-events-none select-none blur-[5px] opacity-50 space-y-3">
        <SampleHero />
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Top" value="8%" />
          <Stat label="Hit-rate" value="61%" />
          <Stat label="Points" value="142" />
        </div>
        <Card title="Your tendencies">
          <Row label="Chalk index" value="67% back the favourite" />
          <Row label="Giant-killer" value="3 upsets called" />
          <Row label="On clear favourites" value="78% hit-rate" />
        </Card>
      </div>
      {/* Overlay CTA */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
        <div className="bg-white/90 backdrop-blur rounded-2xl border border-amber-200 shadow-lg p-6 max-w-sm">
          <div className="text-3xl mb-2">📊</div>
          <p className="text-base font-extrabold text-gray-900">Unlock your Tipster Stats</p>
          <p className="text-xs text-gray-500 mt-1 mb-4 leading-relaxed">
            Your percentile, hit-rate, form curve, tipster persona and the upsets you called —
            plus an ad-free experience for the rest of the World Cup.
          </p>
          <button onClick={onUnlock} disabled={loading}
            className="w-full py-2.5 rounded-xl bg-amber-400 text-amber-950 text-sm font-bold hover:bg-amber-300 disabled:opacity-60 transition-colors">
            {loading ? 'Redirecting to checkout…' : 'Unlock Tipster Pro · $6.95 →'}
          </button>
          <a href="/pro/tipster" className="block text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 underline mt-2">See everything in Tipster Pro →</a>
          <p className="text-[10px] text-gray-400 mt-1.5">One-time · whole tournament · ad-free included</p>
        </div>
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard({ s, tournamentId, compId, tribeId }: {
  s: TipsterStats; tournamentId: string | null; compId: string | null; tribeId: string | null
}) {
  const maxForm = Math.max(1, ...s.form.map(f => f.points))

  return (
    <div className="space-y-3">
      {/* Persona hero */}
      <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white rounded-2xl p-5 text-center">
        <div className="text-5xl mb-1">{s.persona.emoji}</div>
        <p className="text-lg font-extrabold">{s.persona.label}</p>
        <p className="text-xs text-emerald-50 mt-1 max-w-xs mx-auto">{s.persona.blurb}</p>
      </div>

      {/* Headline trio */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Ranked" value={`Top ${s.topPercent}%`} sub={`#${s.rank} of ${s.totalPlayers}`} />
        <Stat label="Hit-rate" value={pct(s.hitRate)} sub={`${s.correctCount}/${s.predictionsMade} results`} />
        <Stat label="Points" value={String(s.totalPoints)} sub={s.bonusPoints ? `${s.bonusPoints} bonus` : 'this tournament'} />
      </div>

      {/* Streak */}
      <Card title="Form & streaks">
        <Row label="Longest correct streak" value={`${s.longestStreak} in a row`} />
        <Row label="Current streak" value={s.currentStreak ? `${s.currentStreak} 🔥` : '—'} />
        {s.form.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {s.form.map(f => (
              <div key={f.tab} className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 w-10 uppercase tracking-wide shrink-0">{f.tab}</span>
                <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${(f.points / maxForm) * 100}%` }} />
                </div>
                <span className="text-[11px] font-semibold text-gray-600 w-7 text-right shrink-0">{f.points}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Tendencies */}
      <Card title="Your tendencies">
        <Row label="Chalk index"
          value={s.chalkIndex.decisive ? `${pct(s.chalkIndex.rate)} back the favourite` : '—'}
          hint={s.chalkIndex.decisive ? `${pct(s.chalkIndex.hitRate)} hit-rate on favourites` : 'not enough decisive picks'} />
        <Row label="Giant-killer"
          value={s.giantKiller.backedDog ? `${s.giantKiller.correct}/${s.giantKiller.backedDog} upsets landed` : '—'}
          hint={s.giantKiller.backedDog ? `${pct(s.giantKiller.rate)} of your underdog calls came in` : 'you rarely back underdogs'} />
        {s.strengthAdjusted.favHitRate != null && (
          <Row label="On clear favourites" value={pct(s.strengthAdjusted.favHitRate)}
            hint={s.strengthAdjusted.coinflipHitRate != null ? `${pct(s.strengthAdjusted.coinflipHitRate)} on coin-flip games` : undefined} />
        )}
        <Row label="Draws called"
          value={s.drawsCalled.actualDraws ? `${s.drawsCalled.called}/${s.drawsCalled.actualDraws}` : '—'}
          hint={s.drawsCalled.actualDraws ? `${pct(s.drawsCalled.rate)} of actual draws spotted` : 'no draws yet'} />
      </Card>

      {/* Biggest upset called */}
      {s.biggestUpset && (
        <div className="bg-white rounded-2xl border border-amber-200 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-600 mb-1">🐐 Biggest upset called</p>
          <p className="text-sm font-bold text-gray-900">
            {s.biggestUpset.flag} {s.biggestUpset.picked} <span className="font-normal text-gray-500">to win</span>
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {s.biggestUpset.home} v {s.biggestUpset.away} ·{' '}
            you backed the side ranked <strong>{s.biggestUpset.gap}</strong> places lower — and they delivered.
          </p>
        </div>
      )}

      {/* Bonus team */}
      <BonusTeamCard tournamentId={tournamentId} compId={compId} tribeId={tribeId} />

      {/* Best pick */}
      {s.best && (
        <Card title="Best pick">
          <p className="text-sm font-bold text-gray-900">{s.best.home} v {s.best.away}</p>
          <p className="text-xs text-gray-500 mt-0.5">{s.best.points} points · {s.best.round.toUpperCase()}</p>
        </Card>
      )}

      {/* Shareable card — inline preview */}
      <ShareCard tournamentId={tournamentId} version={s.totalPoints} />
    </div>
  )
}

function ShareCard({ tournamentId, version }: { tournamentId: string | null; version: number }) {
  const [busy, setBusy] = useState(false)
  if (!tournamentId) return null
  const src = `/api/tipster/card?tournament_id=${tournamentId}&v=${version}`

  const onShare = async () => {
    setBusy(true)
    try {
      const blob = await (await fetch(src)).blob()
      const file = new File([blob], 'tribepicks-card.png', { type: 'image/png' })
      const text = 'My TribePicks tipster card — think you can beat me?'
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text })
      } else if (navigator.share) {
        await navigator.share({ text, url: window.location.origin })
      } else {
        const u = URL.createObjectURL(blob); const a = document.createElement('a')
        a.href = u; a.download = 'tribepicks-card.png'; a.click(); URL.revokeObjectURL(u)
        toast.success('Card downloaded')
      }
    } catch { /* user cancelled or unsupported */ }
    setBusy(false)
  }

  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Share your card</p>
      <div className="bg-white rounded-2xl border border-gray-200 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Your tipster card" className="w-full rounded-xl bg-emerald-700" />
        <div className="flex gap-2 mt-3">
          <button onClick={onShare} disabled={busy}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-60 transition-colors">
            {busy ? 'Preparing…' : 'Share →'}
          </button>
          <a href={src} download="tribepicks-card.png"
            className="px-4 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold hover:bg-gray-200 transition-colors">
            Save
          </a>
        </div>
      </div>
    </div>
  )
}

// ── Bonus Team card ─────────────────────────────────────────────────────────────
function BonusTeamCard({ tournamentId, compId, tribeId }: {
  tournamentId: string | null; compId: string | null; tribeId: string | null
}) {
  const { flag } = useUserPrefs()
  const [b, setB] = useState<BonusStats | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!tournamentId) return
    let live = true
    const q = new URLSearchParams({ tournament_id: tournamentId })
    if (compId)  q.set('comp_id', compId)
    if (tribeId) q.set('tribe_id', tribeId)
    fetch(`/api/tipster/bonus?${q.toString()}`)
      .then(r => r.json())
      .then(d => { if (live) { setB(d?.bonus ?? null); setDone(true) } })
      .catch(() => { if (live) setDone(true) })
    return () => { live = false }
  }, [tournamentId, compId, tribeId])

  if (!done || !b) return null   // hide entirely if no bonus team

  const statusClass = b.status
    ? b.status.rank <= 2 ? 'bg-emerald-50 text-emerald-700'
      : b.status.rank === 3 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'
    : ''

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Bonus team</p>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-extrabold text-gray-900">
            {flag(b.team)} {b.team}
            {b.teamRank != null && <span className="text-[10px] text-gray-400 font-semibold ml-1.5">FIFA #{b.teamRank}</span>}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">{b.isAuto ? '🎲 Auto-assigned' : '👑 Your pick'}</p>
        </div>
        {b.status && (
          <span className={clsx('text-[10px] font-bold rounded-full px-2 py-1 whitespace-nowrap', statusClass)}>
            {b.status.rank <= 2 ? '🟢' : b.status.rank === 3 ? '🟡' : '🔴'} {b.status.points} pts · Grp {b.status.group}
          </span>
        )}
      </div>

      {b.contrarian && (
        <div className="mt-2 text-[11px] font-bold text-purple-700 bg-purple-50 rounded-lg px-2.5 py-1.5">
          🦄 Only {b.fieldBackers} of {b.fieldPickers} pickers in the whole tournament backed {b.team}
        </div>
      )}

      <div className="mt-3 space-y-1.5">
        <BonusRow label="🌍 Field"  pop={b.tournament} myTeam={b.team} flag={flag} />
        {b.comp  && <BonusRow label="🏢 Comp"  pop={b.comp}  myTeam={b.team} flag={flag} />}
        {b.multiTribe && b.tribe && <BonusRow label="👥 Tribe" pop={b.tribe} myTeam={b.team} flag={flag} />}
      </div>

      <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between text-xs">
        <span className="text-gray-500">Bonus points banked</span>
        <span className="font-bold text-gray-900">
          {b.bonusPoints}
          {b.roiBetterThanPct != null && <span className="text-gray-400 font-normal"> · beats {b.roiBetterThanPct}% of the field</span>}
        </span>
      </div>
      {b.status && b.status.played < 3 && (
        <p className="text-[9px] text-gray-300 mt-1.5">Group position provisional — GS3 still to play.</p>
      )}
    </div>
  )
}

function BonusRow({ label, pop, myTeam, flag }: { label: string; pop: BonusStats['tournament']; myTeam: string; flag: (t: string) => string }) {
  if (!pop)
    return <div className="flex items-center justify-between text-[11px] text-gray-300"><span>{label}</span><span>—</span></div>
  const youLead = pop.topTeam === myTeam
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-gray-500 w-14 shrink-0">{label}</span>
      <div className="flex-1 flex items-baseline gap-2 min-w-0 justify-end">
        <span className="font-bold text-gray-900">{pop.samePct}% same</span>
        <span className="text-[11px] text-gray-400 truncate">
          {youLead ? '— most-backed here 👑' : `· top: ${flag(pop.topTeam)} ${pop.topTeam} ${pop.topPct}%`}
        </span>
      </div>
    </div>
  )
}

// ── Bits ──────────────────────────────────────────────────────────────────────
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-3 text-center">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-xl font-black text-gray-900 mt-0.5 leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">{title}</p>
      {children}
    </div>
  )
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-gray-50 last:border-0">
      <div className="min-w-0">
        <p className="text-sm text-gray-700">{label}</p>
        {hint && <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>}
      </div>
      <p className="text-sm font-bold text-gray-900 text-right shrink-0">{value}</p>
    </div>
  )
}

// ── Tip Review (By round) ───────────────────────────────────────────────────────
function TipReviewView({ tournamentId, compId, tribeId }: {
  tournamentId: string | null; compId: string | null; tribeId: string | null
}) {
  const { flag } = useUserPrefs()
  const [data, setData] = useState<TipReview | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeRound, setActiveRound] = useState<string | null>(null)
  const [list, setList] = useState<ListReq | null>(null)

  useEffect(() => {
    if (!tournamentId) return
    let live = true
    setLoading(true)
    const q = new URLSearchParams({ tournament_id: tournamentId })
    if (compId)  q.set('comp_id', compId)
    if (tribeId) q.set('tribe_id', tribeId)
    fetch(`/api/tipster/tips?${q.toString()}`)
      .then(r => r.json())
      .then(d => {
        if (!live) return
        const review: TipReview = d?.pro ? d : { rounds: [], multiTribe: false }
        setData(review)
        // Default to the most recent round with tips.
        setActiveRound(review.rounds.length ? review.rounds[review.rounds.length - 1].code : null)
        setLoading(false)
      })
      .catch(() => { if (live) { setData({ rounds: [], multiTribe: false }); setLoading(false) } })
    return () => { live = false }
  }, [tournamentId, compId, tribeId])

  if (loading) return <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div>
  if (!data || !data.rounds.length)
    return <p className="text-sm text-gray-500 text-center py-12">No settled tips to review yet.</p>

  const active = data.rounds.find(r => r.code === activeRound) ?? data.rounds[data.rounds.length - 1]

  // Distinct match days in this round → first fixture of each (for the date scrubber).
  const days: { label: string; firstId: number }[] = []
  const seenDay = new Set<string>()
  for (const f of active.fixtures) {
    const label = matchDate(f.kickoffUtc)
    if (!seenDay.has(label)) { seenDay.add(label); days.push({ label, firstId: f.fixtureId }) }
  }
  const scrollToFixture = (id: number) =>
    document.getElementById(`fx-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="pb-20">
      {/* Round tabs — segmented control, matching the Predict page */}
      <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide mb-3">
        <div className="flex gap-0 min-w-max border border-gray-200 rounded-xl overflow-hidden bg-gray-100 p-1">
          {data.rounds.map(r => (
            <button key={r.code} onClick={() => setActiveRound(r.code)}
              className={clsx('px-3.5 py-2 rounded-lg transition-all duration-200 whitespace-nowrap text-xs font-semibold min-w-[72px]',
                active.code === r.code
                  ? 'bg-white text-green-800 shadow-sm border border-gray-200'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-white/60')}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <Legend />

      <div className="space-y-2.5 mt-3">
        {active.fixtures.map(f => (
          <FixtureRow key={f.fixtureId} f={f} multiTribe={data.multiTribe} flag={flag}
            compId={compId} tribeId={tribeId} onOpenList={setList} />
        ))}
      </div>

      {list && <PickListModal req={list} flag={flag} onClose={() => setList(null)} />}

      {/* Sticky date scrubber — floats above the mobile bottom nav */}
      {days.length > 1 && (
        <div className="sticky bottom-16 sm:bottom-3 z-30 mt-4 flex justify-center pointer-events-none">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide max-w-full bg-white/95 backdrop-blur border border-gray-200 shadow-lg rounded-full px-2 py-1.5 pointer-events-auto">
            {days.map(dd => (
              <button key={dd.label} onClick={() => scrollToFixture(dd.firstId)}
                className="px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap bg-gray-100 text-gray-600 hover:bg-gray-900 hover:text-white transition-colors">
                {dd.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Legend() {
  const Sw = ({ c, label }: { c: string; label: string }) => (
    <span className="inline-flex items-center gap-1"><span className={clsx('w-2.5 h-2.5 rounded-sm', c)} />{label}</span>
  )
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-500">
      <Sw c="bg-blue-300" label="Home" />
      <Sw c="bg-gray-300" label="Draw" />
      <Sw c="bg-yellow-300" label="Away" />
      <span className="inline-flex items-center gap-1"><span className="text-green-600">▼</span> result</span>
      <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm ring-2 ring-inset ring-green-600" />/<span className="w-2.5 h-2.5 rounded-sm ring-2 ring-inset ring-red-500" /> your pick (right / wrong)</span>
    </div>
  )
}

function pickLabel(f: TipReviewFixture): string {
  const base = f.myOutcome === 'H' ? `${f.home} to win` : f.myOutcome === 'A' ? `${f.away} to win` : 'Draw'
  return f.isScoreRound && f.myScore ? `${base} (${f.myScore.h}–${f.myScore.a})` : base
}

const matchDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

interface ListReq { fixtureId: number; home: string; away: string; scope: 'comp' | 'tribe'; id: string; outcome: 'H' | 'D' | 'A' }

function FixtureRow({ f, multiTribe, flag, compId, tribeId, onOpenList }: {
  f: TipReviewFixture; multiTribe: boolean; flag: (t: string) => string
  compId: string | null; tribeId: string | null; onOpenList: (r: ListReq) => void
}) {
  const contrarianWin = f.correct && f.tournament != null && f.tournament.samePct != null && f.tournament.samePct < 35
  return (
    <div id={`fx-${f.fixtureId}`} className="bg-white rounded-2xl border border-gray-200 p-3.5 scroll-mt-16">
      {/* Fixture + result + date */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0 flex items-start gap-2">
          {/* home */}
          <div className="flex-1 min-w-0 text-right">
            <p className="text-sm font-bold text-gray-900 truncate">{f.home} {flag(f.home)}</p>
            {f.homeRank != null && <p className="text-[10px] text-gray-400 font-medium">FIFA #{f.homeRank}</p>}
          </div>
          {/* score */}
          <span className="text-sm font-bold text-gray-500 shrink-0 pt-0.5">{f.homeScore}–{f.awayScore}</span>
          {/* away */}
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-bold text-gray-900 truncate">{flag(f.away)} {f.away}</p>
            {f.awayRank != null && <p className="text-[10px] text-gray-400 font-medium">FIFA #{f.awayRank}</p>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={clsx('text-xs font-bold', f.correct ? 'text-emerald-600' : 'text-red-500')}>
            {f.correct ? `✓ +${f.points}` : '✗ 0'}
          </span>
          <span className="text-[10px] font-medium text-gray-500 bg-gray-100 rounded-full px-2 py-0.5 whitespace-nowrap">
            📅 {matchDate(f.kickoffUtc)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-1 mb-2.5">
        <p className="text-xs text-gray-500">You tipped:{' '}
          <span className={clsx('font-semibold', f.correct ? 'text-emerald-600' : 'text-red-500')}>{pickLabel(f)}</span>
        </p>
        {contrarianWin && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 rounded px-1.5 py-0.5 shrink-0">🎯 Contrarian win</span>}
      </div>

      {/* Population splits — ▼ = result, outline = your pick. Comp/Tribe segments
          are tappable → who picked that outcome. */}
      <div className="space-y-1.5">
        <SplitBar label="🌍 Field" split={f.tournament} f={f} />
        {f.comp && compId && <SplitBar label="🏢 Comp" split={f.comp} f={f}
          onSegClick={o => onOpenList({ fixtureId: f.fixtureId, home: f.home, away: f.away, scope: 'comp', id: compId, outcome: o })} />}
        {multiTribe && f.tribe && tribeId && <SplitBar label="👥 Tribe" split={f.tribe} f={f}
          onSegClick={o => onOpenList({ fixtureId: f.fixtureId, home: f.home, away: f.away, scope: 'tribe', id: tribeId, outcome: o })} />}
      </div>
      {(f.comp || f.tribe) && <p className="text-[9px] text-gray-300 mt-1.5">Tap a Comp/Tribe bar to see who picked it</p>}
    </div>
  )
}

// Stacked H/D/A bar for one population. Segment fill is fixed by outcome —
// blue=home, grey=draw, black=away. A green ▼ above the bar marks the actual
// result; the user's pick segment is outlined green (right) or red (wrong).
function SplitBar({ label, split, f, onSegClick }: {
  label: string; split: PopSplit | null; f: TipReviewFixture; onSegClick?: (o: 'H' | 'D' | 'A') => void
}) {
  if (!split || !split.total)
    return (
      <div className="flex items-center gap-2 text-[11px] text-gray-300">
        <span className="w-14 shrink-0">{label}</span><span>not enough tippers</span>
      </div>
    )
  const h = Math.round((split.h / split.total) * 100)
  const d = Math.round((split.d / split.total) * 100)
  const a = 100 - h - d
  const OUTCOME_COLOUR: Record<'H' | 'D' | 'A', string> = { H: 'bg-blue-300', D: 'bg-gray-300', A: 'bg-yellow-300' }

  // Arrow cell — same widths as the bar, so the ▼ sits over the result segment.
  const arrow = (key: 'H' | 'D' | 'A', pct: number) => pct > 0 && (
    <div className="flex justify-center" style={{ width: `${pct}%` }}>
      {key === f.result && <span className="text-green-600 text-[10px] leading-none">▼</span>}
    </div>
  )
  const seg = (key: 'H' | 'D' | 'A', pct: number) => {
    if (pct <= 0) return false
    const mine = key === f.myOutcome
    const ring = mine ? (f.correct ? 'ring-2 ring-inset ring-green-600' : 'ring-2 ring-inset ring-red-500') : ''
    return (
      <div
        onClick={onSegClick ? () => onSegClick(key) : undefined}
        title={onSegClick ? 'See who picked this' : undefined}
        className={clsx(OUTCOME_COLOUR[key], ring, 'flex items-center justify-center',
          onSegClick && 'cursor-pointer hover:brightness-95 active:brightness-90')}
        style={{ width: `${pct}%` }}>
        {pct >= 14 ? `${pct}%` : ''}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-gray-500 w-14 shrink-0 flex items-center justify-between">
        <span>{label}</span><span className="text-gray-300 text-[9px]">{split.total}</span>
      </span>
      <div className="flex-1">
        <div className="flex h-2.5">{arrow('H', h)}{arrow('D', d)}{arrow('A', a)}</div>
        <div className={clsx('flex h-5 rounded-md overflow-hidden text-[9px] font-bold text-gray-800',
          onSegClick && 'shadow-[0_2px_0_0_rgba(0,0,0,0.18)] hover:shadow-[0_3px_0_0_rgba(0,0,0,0.22)] hover:-translate-y-px active:translate-y-px active:shadow-[0_1px_0_0_rgba(0,0,0,0.18)] transition-all')}>
          {seg('H', h)}{seg('D', d)}{seg('A', a)}
        </div>
      </div>
    </div>
  )
}

// Who in the comp/tribe picked the tapped outcome (settled fixtures only).
interface PickRow { name: string; avatar_url: string | null; outcome: 'H' | 'D' | 'A'; is_me: boolean; points: number; globalRank: number | null; groupRank: number | null }
function PickListModal({ req, flag, onClose }: { req: ListReq; flag: (t: string) => string; onClose: () => void }) {
  const [data, setData] = useState<{ picks: PickRow[]; result?: 'H' | 'D' | 'A' | null } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    const q = new URLSearchParams({ fixture_id: String(req.fixtureId), scope: req.scope, id: req.id })
    fetch(`/api/tipster/fixture-picks?${q.toString()}`)
      .then(r => r.json())
      .then(d => { if (live) { setData(d); setLoading(false) } })
      .catch(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [req])

  const outLabel = req.outcome === 'H' ? `${flag(req.home)} ${req.home} to win`
    : req.outcome === 'A' ? `${flag(req.away)} ${req.away} to win` : 'Draw'
  const scopeLabel = req.scope === 'comp' ? 'Comp' : 'Tribe'
  const matching = (data?.picks ?? []).filter(p => p.outcome === req.outcome)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:px-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate flex items-center gap-1.5">
              {scopeLabel} · picked {outLabel}
              {data?.result != null && (
                <span className={clsx('text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap',
                  req.outcome === data.result ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600')}>
                  {req.outcome === data.result ? '✓ was the result' : '✗ wrong'}
                </span>
              )}
            </p>
            <p className="text-[11px] text-gray-400">{req.home} v {req.away}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1" aria-label="Close">✕</button>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><Spinner className="w-6 h-6" /></div>
        ) : matching.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-400">No one in your {scopeLabel.toLowerCase()} picked this.</p>
        ) : (
          <div className="overflow-y-auto px-2 py-2 divide-y divide-gray-50">
            {matching.map((p, i) => (
              <div key={i} className={clsx('flex items-center gap-2.5 px-2 py-2', p.is_me && 'bg-emerald-50/60 rounded-lg')}>
                <Avatar name={p.name} src={p.avatar_url} size="xs" className="shrink-0" />
                <span className="flex-1 text-sm text-gray-800 truncate">
                  {p.name}{p.is_me && <span className="text-emerald-600 font-semibold"> (you)</span>}
                </span>
                <span className="text-[10px] text-gray-400 shrink-0 text-right whitespace-nowrap">
                  {p.groupRank != null && <span className="font-bold text-gray-600">{scopeLabel} #{p.groupRank}</span>}
                  {p.globalRank != null && <span className="ml-2">🌍 #{p.globalRank}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
        {!loading && (
          <div className="px-4 py-2 border-t border-gray-100 text-[11px] text-gray-400 text-center flex-shrink-0">
            {matching.length} {matching.length === 1 ? 'pick' : 'picks'}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Rivals (Head-to-head) ─────────────────────────────────────────────────────
function RivalsView({ tournamentId, tribeId }: { tournamentId: string | null; tribeId: string | null }) {
  const { flag } = useUserPrefs()
  const [rivals, setRivals] = useState<H2HRival[] | null>(null)
  const [myPoints, setMyPoints] = useState(0)
  const [rivalId, setRivalId] = useState<string | null>(null)
  const [h2h, setH2h] = useState<H2H | null>(null)
  const [loading, setLoading] = useState(true)
  const [h2hLoading, setH2hLoading] = useState(false)

  // Load the candidate tribe-mates.
  useEffect(() => {
    if (!tournamentId || !tribeId) { setRivals([]); setLoading(false); return }
    let live = true
    setLoading(true)
    fetch(`/api/tipster/h2h?tournament_id=${tournamentId}&tribe_id=${tribeId}`)
      .then(r => r.json())
      .then(d => {
        if (!live) return
        const list: H2HRival[] = d?.rivals ?? []
        setRivals(list); setMyPoints(d?.myPoints ?? 0)
        // Default to the nearest rival on the ladder.
        if (list.length) {
          const near = list.reduce((best, r) => Math.abs(r.points - (d?.myPoints ?? 0)) < Math.abs(best.points - (d?.myPoints ?? 0)) ? r : best)
          setRivalId(near.id)
        }
        setLoading(false)
      })
      .catch(() => { if (live) { setRivals([]); setLoading(false) } })
    return () => { live = false }
  }, [tournamentId, tribeId])

  // Load the head-to-head for the chosen rival.
  useEffect(() => {
    if (!tournamentId || !tribeId || !rivalId) { setH2h(null); return }
    let live = true
    setH2hLoading(true)
    fetch(`/api/tipster/h2h?tournament_id=${tournamentId}&tribe_id=${tribeId}&rival_id=${rivalId}`)
      .then(r => r.json())
      .then(d => { if (live) { setH2h(d?.h2h ?? null); setH2hLoading(false) } })
      .catch(() => { if (live) setH2hLoading(false) })
    return () => { live = false }
  }, [tournamentId, tribeId, rivalId])

  if (loading) return <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div>
  if (!rivals || rivals.length === 0)
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
        <div className="text-4xl mb-2">⚔️</div>
        <p className="text-sm font-bold text-gray-900 mb-1">No rivals yet</p>
        <p className="text-xs text-gray-500 max-w-xs mx-auto">Head-to-head compares you with your tribe-mates. Invite a few friends to your tribe, then come back to settle it.</p>
      </div>
    )

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-gray-500 shrink-0">Face:</span>
        <select value={rivalId ?? ''} onChange={e => setRivalId(e.target.value || null)}
          className="flex-1 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-400">
          {rivals.map(r => <option key={r.id} value={r.id}>{r.name} · {r.points} pts</option>)}
        </select>
      </div>

      {h2hLoading || !h2h ? (
        <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div>
      ) : <H2HCard h2h={h2h} flag={flag} />}
    </div>
  )
}

function H2HCard({ h2h, flag }: { h2h: H2H; flag: (t: string) => string }) {
  const { me, rival, roundsWon, swing } = h2h
  const lead = me.points - rival.points
  const hr = (s: { correct: number; predictions: number }) => s.predictions ? `${Math.round((s.correct / s.predictions) * 100)}%` : '—'
  const outName = (o: 'H' | 'D' | 'A', home: string, away: string) => o === 'H' ? home : o === 'A' ? away : 'Draw'

  return (
    <div className="space-y-3">
      {/* Scoreline */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 text-center min-w-0">
            <Avatar name={me.name} src={me.avatarUrl} size="sm" className="mx-auto" />
            <p className="text-xs font-bold text-gray-700 mt-1 truncate">You</p>
            <p className={clsx('text-3xl font-black leading-tight', lead >= 0 ? 'text-emerald-600' : 'text-gray-400')}>{me.points}</p>
          </div>
          <span className="text-xs font-bold text-gray-300 shrink-0">vs</span>
          <div className="flex-1 text-center min-w-0">
            <Avatar name={rival.name} src={rival.avatarUrl} size="sm" className="mx-auto" />
            <p className="text-xs font-bold text-gray-700 mt-1 truncate">{rival.name}</p>
            <p className={clsx('text-3xl font-black leading-tight', lead <= 0 ? 'text-emerald-600' : 'text-gray-400')}>{rival.points}</p>
          </div>
        </div>
        <p className="text-center text-sm font-bold text-gray-900 mt-2">
          {lead > 0 ? `🏆 You're ahead by ${lead}` : lead < 0 ? `${rival.name} leads by ${-lead}` : '🤝 Dead level!'}
        </p>
      </div>

      {/* Rounds won + hit-rate */}
      <div className="grid grid-cols-2 gap-3">
        <Card title="Rounds won">
          <p className="text-sm font-bold text-gray-900">You {roundsWon.me} · {rival.name} {roundsWon.rival}</p>
          {roundsWon.tied > 0 && <p className="text-[11px] text-gray-400 mt-0.5">{roundsWon.tied} tied</p>}
        </Card>
        <Card title="Hit-rate">
          <p className="text-sm font-bold text-gray-900">You {hr(me)} · {hr(rival)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">correct results</p>
        </Card>
      </div>

      {/* Bonus team face-off */}
      <Card title="Bonus team">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-700"><span className="font-bold">You:</span> {me.bonusTeam ? `${flag(me.bonusTeam)} ${me.bonusTeam}` : '—'} <span className="text-gray-400">({me.bonusPoints})</span></span>
          <span className="text-gray-700 text-right"><span className="font-bold">{rival.name}:</span> {rival.bonusTeam ? `${flag(rival.bonusTeam)} ${rival.bonusTeam}` : '—'} <span className="text-gray-400">({rival.bonusPoints})</span></span>
        </div>
      </Card>

      {/* Swing fixtures */}
      {swing.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Swing fixtures — where the gap was won &amp; lost</p>
          <div className="space-y-2">
            {swing.map(s => (
              <div key={s.fixtureId} className="bg-white rounded-2xl border border-gray-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-gray-900 min-w-0 truncate">
                    {flag(s.home)} {s.home} <span className="text-gray-400 font-semibold">{s.homeScore}–{s.awayScore}</span> {s.away} {flag(s.away)}
                  </p>
                  <span className={clsx('text-xs font-black shrink-0', s.delta > 0 ? 'text-emerald-600' : 'text-red-500')}>
                    {s.delta > 0 ? `+${s.delta} you` : `+${-s.delta} ${rival.name}`}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-1 text-[11px] text-gray-500">
                  <span>You: <span className="font-semibold text-gray-700">{outName(s.myOutcome, s.home, s.away)}</span> · {s.myPoints}pts</span>
                  <span className="text-right">{rival.name}: <span className="font-semibold text-gray-700">{outName(s.rivalOutcome, s.home, s.away)}</span> · {s.rivalPoints}pts</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SampleHero() {
  return (
    <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white rounded-2xl p-5 text-center">
      <div className="text-5xl mb-1">🔮</div>
      <p className="text-lg font-extrabold">The Oracle</p>
      <p className="text-xs text-emerald-50 mt-1">Top of the pile and rarely wrong.</p>
    </div>
  )
}
