'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────
type Outcome = 'H' | 'D' | 'A'
type Step = 'intro' | 'pick' | 'result' | 'signup'

interface Match {
  id:       number
  home:     string
  homeFlag: string
  away:     string
  awayFlag: string
  group:    string
  date:     string
  venue:    string
  // Simulated pick % based on FIFA rankings / betting consensus
  pctHome:  number
  pctDraw:  number
  pctAway:  number
  // "Bold pick" threshold — if user picks option with < 30% consensus
  boldThreshold: number
}

interface Pick {
  matchId:  number
  outcome:  Outcome
  isBold:   boolean
}

// ── First 4 WC2026 Group Stage fixtures ──────────────────────────────────────
const MATCHES: Match[] = [
  {
    id: 1,
    home: 'Mexico', homeFlag: '🇲🇽',
    away: 'South Africa', awayFlag: '🇿🇦',
    group: 'Group A', date: 'Jun 11', venue: 'Estadio Azteca',
    pctHome: 62, pctDraw: 22, pctAway: 16,
    boldThreshold: 30,
  },
  {
    id: 2,
    home: 'South Korea', homeFlag: '🇰🇷',
    away: 'Czechia', awayFlag: '🇨🇿',
    group: 'Group A', date: 'Jun 12', venue: 'Estadio Akron',
    pctHome: 41, pctDraw: 28, pctAway: 31,
    boldThreshold: 30,
  },
  {
    id: 3,
    home: 'USA', homeFlag: '🇺🇸',
    away: 'Panama', awayFlag: '🇵🇦',
    group: 'Group B', date: 'Jun 12', venue: 'SoFi Stadium',
    pctHome: 71, pctDraw: 17, pctAway: 12,
    boldThreshold: 30,
  },
  {
    id: 4,
    home: 'Uruguay', homeFlag: '🇺🇾',
    away: 'Egypt', awayFlag: '🇪🇬',
    group: 'Group C', date: 'Jun 12', venue: 'MetLife Stadium',
    pctHome: 58, pctDraw: 24, pctAway: 18,
    boldThreshold: 30,
  },
]

