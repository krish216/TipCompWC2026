'use client'

import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Spinner } from '@/components/ui'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'
import type { TipsterStats } from '@/lib/tipster-stats'
import type { TipReview, TipReviewFixture, PopSplit } from '@/lib/tipster-tips'

// Tipster Pro — "My Stats" dashboard (Phase D). Renders the payload from
// /api/tipster/stats. The API is the single source of gating truth:
//   { pro:false }                  → teaser + Tipster Pro upsell ($4.95 ad-free checkout)
//   { pro:true, ready:false, n }   → "keep tipping" (under the min-scored gate)
//   { pro:true, ready:true, stats} → full dashboard
type ApiResp =
  | { pro: false }
  | { pro: true; ready: false; predictionsMade: number }
  | { pro: true; ready: true; stats: TipsterStats }

const pct = (n: number) => `${Math.round(n * 100)}%`

export default function StatsPage() {
  const { session } = useSupabase()
  const { selectedTournId, selectedCompId, selectedTribeId } = useUserPrefs()
  const [resp, setResp]       = useState<ApiResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [upLoading, setUpLoading] = useState(false)
  const [tab, setTab] = useState<'overview' | 'review'>('overview')

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
        <h1 className="text-xl font-extrabold text-gray-900 mb-1">📊 My Tipster Stats</h1>
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
              {(['overview', 'review'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={clsx('flex-1 py-2 text-xs font-bold rounded-lg transition-colors',
                    tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
                  {t === 'overview' ? 'Overview' : 'By round'}
                </button>
              ))}
            </div>
            {tab === 'overview'
              ? <Dashboard s={resp.stats} />
              : <TipReviewView tournamentId={selectedTournId} compId={selectedCompId} tribeId={selectedTribeId} />}
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
            {loading ? 'Redirecting to checkout…' : 'Unlock Tipster Pro · $4.95 →'}
          </button>
          <p className="text-[10px] text-gray-400 mt-2">One-time · whole tournament · ad-free included</p>
        </div>
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard({ s }: { s: TipsterStats }) {
  const maxForm = Math.max(1, ...s.form.map(f => f.points))
  const share = async () => {
    const text = `I'm ${s.persona.emoji} ${s.persona.label} on TribePicks — Top ${s.topPercent}%, ${pct(s.hitRate)} hit-rate. Think you can beat that?`
    try {
      if (navigator.share) await navigator.share({ text, url: 'https://tribepicks.com' })
      else { await navigator.clipboard.writeText(`${text} https://tribepicks.com`); toast.success('Copied to clipboard') }
    } catch { /* user cancelled */ }
  }

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

      {/* Best pick + favourite team */}
      <div className="grid sm:grid-cols-2 gap-3">
        {s.best && (
          <Card title="Best pick">
            <p className="text-sm font-bold text-gray-900">{s.best.home} v {s.best.away}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.best.points} points · {s.best.round.toUpperCase()}</p>
          </Card>
        )}
        {s.favouriteTeam && (
          <Card title="Bonus team">
            <p className="text-sm font-bold text-gray-900">{s.favouriteTeam}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.bonusPoints} bonus points earned</p>
          </Card>
        )}
      </div>

      {/* Share */}
      <button onClick={share}
        className="w-full py-2.5 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-gray-800 transition-colors">
        Share my tipster card →
      </button>
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

  useEffect(() => {
    if (!tournamentId) return
    let live = true
    setLoading(true)
    const q = new URLSearchParams({ tournament_id: tournamentId })
    if (compId)  q.set('comp_id', compId)
    if (tribeId) q.set('tribe_id', tribeId)
    fetch(`/api/tipster/tips?${q.toString()}`)
      .then(r => r.json())
      .then(d => { if (live) { setData(d?.pro ? d : { rounds: [], multiTribe: false }); setLoading(false) } })
      .catch(() => { if (live) { setData({ rounds: [], multiTribe: false }); setLoading(false) } })
    return () => { live = false }
  }, [tournamentId, compId, tribeId])

  if (loading) return <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div>
  if (!data || !data.rounds.length)
    return <p className="text-sm text-gray-500 text-center py-12">No settled tips to review yet.</p>

  return (
    <div className="space-y-5">
      <p className="text-xs text-gray-500 -mt-1">
        How you tipped each game vs the field, your comp{data.multiTribe ? ' and your tribe' : ''}.
        The outlined bar is the side you backed.
      </p>
      {data.rounds.map(r => (
        <div key={r.code}>
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">{r.name}</p>
          <div className="space-y-2.5">
            {r.fixtures.map(f => <FixtureRow key={f.fixtureId} f={f} multiTribe={data.multiTribe} flag={flag} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

function pickLabel(f: TipReviewFixture): string {
  const base = f.myOutcome === 'H' ? `${f.home} to win` : f.myOutcome === 'A' ? `${f.away} to win` : 'Draw'
  return f.isScoreRound && f.myScore ? `${base} (${f.myScore.h}–${f.myScore.a})` : base
}

function FixtureRow({ f, multiTribe, flag }: { f: TipReviewFixture; multiTribe: boolean; flag: (t: string) => string }) {
  const contrarianWin = f.correct && f.tournament != null && f.tournament.samePct != null && f.tournament.samePct < 35
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-3.5">
      {/* Fixture + result */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-gray-900 min-w-0 truncate">
          {flag(f.home)} {f.home} <span className="text-gray-400 font-semibold">{f.homeScore}–{f.awayScore}</span> {f.away} {flag(f.away)}
        </p>
        <span className={clsx('text-xs font-bold shrink-0', f.correct ? 'text-emerald-600' : 'text-gray-400')}>
          {f.correct ? `✓ +${f.points}` : '✗ 0'}
        </span>
      </div>
      <div className="flex items-center gap-2 mt-0.5 mb-2.5">
        <p className="text-xs text-gray-500">You tipped: <span className="font-semibold text-gray-700">{pickLabel(f)}</span></p>
        {contrarianWin && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 rounded px-1.5 py-0.5 shrink-0">🎯 Contrarian win</span>}
      </div>

      {/* Population splits — outlined segment = your pick */}
      <div className="space-y-1.5">
        <SplitBar label="🌍 Field" split={f.tournament} mine={f.myOutcome} />
        {f.comp  && <SplitBar label="🏢 Comp"  split={f.comp}  mine={f.myOutcome} />}
        {multiTribe && f.tribe && <SplitBar label="👥 Tribe" split={f.tribe} mine={f.myOutcome} />}
      </div>

      {/* Colour key */}
      <div className="flex justify-between text-[10px] text-gray-400 mt-1.5 px-0.5">
        <span>🏠 {f.home}</span><span>Draw</span><span>{f.away} 🛫</span>
      </div>
    </div>
  )
}

// Stacked H/D/A bar for one population (mirrors the tribe tipsheet). The segment
// matching the user's own pick is outlined so they can see where they sat.
function SplitBar({ label, split, mine }: { label: string; split: PopSplit | null; mine: 'H' | 'D' | 'A' | null }) {
  if (!split || !split.total)
    return (
      <div className="flex items-center gap-2 text-[11px] text-gray-300">
        <span className="w-14 shrink-0">{label}</span><span>not enough tippers</span>
      </div>
    )
  const h = Math.round((split.h / split.total) * 100)
  const d = Math.round((split.d / split.total) * 100)
  const a = 100 - h - d
  const seg = (pct: number, colour: string, on: boolean) => pct > 0 && (
    <div className={clsx(colour, 'flex items-center justify-center', on && 'ring-2 ring-inset ring-gray-900/45')}
      style={{ width: `${pct}%` }}>{pct >= 14 ? `${pct}%` : ''}</div>
  )
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-gray-500 w-14 shrink-0 flex items-center justify-between">
        <span>{label}</span><span className="text-gray-300 text-[9px]">{split.total}</span>
      </span>
      <div className="flex-1 flex h-5 rounded-md overflow-hidden text-[9px] font-bold text-white">
        {seg(h, 'bg-emerald-500', mine === 'H')}
        {seg(d, 'bg-gray-400',    mine === 'D')}
        {seg(a, 'bg-sky-500',     mine === 'A')}
      </div>
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
