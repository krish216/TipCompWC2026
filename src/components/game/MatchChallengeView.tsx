'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { Flag, Spinner } from '@/components/ui'

// Single-match prediction challenge: a countdown banner, the score predictor, a
// guest-or-member entry flow, and the leaderboard — all on one shareable page.

interface Entry { rank: number; name: string; pred?: string; advances?: string | null; fgm?: number | null; points?: number; exact?: boolean; is_me: boolean }
interface Data {
  challenge: { slug: string; name: string }
  fixture: { home: string; away: string; venue: string | null; round: string | null; kickoff_utc: string; home_score: number | null; away_score: number | null; first_goal_min: number | null; advancer: string | null } | null
  sponsor: { name: string; logo: string; prize: string; url: string; logo_tone: string; tagline: string | null; logo_includes_name: boolean } | null
  has_prize: boolean
  lock_at: string | null
  locked: boolean
  settled: boolean
  entrants: number
  entries: Entry[]
  logged_in: boolean
  me: { pred: string; pred_home: number; pred_away: number; advances: string | null; first_goal_min: number | null } | null
}

const pad = (n: number) => String(n).padStart(2, '0')
function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

export function MatchChallengeView({ slug }: { slug: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr]   = useState(false)
  const [now, setNow]   = useState(0)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/match/leaderboard?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' })
      if (!r.ok) { setErr(true); return }
      setData(await r.json())
    } catch { setErr(true) }
  }, [slug])

  useEffect(() => { load() }, [load])
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])

  if (err) return <div className="max-w-xl mx-auto px-4 py-20 text-center text-sm text-gray-500">Couldn’t load this challenge.</div>
  if (!data) return <div className="flex justify-center py-24"><Spinner className="w-7 h-7" /></div>
  if (!data.challenge || !data.fixture) return <div className="max-w-xl mx-auto px-4 py-20 text-center"><div className="text-4xl mb-3">⚽</div><p className="text-sm text-gray-500">This match challenge isn’t available.</p></div>

  const fx = data.fixture
  const koMs   = new Date(fx.kickoff_utc).getTime()
  const lockMs = data.lock_at ? new Date(data.lock_at).getTime() : koMs
  const lockedNow = data.locked || (now > 0 && now >= lockMs)

  return (
    <div className="max-w-xl mx-auto px-4 py-5 pb-28">
      <CountdownBanner now={now} koMs={koMs} lockMs={lockMs} settled={data.settled} fx={fx} />

      {/* Sponsor hero */}
      <div className="rounded-2xl overflow-hidden shadow-lg mb-4" style={{ background: 'linear-gradient(160deg,#0a2e1c 0%,#153d26 50%,#0d3320 100%)' }}>
        <div className="px-5 py-5 text-center">
          {data.sponsor && (
            <p className="text-[9px] uppercase tracking-[0.2em] text-amber-300 mb-1.5">
              {data.sponsor.tagline ? `${data.sponsor.name} · ${data.sponsor.tagline}` : `Proudly hosted by ${data.sponsor.name}`}
            </p>
          )}
          <div className="flex items-center justify-center gap-3 mb-1">
            <span className="flex items-center gap-2"><Flag team={fx.home} className="text-2xl rounded shadow-sm" /><span className="text-lg font-black text-white">{fx.home}</span></span>
            <span className="text-sm font-bold text-white/50">v</span>
            <span className="flex items-center gap-2"><span className="text-lg font-black text-white">{fx.away}</span><Flag team={fx.away} className="text-2xl rounded shadow-sm" /></span>
          </div>
          <p className="text-[11px] text-white/60">{fx.venue}{fx.venue ? ' · ' : ''}{new Date(fx.kickoff_utc).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Sydney' })} AEST</p>
          {data.has_prize && data.sponsor?.prize && (
            <p className="mt-2 inline-block bg-amber-400 text-emerald-950 text-sm font-extrabold px-3 py-1.5 rounded-lg">🏆 Win {data.sponsor.prize}</p>
          )}
        </div>
      </div>

      {data.settled ? (
        <FinalResult fx={fx} />
      ) : lockedNow ? (
        <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center text-sm text-gray-600">🔒 Predictions are locked — kick-off is here. Good luck!</div>
      ) : (
        <Predictor slug={slug} data={data} onEntered={load} />
      )}

      <Leaderboard data={data} lockedNow={lockedNow} />
    </div>
  )
}

