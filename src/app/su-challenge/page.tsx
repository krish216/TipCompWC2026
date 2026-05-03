'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CHALLENGE_PICKS_KEY, CHALLENGE_SOURCE_KEY } from '@/lib/challenge'
import { useSupabase } from '@/components/layout/SupabaseProvider'

// ── Types ─────────────────────────────────────────────────────────────────────
type Outcome = 'H' | 'D' | 'A'
type Step = 'intro' | 'pick' | 'result' | 'signup'

interface LiveFixture {
  id:               number
  home:             string
  away:             string
  home_flag:        string
  away_flag:        string
  kickoff_utc:      string
  venue:            string
  group:            string
  pct_home:         number | null
  pct_draw:         number | null
  pct_away:         number | null
  prediction_count: number
}

interface Match {
  id:            number   // real DB fixture_id (or synthetic fallback)
  home:          string
  homeFlag:      string
  away:          string
  awayFlag:      string
  group:         string
  date:          string
  venue:         string
  pctHome:       number
  pctDraw:       number
  pctAway:       number
  boldThreshold: number
}

interface Pick {
  fixtureId: number   // real DB fixture_id
  outcome:   Outcome
  isBold:    boolean
  home:      string
  homeFlag:  string
  away:      string
  awayFlag:  string
}

// ── Hardcoded fallback (used when API returns empty or pct is null) ────────────
const FALLBACK_MATCHES: Match[] = [
  {
    id: 0, home: 'Mexico', homeFlag: '🇲🇽', away: 'South Africa', awayFlag: '🇿🇦',
    group: 'Group A', date: 'Jun 11', venue: 'Estadio Azteca',
    pctHome: 62, pctDraw: 22, pctAway: 16, boldThreshold: 30,
  },
  {
    id: 0, home: 'South Korea', homeFlag: '🇰🇷', away: 'Czechia', awayFlag: '🇨🇿',
    group: 'Group A', date: 'Jun 12', venue: 'Estadio Akron',
    pctHome: 41, pctDraw: 28, pctAway: 31, boldThreshold: 30,
  },
  {
    id: 0, home: 'USA', homeFlag: '🇺🇸', away: 'Panama', awayFlag: '🇵🇦',
    group: 'Group B', date: 'Jun 12', venue: 'SoFi Stadium',
    pctHome: 71, pctDraw: 17, pctAway: 12, boldThreshold: 30,
  },
  {
    id: 0, home: 'Uruguay', homeFlag: '🇺🇾', away: 'Egypt', awayFlag: '🇪🇬',
    group: 'Group C', date: 'Jun 12', venue: 'MetLife Stadium',
    pctHome: 58, pctDraw: 24, pctAway: 18, boldThreshold: 30,
  },
]