// Simulated leaderboard — feels real, drives FOMO
const FAKE_LEADERS = [
  { name: 'Ash 🇦🇺', score: 4, picks: 4 },
  { name: 'Marco 🇧🇷', score: 4, picks: 4 },
  { name: 'Priya 🇮🇳', score: 3, picks: 4 },
  { name: 'Jake 🇺🇸', score: 3, picks: 4 },
  { name: 'Yuki 🇯🇵', score: 2, picks: 4 },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
const FLAGS: Record<string, string> = {
  Mexico: '🇲🇽', 'South Africa': '🇿🇦', 'South Korea': '🇰🇷',
  Czechia: '🇨🇿', USA: '🇺🇸', Panama: '🇵🇦', Uruguay: '🇺🇾', Egypt: '🇪🇬',
}

function getPct(m: Match, o: Outcome) {
  return o === 'H' ? m.pctHome : o === 'A' ? m.pctAway : m.pctDraw
}

function isBold(m: Match, o: Outcome) {
  return getPct(m, o) < m.boldThreshold
}

function getFeedback(m: Match, o: Outcome): { headline: string; sub: string } {
  const pct = getPct(m, o)
  const bold = isBold(m, o)
  const team = o === 'H' ? m.home : o === 'A' ? m.away : null

  if (bold && o !== 'D') return {
    headline: `Bold pick ⚡`,
    sub: `Only ${pct}% of players picked ${team}`,
  }
  if (bold && o === 'D') return {
    headline: `Risky call 🤔`,
    sub: `Just ${pct}% are backing the draw`,
  }
  if (pct > 60) return {
    headline: `Safe bet 🛡️`,
    sub: `${pct}% of players agree with you`,
  }
  return {
    headline: `Tight call 👀`,
    sub: `${pct}% picked the same — it's close`,
  }
}

function calcScore(picks: Pick[]) {
  return picks.reduce((s, p) => s + (p.isBold ? 0 : 1), 0)
}

function getProjectedRank(score: number, boldCount: number) {
  if (boldCount >= 2) return 2
  if (score >= 3) return 3
  if (score === 2) return 5
  return 8
}

// ── Components ────────────────────────────────────────────────────────────────

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 justify-center">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i < current
              ? 'w-6 h-2 bg-green-400'
              : i === current
              ? 'w-8 h-2 bg-white'
              : 'w-2 h-2 bg-white/30'
          }`}
        />
      ))}
    </div>
  )
}

function TeamButton({
  flag, name, pct, outcome, selected, onSelect, revealed, disabled,
}: {
  flag: string; name: string; pct: number; outcome: Outcome
  selected: boolean; onSelect: () => void; revealed: boolean; disabled: boolean
}) {
  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={`
        w-full relative flex flex-col items-center justify-center
        rounded-2xl p-5 transition-all duration-200 active:scale-95
        border-2 min-h-[120px]
        ${selected
          ? 'bg-white border-green-400 shadow-[0_0_0_4px_rgba(52,211,153,0.25)]'
          : disabled
          ? 'bg-white/5 border-white/10 opacity-50'
          : 'bg-white/10 border-white/20 hover:bg-white/20 hover:border-white/40'
        }
      `}
    >
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

function DrawButton({
  selected, onSelect, pct, revealed, disabled,
}: {
  selected: boolean; onSelect: () => void; pct: number; revealed: boolean; disabled: boolean
}) {
  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={`
        w-full flex items-center justify-center gap-2
        rounded-xl py-3 px-4 transition-all duration-200 active:scale-95
        border text-sm font-semibold
        ${selected
          ? 'bg-amber-400 border-amber-300 text-gray-900 shadow-[0_0_0_3px_rgba(251,191,36,0.3)]'
          : disabled
          ? 'bg-white/5 border-white/10 text-white/30'
          : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
        }
      `}
    >
      <span>🤝</span>
      <span>Draw</span>
      {revealed && <span className="ml-auto text-xs opacity-70">{pct}%</span>}
    </button>
  )
}

// ── Screens ───────────────────────────────────────────────────────────────────

function IntroScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center"
      style={{ background: 'linear-gradient(135deg, #04342C 0%, #0F6E56 50%, #085041 100%)' }}>

      {/* Decorative ball */}
      <div className="text-8xl mb-6 animate-bounce" style={{ animationDuration: '2s' }}>⚽</div>

      <div className="mb-2">
        <span className="text-xs font-bold tracking-widest text-green-300 uppercase">
          FIFA World Cup 2026
        </span>
      </div>

      <h1 className="text-4xl font-black text-white mb-3 leading-tight">
        4 Match<br />Challenge
      </h1>

      <p className="text-green-200 text-base mb-8 max-w-xs leading-relaxed">
        Pick the winners of the first 4 Group Stage matches.
        See how you rank against other tipsters.
      </p>

      <div className="flex items-center gap-6 mb-10 text-sm text-green-300">
        <div className="flex items-center gap-1.5">
          <span>⚡</span>
          <span>30 seconds</span>
        </div>
        <div className="w-px h-4 bg-green-600" />
        <div className="flex items-center gap-1.5">
          <span>🏆</span>
          <span>No login needed</span>
        </div>
        <div className="w-px h-4 bg-green-600" />
        <div className="flex items-center gap-1.5">
          <span>🎯</span>
          <span>4 picks</span>
        </div>
      </div>

      <button
        onClick={onStart}
        className="w-full max-w-xs bg-white text-green-900 font-black text-lg
                   rounded-2xl py-4 px-8 shadow-lg active:scale-95 transition-transform"
      >
        Start Challenge →
      </button>

      <p className="mt-4 text-xs text-green-400">
        Already have an account?{' '}
        <Link href="/login" className="underline text-green-300">Sign in</Link>
      </p>
    </div>
  )
}

function PickScreen({
  match, matchIndex, total, onPick,
}: {
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

    timerRef.current = setTimeout(() => {
      onPick(o)
    }, isFinal ? 1800 : 1400)
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return (
    <div
      className="min-h-screen flex flex-col px-4 pt-safe"
      style={{ background: 'linear-gradient(160deg, #04342C 0%, #085041 60%, #0F6E56 100%)' }}
    >
      {/* Header */}
      <div className="pt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-bold tracking-widest text-green-400 uppercase">
            Match {matchIndex + 1} of {total}
          </span>
          <span className="text-xs text-green-400 font-medium">
            {isFinal ? '⭐ Final pick!' : ''}
          </span>
        </div>
        <ProgressDots current={matchIndex} total={total} />
      </div>

      {/* Match info */}
      <div className="text-center mb-6 mt-2">
        <span className="text-xs font-semibold text-green-300 uppercase tracking-wider">
          {match.group} · {match.date} · {match.venue}
        </span>
      </div>

      {/* Tension label for final match */}
      {isFinal && (
        <div className="mb-4 mx-auto px-4 py-2 rounded-full bg-amber-500/20 border border-amber-400/40">
          <span className="text-amber-300 text-xs font-bold tracking-wide">
            🔥 Last pick — make it count
          </span>
        </div>
      )}

      {/* Team buttons */}
      <div className="flex gap-3 mb-3">
        <TeamButton
          flag={match.homeFlag} name={match.home}
          pct={match.pctHome} outcome="H"
          selected={selected === 'H'} onSelect={() => handlePick('H')}
          revealed={revealed} disabled={!!selected && selected !== 'H'}
        />
        <TeamButton
          flag={match.awayFlag} name={match.away}
          pct={match.pctAway} outcome="A"
          selected={selected === 'A'} onSelect={() => handlePick('A')}
          revealed={revealed} disabled={!!selected && selected !== 'A'}
        />
      </div>

      <DrawButton
        selected={selected === 'D'} onSelect={() => handlePick('D')}
        pct={match.pctDraw} revealed={revealed}
        disabled={!!selected && selected !== 'D'}
      />

      {/* Feedback */}
      {feedback && (
        <div className="mt-6 text-center animate-fade-in">
          <p className="text-white font-black text-xl mb-1">{feedback.headline}</p>
          <p className="text-green-300 text-sm">{feedback.sub}</p>
          <p className="text-green-500 text-xs mt-3 animate-pulse">
            {isFinal ? 'Calculating your rank…' : 'Next match coming up…'}
          </p>
        </div>
      )}

      {/* Empty state prompt */}
      {!selected && (
        <div className="mt-auto pb-8 text-center">
          <p className="text-green-500 text-sm">Tap a team to make your pick</p>
        </div>
      )}
    </div>
  )
}

function ResultScreen({
  picks, onSignup, onContinue,
}: {
  picks: Pick[]; onSignup: () => void; onContinue: () => void
}) {
  const boldCount = picks.filter(p => p.isBold).length
  const score = calcScore(picks)
  const rank = getProjectedRank(score, boldCount)
  const totalPlayers = 2847

  // Insert "You" at projected rank position
  const leaderboard = [
    ...FAKE_LEADERS.slice(0, rank - 1),
    { name: 'You 🎯', score, picks: 4, isYou: true },
    ...FAKE_LEADERS.slice(rank - 1),
  ].slice(0, 6)

  const insights: string[] = []
  if (boldCount >= 2) insights.push(`You made ${boldCount} bold picks — high risk, high reward`)
  else if (boldCount === 1) insights.push('You made 1 bold upset pick')
  if (score >= 3) insights.push('You backed the favourites — solid strategy')
  if (boldCount === 0 && score <= 2) insights.push('Mix of safe and risky picks')

  return (
    <div
      className="min-h-screen flex flex-col px-4 pb-8"
      style={{ background: 'linear-gradient(160deg, #04342C 0%, #085041 60%, #0F6E56 100%)' }}
    >
      {/* Trophy moment */}
      <div className="pt-10 text-center mb-6">
        <div className="text-6xl mb-3">🏆</div>
        <h2 className="text-3xl font-black text-white mb-1">
          You'd be <span className="text-amber-400">#{rank}</span>
        </h2>
        <p className="text-green-300 text-sm">
          out of {totalPlayers.toLocaleString()} players
        </p>
      </div>

      {/* Insight pill */}
      {insights[0] && (
        <div className="mx-auto mb-6 px-4 py-2 rounded-full bg-white/10 border border-white/20">
          <span className="text-white text-sm font-medium">💡 {insights[0]}</span>
        </div>
      )}

      {/* Leaderboard preview */}
      <div className="bg-white/10 backdrop-blur rounded-2xl border border-white/20 overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-white/10">
          <span className="text-xs font-bold text-green-300 uppercase tracking-wider">
            Projected Leaderboard
          </span>
        </div>
        {leaderboard.map((entry, i) => {
          const isYou = (entry as any).isYou
          return (
            <div
              key={i}
              className={`flex items-center gap-3 px-4 py-3 border-b border-white/10 last:border-0
                ${isYou ? 'bg-amber-400/20' : ''}`}
            >
              <span className={`text-sm font-black w-5 ${isYou ? 'text-amber-400' : 'text-green-400'}`}>
                #{i + 1}
              </span>
              <span className={`flex-1 text-sm font-semibold ${isYou ? 'text-amber-300' : 'text-white'}`}>
                {entry.name}
                {isYou && <span className="ml-2 text-xs text-amber-400">(you)</span>}
              </span>
              <div className="flex items-center gap-1">
                {Array.from({ length: entry.picks }).map((_, j) => (
                  <div
                    key={j}
                    className={`w-2 h-2 rounded-full ${
                      j < entry.score
                        ? isYou ? 'bg-amber-400' : 'bg-green-400'
                        : 'bg-white/20'
                    }`}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Picks summary */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        {picks.map((pick, i) => {
          const m = MATCHES[i]
          const team = pick.outcome === 'H' ? m.home : pick.outcome === 'A' ? m.away : 'Draw'
          const flag = pick.outcome === 'H' ? m.homeFlag : pick.outcome === 'A' ? m.awayFlag : '🤝'
          return (
            <div key={i} className="bg-white/10 rounded-xl p-2 text-center border border-white/20">
              <div className="text-2xl mb-1">{flag}</div>
              <div className="text-[10px] text-white font-semibold leading-tight truncate">{team}</div>
              {pick.isBold && <div className="text-[9px] text-amber-400 font-bold mt-0.5">BOLD</div>}
            </div>
          )
        })}
      </div>

      {/* CTA */}
      <button
        onClick={onSignup}
        className="w-full bg-white text-green-900 font-black text-lg
                   rounded-2xl py-4 px-6 shadow-lg active:scale-95 transition-transform mb-3"
      >
        Join & Lock Your Rank 🔒
      </button>

      <p className="text-center text-xs text-green-400 mb-2">
        Free · No credit card · 30 second setup
      </p>

      <button
        onClick={onContinue}
        className="w-full text-green-400 text-sm font-medium py-2 underline"
      >
        Maybe later — explore the app
      </button>
    </div>
  )
}

function SignupScreen({ picks }: { picks: Pick[] }) {
  const router = useRouter()
  const rank = getProjectedRank(calcScore(picks), picks.filter(p => p.isBold).length)

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: 'linear-gradient(160deg, #04342C 0%, #085041 60%, #0F6E56 100%)' }}
    >
      <div className="text-5xl mb-4">🔒</div>
      <h2 className="text-3xl font-black text-white text-center mb-2">
        Lock in #<span className="text-amber-400">{rank}</span>
      </h2>
      <p className="text-green-300 text-center text-sm mb-8 max-w-xs">
        Create your free account to save your picks and compete when the tournament starts.
      </p>

      {/* Google SSO */}
      <Link
        href="/login?next=/predict&challenge=1"
        className="w-full max-w-xs flex items-center justify-center gap-3
                   bg-white text-gray-800 font-bold text-base
                   rounded-2xl py-4 px-6 shadow-lg active:scale-95 transition-transform mb-3"
      >
        <span className="text-xl">G</span>
        Continue with Google
      </Link>

      {/* Email signup */}
      <Link
        href="/login?next=/predict&challenge=1&mode=signup"
        className="w-full max-w-xs flex items-center justify-center gap-3
                   bg-white/15 border border-white/30 text-white font-bold text-base
                   rounded-2xl py-4 px-6 active:scale-95 transition-transform mb-6"
      >
        <span>✉️</span>
        Sign up with Email
      </Link>

      <p className="text-xs text-green-500 text-center max-w-xs">
        Your picks are saved for 24 hours.
        Create an account before they expire.
      </p>

      <button
        onClick={() => router.push('/predict')}
        className="mt-6 text-green-400 text-sm underline"
      >
        Skip for now
      </button>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SuChallengePage() {
  const [step, setStep]               = useState<Step>('intro')
  const [matchIndex, setMatchIndex]   = useState(0)
  const [picks, setPicks]             = useState<Pick[]>([])

  const handleStart = () => setStep('pick')

  const handlePick = (outcome: Outcome) => {
    const m = MATCHES[matchIndex]
    const bold = isBold(m, outcome)
    const newPicks = [...picks, { matchId: m.id, outcome, isBold: bold }]
    setPicks(newPicks)

    if (matchIndex + 1 >= MATCHES.length) {
      setStep('result')
    } else {
      setMatchIndex(matchIndex + 1)
    }
  }

  const handleSignup = () => setStep('signup')
  const handleContinue = () => {
    window.location.href = '/predict'
  }

  return (
    <div className="max-w-md mx-auto">
      {step === 'intro'  && <IntroScreen onStart={handleStart} />}
      {step === 'pick'   && (
        <PickScreen
          key={matchIndex}
          match={MATCHES[matchIndex]}
          matchIndex={matchIndex}
          total={MATCHES.length}
          onPick={handlePick}
        />
      )}
      {step === 'result' && (
        <ResultScreen picks={picks} onSignup={handleSignup} onContinue={handleContinue} />
      )}
      {step === 'signup' && <SignupScreen picks={picks} />}
    </div>
  )
}