// ── Countdown banner ──────────────────────────────────────────────────────────
function CountdownBanner({ now, koMs, lockMs, settled, fx }: {
  now: number; koMs: number; lockMs: number; settled: boolean
  fx: { home: string; away: string; home_score: number | null; away_score: number | null }
}) {
  if (settled) {
    return (
      <div className="mb-4 rounded-xl bg-emerald-600 text-white px-4 py-3 text-center">
        <p className="text-[11px] uppercase tracking-widest text-emerald-100">Full time</p>
        <p className="text-lg font-black">{fx.home} {fx.home_score}–{fx.away_score} {fx.away}</p>
      </div>
    )
  }
  if (now === 0) return <div className="mb-4 h-[52px] rounded-xl bg-gray-100 animate-pulse" />
  if (now < lockMs) {
    return (
      <div className="mb-4 rounded-xl bg-emerald-950 text-white px-4 py-3 text-center">
        <p className="text-[11px] uppercase tracking-widest text-amber-300">Predictions lock in</p>
        <p className="text-2xl font-black tabular-nums tracking-tight">{fmtCountdown(lockMs - now)}</p>
        <p className="text-[10px] text-white/50 mt-0.5">Entries close 5 min before kick-off</p>
      </div>
    )
  }
  if (now < koMs) {
    return (
      <div className="mb-4 rounded-xl bg-gray-800 text-white px-4 py-3 text-center">
        <p className="text-[11px] uppercase tracking-widest text-gray-300">🔒 Locked · kick-off in</p>
        <p className="text-2xl font-black tabular-nums tracking-tight">{fmtCountdown(koMs - now)}</p>
      </div>
    )
  }
  return (
    <div className="mb-4 rounded-xl bg-gray-900 text-white px-4 py-3 text-center">
      <p className="text-lg font-black">⚽ Kick-off! Match in progress</p>
      <p className="text-[10px] text-white/50 mt-0.5">Leaderboard scores the moment the result is in</p>
    </div>
  )
}

function FinalResult({ fx }: { fx: { home: string; away: string; home_score: number | null; away_score: number | null; first_goal_min: number | null; advancer: string | null } }) {
  return (
    <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm text-emerald-900">
      Final: <strong>{fx.home} {fx.home_score}–{fx.away_score} {fx.away}</strong>
      {fx.advancer && <> · <strong>{fx.advancer}</strong> go through 🎉</>}
      {typeof fx.first_goal_min === 'number' && <div className="text-[11px] text-emerald-700 mt-0.5">Tie-break — first goal: <strong>{fx.first_goal_min === 0 ? 'none (0–0)' : `${fx.first_goal_min}'`}</strong></div>}
    </div>
  )
}

// ── Goal stepper ────────────────────────────────────────────────────────────
function Stepper({ label, team, value, onChange }: { label: string; team: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <Flag team={team} className="text-2xl rounded shadow-sm" />
      <span className="text-xs font-bold text-gray-700 max-w-[7rem] truncate">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} aria-label={`${team} fewer`}
          className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-lg font-black active:scale-95">−</button>
        <span className="w-8 text-center text-2xl font-black tabular-nums">{value}</span>
        <button type="button" onClick={() => onChange(Math.min(20, value + 1))} aria-label={`${team} more`}
          className="w-9 h-9 rounded-full bg-emerald-100 hover:bg-emerald-200 text-emerald-700 text-lg font-black active:scale-95">+</button>
      </div>
    </div>
  )
}