const FAKE_LEADERS = [
  { name: 'Ash 🇦🇺', score: 4, picks: 4 },
  { name: 'Marco 🇧🇷', score: 4, picks: 4 },
  { name: 'Priya 🇮🇳', score: 3, picks: 4 },
  { name: 'Jake 🇺🇸', score: 3, picks: 4 },
  { name: 'Yuki 🇯🇵', score: 2, picks: 4 },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function getPct(m: Match, o: Outcome) {
  return o === 'H' ? m.pctHome : o === 'A' ? m.pctAway : m.pctDraw
}
function isBold(m: Match, o: Outcome) { return getPct(m, o) < m.boldThreshold }

function getFeedback(m: Match, o: Outcome): { headline: string; sub: string } {
  const pct  = getPct(m, o)
  const bold = isBold(m, o)
  const team = o === 'H' ? m.home : o === 'A' ? m.away : null
  if (bold && o !== 'D') return { headline: 'Bold pick ⚡', sub: `Only ${pct}% of players picked ${team}` }
  if (bold && o === 'D') return { headline: 'Risky call 🤔', sub: `Just ${pct}% are backing the draw` }
  if (pct > 60)          return { headline: 'Safe bet 🛡️',  sub: `${pct}% of players agree with you` }
  return { headline: 'Tight call 👀', sub: `${pct}% picked the same — it's close` }
}

function calcScore(picks: Pick[]) { return picks.filter(p => !p.isBold).length }

function getProjectedRank(score: number, boldCount: number) {
  if (boldCount >= 2) return 2
  if (score >= 3)     return 3
  if (score === 2)    return 5
  return 8
}

function liveToMatch(f: LiveFixture, fallback: Match): Match {
  const date = new Date(f.kickoff_utc).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  return {
    id:            f.id,
    home:          f.home,
    homeFlag:      f.home_flag,
    away:          f.away,
    awayFlag:      f.away_flag,
    group:         f.group ?? fallback.group,
    date,
    venue:         f.venue ?? fallback.venue,
    pctHome:       f.pct_home  ?? fallback.pctHome,
    pctDraw:       f.pct_draw  ?? fallback.pctDraw,
    pctAway:       f.pct_away  ?? fallback.pctAway,
    boldThreshold: 30,
  }
}

// ── Components ────────────────────────────────────────────────────────────────
function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 justify-center">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`rounded-full transition-all duration-300 ${
          i < current ? 'w-6 h-2 bg-green-400' : i === current ? 'w-8 h-2 bg-white' : 'w-2 h-2 bg-white/30'
        }`} />
      ))}
    </div>
  )
}

function TeamButton({ flag, name, pct, selected, onSelect, revealed, disabled }: {
  flag: string; name: string; pct: number
  selected: boolean; onSelect: () => void; revealed: boolean; disabled: boolean
}) {
  return (
    <button onClick={onSelect} disabled={disabled}
      className={`w-full relative flex flex-col items-center justify-center rounded-2xl p-5
        transition-all duration-200 active:scale-95 border-2 min-h-[120px]
        ${selected
          ? 'bg-white border-green-400 shadow-[0_0_0_4px_rgba(52,211,153,0.25)]'
          : disabled ? 'bg-white/5 border-white/10 opacity-50'
          : 'bg-white/10 border-white/20 hover:bg-white/20 hover:border-white/40'}`}>
      <span className="text-5xl mb-2">{flag}</span>
      <span className={`font-bold text-base text-center leading-tight ${selected ? 'text-gray-900' : 'text-white'}`}>
        {name}
      </span>
      {revealed && (
        <span className={`mt-2 text-xs font-semibold ${selected ? 'text-green-600' : 'text-white/60'}`}>
          {pct}% picked this
        </span>
      )}
    </button>
  )
}

function DrawButton({ selected, onSelect, pct, revealed, disabled }: {
  selected: boolean; onSelect: () => void; pct: number; revealed: boolean; disabled: boolean
}) {
  return (
    <button onClick={onSelect} disabled={disabled}
      className={`w-full flex items-center justify-center gap-2 rounded-xl py-3 px-4
        transition-all duration-200 active:scale-95 border text-sm font-semibold
        ${selected
          ? 'bg-amber-400 border-amber-300 text-gray-900 shadow-[0_0_0_3px_rgba(251,191,36,0.3)]'
          : disabled ? 'bg-white/5 border-white/10 text-white/30'
          : 'bg-white/10 border-white/20 text-white hover:bg-white/20'}`}>
      <span>🤝</span>
      <span>Draw</span>
      {revealed && <span className="ml-auto text-xs opacity-70">{pct}%</span>}
    </button>
  )
}

// ── Screens ───────────────────────────────────────────────────────────────────
function IntroScreen({ onStart, loading }: { onStart: () => void; loading: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center"
      style={{ background: 'linear-gradient(135deg, #04342C 0%, #0F6E56 50%, #085041 100%)' }}>

      <div className="text-8xl mb-6 animate-bounce" style={{ animationDuration: '2s' }}>⚽</div>

      <div className="mb-2">
        <span className="text-xs font-bold tracking-widest text-green-300 uppercase">
          Tournament Warm-Up · FIFA World Cup 2026
        </span>
      </div>

      <h1 className="text-4xl font-black text-white mb-3 leading-tight">
        4 Match<br />Challenge
      </h1>

      <p className="text-green-200 text-base mb-8 max-w-xs leading-relaxed">
        Pick the winners of the first 4 Warm-Up matches.
        Sign up to experience the full game before it begins — points earned during the warm-up will not count in the real tournament.
      </p>

      <div className="flex items-center gap-6 mb-10 text-sm text-green-300">
        <div className="flex items-center gap-1.5"><span>⚡</span><span>30 seconds</span></div>
        <div className="w-px h-4 bg-green-600" />
        <div className="flex items-center gap-1.5"><span>🏆</span><span>No login needed</span></div>
        <div className="w-px h-4 bg-green-600" />
        <div className="flex items-center gap-1.5"><span>🎯</span><span>4 picks</span></div>
      </div>

      <button onClick={onStart} disabled={loading}
        className="w-full max-w-xs bg-white text-green-900 font-black text-lg
                   rounded-2xl py-4 px-8 shadow-lg active:scale-95 transition-transform
                   disabled:opacity-60 flex items-center justify-center gap-2">
        {loading ? (
          <><span className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />Loading…</>
        ) : 'Start Challenge →'}
      </button>

      <p className="mt-4 text-xs text-green-400">
        Already have an account?{' '}
        <Link href="/login" className="underline text-green-300">Sign in</Link>
      </p>
    </div>
  )
}

function PickScreen({ match, matchIndex, total, onPick }: {
  match: Match; matchIndex: number; total: number; onPick: (o: Outcome) => void
}) {
  const [selected, setSelected] = useState<Outcome | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [feedback, setFeedback] = useState<{ headline: string; sub: string } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFinal = matchIndex === total - 1

  const handlePick = (o: Outcome) => {
    if (selected) return
    setSelected(o)
    setRevealed(true)
    setFeedback(getFeedback(match, o))
    timerRef.current = setTimeout(() => onPick(o), isFinal ? 1800 : 1400)
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return (
    <div className="min-h-screen flex flex-col px-4 pt-safe"
      style={{ background: 'linear-gradient(160deg, #04342C 0%, #085041 60%, #0F6E56 100%)' }}>

      <div className="pt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-bold tracking-widest text-green-400 uppercase">
            Match {matchIndex + 1} of {total}
          </span>
          <span className="text-xs text-green-400 font-medium">{isFinal ? '⭐ Final pick!' : ''}</span>
        </div>
        <ProgressDots current={matchIndex} total={total} />
      </div>

      <div className="text-center mb-6 mt-2">
        <span className="text-xs font-semibold text-green-300 uppercase tracking-wider">
          {match.group} · {match.date} · {match.venue}
        </span>
      </div>

      {isFinal && (
        <div className="mb-4 mx-auto px-4 py-2 rounded-full bg-amber-500/20 border border-amber-400/40">
          <span className="text-amber-300 text-xs font-bold tracking-wide">
            🔥 Last pick — make it count
          </span>
        </div>
      )}

      <div className="flex gap-3 mb-3">
        <TeamButton flag={match.homeFlag} name={match.home} pct={match.pctHome}
          selected={selected === 'H'} onSelect={() => handlePick('H')}
          revealed={revealed} disabled={!!selected && selected !== 'H'} />
        <TeamButton flag={match.awayFlag} name={match.away} pct={match.pctAway}
          selected={selected === 'A'} onSelect={() => handlePick('A')}
          revealed={revealed} disabled={!!selected && selected !== 'A'} />
      </div>

      <DrawButton selected={selected === 'D'} onSelect={() => handlePick('D')}
        pct={match.pctDraw} revealed={revealed}
        disabled={!!selected && selected !== 'D'} />

      {feedback && (
        <div className="mt-6 text-center">
          <p className="text-white font-black text-xl mb-1">{feedback.headline}</p>
          <p className="text-green-300 text-sm">{feedback.sub}</p>
          <p className="text-green-500 text-xs mt-3 animate-pulse">
            {isFinal ? 'Calculating your rank…' : 'Next match coming up…'}
          </p>
        </div>
      )}

      {!selected && (
        <div className="mt-auto pb-8 text-center">
          <p className="text-green-500 text-sm">Tap a team to make your pick</p>
        </div>
      )}
    </div>
  )
}

function ResultScreen({ picks, onSignup, onContinue }: {
  picks: Pick[]; onSignup: () => void; onContinue: () => void
}) {
  const boldCount = picks.filter(p => p.isBold).length
  const score     = calcScore(picks)

  const [rankData, setRankData] = useState<{ total: number; rank: number; leaders: { name: string; points: number }[] } | null>(null)

  useEffect(() => {
    fetch(`/api/challenge-rank?score=${score}`)
      .then(r => r.json())
      .then(d => setRankData(d))
      .catch(() => {})
  }, [score])

  const rank         = rankData?.rank ?? getProjectedRank(score, boldCount)
  const totalPlayers = rankData?.total ?? 0
  const realLeaders  = rankData?.leaders ?? []

  const leaderboard = (() => {
    const you = { name: 'You 🎯', isYou: true }
    if (realLeaders.length === 0) {
      return [
        ...FAKE_LEADERS.slice(0, rank - 1),
        { ...you, score, picks: 4 },
        ...FAKE_LEADERS.slice(rank - 1),
      ].slice(0, 6) as any[]
    }
    const rows = realLeaders.map(l => ({ name: l.name, points: l.points, isYou: false }))
    const insertAt = Math.min(rank - 1, rows.length)
    rows.splice(insertAt, 0, { name: 'You 🎯', points: null, isYou: true } as any)
    return rows.slice(0, 6)
  })()

  const insights: string[] = []
  if (boldCount >= 2) insights.push(`You made ${boldCount} bold picks — high risk, high reward`)
  else if (boldCount === 1) insights.push('You made 1 bold upset pick')
  if (score >= 3) insights.push('You backed the favourites — solid strategy')

  return (
    <div className="min-h-screen flex flex-col px-4 pb-8"
      style={{ background: 'linear-gradient(160deg, #04342C 0%, #085041 60%, #0F6E56 100%)' }}>

      <div className="pt-10 text-center mb-6">
        <div className="text-6xl mb-3">🏆</div>
        <h2 className="text-3xl font-black text-white mb-1">
          You'd be <span className="text-amber-400">#{rank}</span>
        </h2>
        {totalPlayers > 0
          ? <p className="text-green-300 text-sm">out of {totalPlayers.toLocaleString()} warm-up players</p>
          : <p className="text-green-300 text-sm">based on the warm-up leaderboard</p>
        }
      </div>

      {insights[0] && (
        <div className="mx-auto mb-6 px-4 py-2 rounded-full bg-white/10 border border-white/20">
          <span className="text-white text-sm font-medium">💡 {insights[0]}</span>
        </div>
      )}

      {/* Projected leaderboard */}
      <div className="bg-white/10 backdrop-blur rounded-2xl border border-white/20 overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-white/10">
          <span className="text-xs font-bold text-green-300 uppercase tracking-wider">Warm-Up Leaderboard</span>
        </div>
        {leaderboard.map((entry: any, i: number) => {
          const isYou = entry.isYou
          return (
            <div key={i} className={`flex items-center gap-3 px-4 py-3 border-b border-white/10 last:border-0 ${isYou ? 'bg-amber-400/20' : ''}`}>
              <span className={`text-sm font-black w-5 ${isYou ? 'text-amber-400' : 'text-green-400'}`}>#{i + 1}</span>
              <span className={`flex-1 text-sm font-semibold ${isYou ? 'text-amber-300' : 'text-white'}`}>
                {entry.name}
                {isYou && <span className="ml-2 text-xs text-amber-400">(you)</span>}
              </span>
              {!isYou && entry.points != null && (
                <span className="text-xs text-green-300 font-bold">{entry.points} pts</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Picks summary — uses real team data */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        {picks.map((pick, i) => {
          const flag = pick.outcome === 'H' ? pick.homeFlag : pick.outcome === 'A' ? pick.awayFlag : '🤝'
          const team = pick.outcome === 'H' ? pick.home : pick.outcome === 'A' ? pick.away : 'Draw'
          return (
            <div key={i} className="bg-white/10 rounded-xl p-2 text-center border border-white/20">
              <div className="text-2xl mb-1">{flag}</div>
              <div className="text-[10px] text-white font-semibold leading-tight truncate">{team}</div>
              {pick.isBold && <div className="text-[9px] text-amber-400 font-bold mt-0.5">BOLD</div>}
            </div>
          )
        })}
      </div>

      <button onClick={onSignup}
        className="w-full bg-white text-green-900 font-black text-lg
                   rounded-2xl py-4 px-6 shadow-lg active:scale-95 transition-transform mb-2">
        Join & Lock Your Rank 🔒
      </button>

      <p className="text-center text-xs text-green-400 mb-3">
        Free · No credit card · Your picks count in the real comp
      </p>

      <button onClick={onContinue}
        className="w-full text-green-400 text-sm font-medium py-2 underline">
        Maybe later — go to home
      </button>
    </div>
  )
}

function SignupScreen({ picks }: { picks: Pick[] }) {
  const router          = useRouter()
  const { supabase }    = useSupabase()
  const rank            = getProjectedRank(calcScore(picks), picks.filter(p => p.isBold).length)

  const handleGoogleSignUp = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/')}`,
      },
    })
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: 'linear-gradient(160deg, #04342C 0%, #085041 60%, #0F6E56 100%)' }}>

      <div className="text-5xl mb-4">🔒</div>
      <h2 className="text-3xl font-black text-white text-center mb-2">
        Lock in #<span className="text-amber-400">{rank}</span>
      </h2>
      <p className="text-green-300 text-center text-sm mb-5 max-w-xs">
        Create your free account to save your warm-up picks. Note: warm-up points won't carry into the real tournament — but you'll get the full experience before it begins.
      </p>

      {/* Mini picks summary */}
      <div className="flex gap-2 mb-6">
        {picks.map((pick, i) => {
          const flag = pick.outcome === 'H' ? pick.homeFlag : pick.outcome === 'A' ? pick.awayFlag : '🤝'
          return (
            <div key={i} className="bg-white/10 rounded-xl px-2 py-2 text-center border border-white/20 w-14">
              <div className="text-xl mb-0.5">{flag}</div>
              <div className="text-[9px] text-green-300 font-semibold leading-tight">
                {pick.outcome === 'D' ? 'Draw' : pick.outcome === 'H' ? pick.home.split(' ')[0] : pick.away.split(' ')[0]}
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-green-500 text-xs mb-6">Your 4 warm-up picks — saved until you sign up</p>

      <button onClick={handleGoogleSignUp}
        className="w-full max-w-xs flex items-center justify-center gap-3
                   bg-white text-gray-800 font-bold text-base
                   rounded-2xl py-4 px-6 shadow-lg active:scale-95 transition-transform mb-3">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.46 14.013 17.64 11.79 17.64 9.2z" fill="#4285F4"/>
          <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
          <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
          <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.96L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
        </svg>
        Continue with Google
      </button>

      <Link href="/login?tab=register&challenge=1"
        className="w-full max-w-xs flex items-center justify-center gap-3
                   bg-white/15 border border-white/30 text-white font-bold text-base
                   rounded-2xl py-4 px-6 active:scale-95 transition-transform mb-6">
        <span>✉️</span>
        Sign up with Email
      </Link>

      <button onClick={() => router.push('/')}
        className="text-green-400 text-sm underline">
        Skip for now
      </button>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SuChallengePage() {
  const [step,       setStep]       = useState<Step>('intro')
  const [matchIndex, setMatchIndex] = useState(0)
  const [picks,      setPicks]      = useState<Pick[]>([])
  const [matches,    setMatches]    = useState<Match[]>(FALLBACK_MATCHES)
  const [loading,    setLoading]    = useState(true)

  // Fetch live wup fixtures on mount
  useEffect(() => {
    fetch('/api/challenge-fixtures')
      .then(r => r.json())
      .then(({ data }: { data: LiveFixture[] }) => {
        if (data?.length === 4) {
          setMatches(data.map((f, i) => liveToMatch(f, FALLBACK_MATCHES[i])))
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handlePick = (outcome: Outcome) => {
    const m    = matches[matchIndex]
    const bold = isBold(m, outcome)
    const newPick: Pick = {
      fixtureId: m.id,
      outcome,
      isBold:    bold,
      home:      m.home,
      homeFlag:  m.homeFlag,
      away:      m.away,
      awayFlag:  m.awayFlag,
    }
    const newPicks = [...picks, newPick]
    setPicks(newPicks)

    if (matchIndex + 1 >= matches.length) {
      // Persist to localStorage so home page can hydrate after registration
      // Only save picks that have a real DB fixture_id (id > 0)
      const saveable = newPicks.filter(p => p.fixtureId > 0)
      if (saveable.length > 0) {
        try {
          localStorage.setItem(CHALLENGE_PICKS_KEY, JSON.stringify(
            saveable.map(p => ({ fixtureId: p.fixtureId, outcome: p.outcome }))
          ))
          localStorage.setItem(CHALLENGE_SOURCE_KEY, 'wup')
        } catch { /* storage may be blocked in private browsing */ }
      }
      setStep('result')
    } else {
      setMatchIndex(matchIndex + 1)
    }
  }

  return (
    <div className="max-w-md mx-auto">
      {step === 'intro'  && <IntroScreen onStart={() => setStep('pick')} loading={loading} />}
      {step === 'pick'   && (
        <PickScreen key={matchIndex} match={matches[matchIndex]}
          matchIndex={matchIndex} total={matches.length} onPick={handlePick} />
      )}
      {step === 'result' && (
        <ResultScreen picks={picks}
          onSignup={() => setStep('signup')}
          onContinue={() => { window.location.href = '/' }} />
      )}
      {step === 'signup' && <SignupScreen picks={picks} />}
    </div>
  )
}