// ── Predictor + entry ─────────────────────────────────────────────────────────
function Predictor({ slug, data, onEntered }: { slug: string; data: Data; onEntered: () => void }) {
  const fx = data.fixture!
  const [ph, setPh] = useState(data.me?.pred_home ?? 4)
  const [pa, setPa] = useState(data.me?.pred_away ?? 4)
  const [adv, setAdv] = useState<string>(data.me?.advances ?? (fx.home))
  const [fgm, setFgm] = useState<number>(data.me?.first_goal_min ?? 15)   // predicted minute of the 1st goal

  // Keep "who advances" in step with a decisive scoreline; a draw leaves it to the user.
  useEffect(() => {
    if (ph > pa) setAdv(fx.home)
    else if (pa > ph) setAdv(fx.away)
  }, [ph, pa, fx.home, fx.away])
  const isDraw = ph === pa

  const [name, setName]   = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode]   = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [sending, setSending]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [postcode, setPostcode] = useState('')
  const [over18, setOver18]     = useState(false)
  const [terms, setTerms]       = useState(false)
  const [mktg, setMktg]         = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const entered = !!data.me
  const prizeFieldsOk = !data.has_prize || (/^\d{4}$/.test(postcode) && over18 && mktg)

  const sendCode = async () => {
    setError(null)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setError('Enter a valid email.'); return }
    setSending(true)
    try {
      const r = await fetch('/api/bracket/send-code', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
      const j = await r.json()
      if (!r.ok) { setError(j.error || 'Could not send the code.'); return }
      setCodeSent(true)
    } finally { setSending(false) }
  }

  const submit = async () => {
    setError(null); setMsg(null)
    if (!terms) { setError('Please accept the terms to enter.'); return }
    const payload: any = { slug, pred_home: ph, pred_away: pa, advances_team: adv, first_goal_min: fgm, consent_terms: true, consent_marketing: mktg, consent_over18: over18, postcode }
    setSubmitting(true)
    try {
      if (data.logged_in) {
        const r = await fetch('/api/match/enter', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
        const j = await r.json()
        if (!r.ok) { setError(j.error || 'Could not save your prediction.'); return }
        onEntered()
      } else {
        if (name.trim().length < 2) { setError('Enter your name.'); return }
        if (!codeSent) { setError('Send yourself a verification code first.'); return }
        const r = await fetch('/api/match/guest-enter', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, name, email, code, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) })
        const j = await r.json()
        if (!r.ok) { setError(j.error || 'Could not enter.'); return }
        if (j.redirect && j.status === 'signed_in') { window.location.href = j.redirect; return }
        setMsg(j.message || 'You’re in! Check your email.')
        onEntered()
      }
    } finally { setSubmitting(false) }
  }

  return (
    <div className="mb-5 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-emerald-600 text-white px-4 py-2.5 text-center text-sm font-bold">
        {entered ? 'Change your prediction' : 'Pick the full-time score'}
      </div>
      <div className="px-4 py-4">
        <div className="flex items-start justify-center gap-6">
          <Stepper label={fx.home} team={fx.home} value={ph} onChange={setPh} />
          <span className="text-2xl font-black text-gray-300 mt-9">:</span>
          <Stepper label={fx.away} team={fx.away} value={pa} onChange={setPa} />
        </div>

        {/* Who advances — the draw resolver + tiebreak */}
        <div className="mt-4">
          <p className="text-center text-[11px] font-semibold text-gray-500 mb-1.5">
            {isDraw ? 'A draw! Who goes through on penalties?' : 'Who advances?'}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[fx.home, fx.away].map(team => (
              <button key={team} type="button" onClick={() => setAdv(team)}
                className={clsx('flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-bold border transition-all',
                  adv === team ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-300')}>
                <Flag team={team} className="text-base rounded-sm" /><span className="truncate">{team}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tie-breaker — closest predicted first-goal minute wins a dead heat */}
        <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
          <p className="text-[11px] font-semibold text-amber-800 text-center mb-1.5">⏱️ Tie-breaker — what minute is the <strong>first goal</strong>?</p>
          <div className="flex items-center justify-center gap-2">
            <button type="button" onClick={() => setFgm(Math.max(0, fgm - 1))} className="w-8 h-8 rounded-full bg-white border border-amber-200 text-amber-700 text-lg font-black active:scale-95">−</button>
            <span className="w-16 text-center text-xl font-black tabular-nums">{fgm === 0 ? '0–0' : `${fgm}'`}</span>
            <button type="button" onClick={() => setFgm(Math.min(120, fgm + 1))} className="w-8 h-8 rounded-full bg-amber-100 border border-amber-200 text-amber-700 text-lg font-black active:scale-95">+</button>
          </div>
          <p className="text-[10px] text-amber-600 text-center mt-1">Closest wins if scores tie · 0 = no goals</p>
        </div>

        {entered && (
          <p className="mt-3 text-center text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg py-1.5">
            ✓ You’re in with <strong>{data.me!.pred}</strong>{data.me!.advances ? ` · ${data.me!.advances} through` : ''}{typeof data.me!.first_goal_min === 'number' ? ` · 1st goal ${data.me!.first_goal_min === 0 ? '0–0' : `${data.me!.first_goal_min}'`}` : ''}. Change it any time before lock.
          </p>
        )}

        {/* Entry fields */}
        <div className="mt-4 space-y-2.5">
          {!data.logged_in && (
            <>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-emerald-400 focus:outline-none" />
              <div className="flex gap-2">
                <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email"
                  className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-emerald-400 focus:outline-none" />
                <button type="button" onClick={sendCode} disabled={sending}
                  className="px-3 py-2.5 rounded-xl bg-gray-900 text-white text-xs font-bold whitespace-nowrap disabled:opacity-50">
                  {sending ? '…' : codeSent ? 'Resend' : 'Send code'}</button>
              </div>
              {codeSent && (
                <input value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" placeholder="6-digit code from your email"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm tracking-widest focus:border-emerald-400 focus:outline-none" />
              )}
            </>
          )}

          {data.has_prize && (
            <input value={postcode} onChange={e => setPostcode(e.target.value)} inputMode="numeric" maxLength={4} placeholder="Postcode (for the prize draw)"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-emerald-400 focus:outline-none" />
          )}

          <label className="flex items-start gap-2 text-[11px] text-gray-600">
            <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} className="mt-0.5" />
            <span>I accept the <a href="/terms" target="_blank" className="underline">terms</a>{data.has_prize ? ' & prize draw conditions' : ''}.</span>
          </label>
          {data.has_prize && (
            <>
              <label className="flex items-start gap-2 text-[11px] text-gray-600">
                <input type="checkbox" checked={mktg} onChange={e => setMktg(e.target.checked)} className="mt-0.5" />
                <span>I’m happy to share my details with {data.sponsor?.name ?? 'the sponsor'}.</span>
              </label>
              <label className="flex items-start gap-2 text-[11px] text-gray-600">
                <input type="checkbox" checked={over18} onChange={e => setOver18(e.target.checked)} className="mt-0.5" />
                <span>I’m 18 or older.</span>
              </label>
            </>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
          {msg && <p className="text-xs text-emerald-700 font-semibold">{msg}</p>}

          <button type="button" onClick={submit} disabled={submitting || !terms || !prizeFieldsOk}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-base font-extrabold px-5 py-3.5 rounded-xl shadow-md transition-all disabled:opacity-50">
            {submitting ? 'Submitting…' : entered ? 'Update my prediction' : data.has_prize ? 'Enter the prize draw →' : 'Lock in my prediction →'}
          </button>
          {!data.logged_in && <p className="text-center text-[10px] text-gray-400">No account needed — we’ll save it to your email.</p>}
        </div>
      </div>
    </div>
  )
}

// ── Leaderboard ─────────────────────────────────────────────────────────────
function Leaderboard({ data, lockedNow }: { data: Data; lockedNow: boolean }) {
  const share = async () => {
    const url = `${window.location.origin}/match/${data.challenge.slug}`
    try { if (navigator.share) { await navigator.share({ title: data.challenge.name, url }); return } } catch { /* fall through */ }
    try { await navigator.clipboard.writeText(url) } catch { /* noop */ }
  }
  const medal = (r: number) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `${r}`)

  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
          {data.settled ? 'Final leaderboard' : `${data.entrants} ${data.entrants === 1 ? 'prediction' : 'predictions'} in`}
        </p>
        <button onClick={share} className="text-xs font-bold text-emerald-600 hover:text-emerald-700">Share ↗</button>
      </div>

      {data.entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">
          Be the first to predict — get your mates in before it locks 🍻
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 overflow-hidden">
          {data.entries.map(e => (
            <div key={`${e.rank}-${e.name}`} className={clsx('flex items-center gap-3 px-4 py-2.5', e.is_me && 'bg-emerald-50/60')}>
              <span className="w-6 text-center text-sm font-bold text-gray-400 flex-shrink-0">{data.settled ? medal(e.rank) : '·'}</span>
              <span className="flex-1 min-w-0 text-sm font-semibold text-gray-800 truncate">{e.name}{e.is_me && ' (you)'}</span>
              {(data.settled || lockedNow) && <span className={clsx('text-xs font-bold tabular-nums flex-shrink-0', e.exact ? 'text-emerald-600' : 'text-gray-400')}>{e.pred}{e.exact ? ' ✓' : ''}</span>}
              {data.settled && <span className="w-8 text-right text-sm font-black tabular-nums text-emerald-700 flex-shrink-0">{e.points}</span>}
            </div>
          ))}
        </div>
      )}
      {!data.settled && !lockedNow && (
        <p className="text-center text-[11px] text-gray-400 mt-2">Everyone’s picks stay hidden until entries lock. Scores land when the result’s in.</p>
      )}
    </div>
  )
}
