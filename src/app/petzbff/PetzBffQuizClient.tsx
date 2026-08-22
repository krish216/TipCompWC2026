'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { newRun, codeFor, STEP, type Question } from '@/lib/petzbff-quiz'

type Screen = 'gate' | 'quiz' | 'result'
type Outcome = 'banked' | 'busted' | 'perfect'

const LEADS_KEY = 'pbff_leads_v1'   // on-device backup; independent of the network

// A lead is only "captured" when the server says so. Nothing here fails quietly - that is
// what cost a day of trade-show leads on the Shopify version.
async function capture(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; emailed?: boolean }> {
  try {
    const res = await fetch('/api/petzbff-promo', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json?.ok) return { ok: false, error: json?.error || `http_${res.status}` }
    // `emailed` tells the finish screen whether the code email actually went out, so we can
    // say "sent to your inbox" rather than promising a mail that may have failed.
    return { ok: true, emailed: !!json?.emailed }
  } catch {
    return { ok: false, error: 'network' }
  }
}

function backupLocally(email: string) {
  try {
    const all = JSON.parse(localStorage.getItem(LEADS_KEY) || '[]')
    all.push({ email, at: new Date().toISOString() })
    localStorage.setItem(LEADS_KEY, JSON.stringify(all))
  } catch { /* private mode; the server write is the real record */ }
}

// Shared bits of chrome. These MUST live at module scope, not inside the component:
// a component defined inside another is a new function identity on every render, so React
// unmounts and remounts its subtree each time — which was blurring the email input on every
// keystroke (the input sits inside <Card>, so it was destroyed and recreated as you typed).
function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-black/10 bg-[#fdf8f2] p-6 sm:p-7">{children}</div>
}
function Btn({ onClick, children, ghost, disabled }: {
  onClick?: () => void; children: React.ReactNode; ghost?: boolean; disabled?: boolean
}) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      className={`w-full rounded-xl px-5 py-4 text-[17px] font-bold uppercase tracking-wide transition disabled:opacity-50 ${
        ghost ? 'border border-black/30 bg-transparent text-[#121212] hover:bg-black/5'
              : 'bg-[#e08151] text-white hover:opacity-90'}`}>
      {children}
    </button>
  )
}

export default function PetzBffQuizClient() {
  const [screen, setScreen]   = useState<Screen>('gate')
  const [bank, setBank]       = useState<Question[]>([])
  const [idx, setIdx]         = useState(0)
  const [correct, setCorrect] = useState(0)
  const [picked, setPicked]   = useState<number | null>(null)

  const [email, setEmail]     = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState('')

  const [outcome, setOutcome] = useState<Outcome>('busted')
  const [finalPct, setFinal]  = useState(STEP)
  const [copied, setCopied]   = useState(false)
  // null = still sending, true = email confirmed sent, false = send failed (code still on screen)
  const [emailed, setEmailed] = useState<boolean | null>(null)

  const sessionId = useRef<string>('')
  if (!sessionId.current && typeof crypto !== 'undefined') sessionId.current = crypto.randomUUID()

  const source = useMemo(() => {
    if (typeof window === 'undefined') return undefined
    return new URLSearchParams(window.location.search).get('ref') || undefined
  }, [])

  // Prefill the email when a player arrives from the PetzBFF Shopify quiz gate, which
  // redirects here as tribepicks.com/petzbff?email=…&ref=shopify-quiz. Done in an effect
  // (not a lazy useState) so the SSR'd input starts empty and there's no hydration mismatch.
  // Consent is deliberately NOT carried in the URL — it's an affirmative action taken here,
  // where the lead is recorded. The player still ticks the box and hits start.
  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get('email')
    if (e) setEmail(e.trim())
  }, [])

  const q = bank[idx]
  const pot = correct * STEP
  const answered = picked !== null

  const startRun = useCallback(async () => {
    const addr = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(addr)) { setError('That email does not look right. Mind checking it?'); return }
    if (!consent) { setError('Tick the box to start.'); return }

    setBusy(true); setError('')
    backupLocally(addr)
    const res = await capture({ email: addr, consent, stage: 'start', sessionId: sessionId.current, source })
    setBusy(false)

    if (!res.ok) {
      // Deliberately blocking. A quiz that plays but never records the lead is worse than
      // one that says it is broken.
      setError(res.error === 'rate_limited'
        ? 'Steady on. Give it a minute and try again.'
        : 'We could not save your email just then. Have another go in a moment.')
      return
    }
    setBank(newRun()); setIdx(0); setCorrect(0); setPicked(null); setScreen('quiz')
  }, [email, consent, source])

  const finish = useCallback(async (pct: number, how: Outcome, scored: number) => {
    setFinal(pct); setOutcome(how); setScreen('result'); setCopied(false); setEmailed(null)
    // Fire and forget: the code is already on screen, so a failure here must not block
    // the player. It is still logged server-side and surfaced in the console.
    const res = await capture({
      email: email.trim().toLowerCase(), consent, stage: 'finish',
      sessionId: sessionId.current, score: scored, outcome: how, pct, source,
    })
    if (!res.ok) console.error('[petzbff] finish not recorded:', res.error)
    // Drives the "sent to your inbox" confirmation on the result screen. A failed request
    // or a captured-but-unsent code both resolve to false, so we never promise a mail that
    // did not go out — the code stays copyable on screen either way.
    setEmailed(res.ok ? (res.emailed ?? false) : false)
  }, [email, consent, source])

  const answer = (choice: number) => {
    if (answered) return
    setPicked(choice)
    const right = choice === q.a
    if (right) {
      const next = correct + 1
      setCorrect(next)
      if (idx + 1 >= bank.length) void finish(bank.length * STEP, 'perfect', next)
    }
  }

  const code = codeFor(finalPct) ?? 'PETZBFF3'

  return (
    <main className="mx-auto max-w-[640px] px-4 py-8 text-[#121212]">
      {screen === 'gate' && (
        <>
          <div className="mb-5 rounded-2xl bg-gradient-to-r from-[#efddc9] to-[#c2ccb1] px-6 py-7">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] opacity-75">PetzBFF presents</p>
            <h1 className="mb-2 text-3xl font-black uppercase leading-tight sm:text-4xl">The Dog Lovers Show Quiz</h1>
            <p className="text-[17px] leading-relaxed">
              Ten questions about dogs, getting harder as you go. Every one you get right adds 3% to your
              discount. Then you choose: bank what you are holding, or stake it on the next question. Get one
              wrong and you are back to 3%. Hold your nerve all ten and it is 30% off.
            </p>
          </div>
          <Card>
            <ul className="mb-6 grid gap-2 text-[15px]">
              {['10 questions, easiest first, hardest last',
                'Every correct answer adds another 3%',
                'After each one: bank it, or stake it on the next',
                'One wrong answer drops you back to 3%',
                'Your code works on anything in the store'].map(t => (
                <li key={t} className="relative pl-7 before:absolute before:left-0 before:content-['🐾']">{t}</li>
              ))}
            </ul>

            <label htmlFor="pb-email" className="mb-1.5 block text-sm font-bold">Pop your email in to start</label>
            <input
              id="pb-email" type="email" value={email} inputMode="email" autoComplete="email"
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void startRun() }}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-black/50 bg-white px-3.5 py-3 text-base outline-none focus:ring-2 focus:ring-[#e08151]" />

            <label className="mt-3.5 flex items-start gap-2.5 text-[13.5px] leading-snug">
              <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
                     className="mt-0.5 h-4 w-4 accent-[#e08151]" />
              <span>Yes, email me my discount code and add me to the PetzBFF list. Unsubscribe any time.</span>
            </label>

            {error && <p role="alert" className="mt-2.5 text-[13.5px] font-bold text-[#b8543c]">{error}</p>}

            <div className="mt-3.5"><Btn onClick={() => void startRun()} disabled={busy}>
              {busy ? 'Saving your spot…' : 'Start the quiz'}
            </Btn></div>
            <p className="mt-3 text-xs opacity-70">
              Your code appears on screen the moment you finish, and we email you a copy.
            </p>
          </Card>
        </>
      )}

      {screen === 'quiz' && q && (
        <>
          <div className="mb-2.5 flex items-baseline justify-between text-xs font-bold uppercase tracking-widest">
            <span>Question {idx + 1} of {bank.length}</span>
            <span className="text-[15px] tracking-wide text-[#e08151]">{pot}% in play</span>
          </div>
          <div className="mb-6 flex gap-1" aria-hidden>
            {bank.map((_, i) => (
              <span key={i} className={`h-2 flex-1 rounded-full ${
                i < correct                                    ? 'bg-[#e08151]'
                : answered && picked !== q.a && i === idx      ? 'bg-[#b8543c]'
                :                                                'bg-black/10'}`} />
            ))}
          </div>

          <h2 className="mb-4 text-[22px] font-bold leading-snug sm:text-[26px]">{q.q}</h2>

          <div className="grid gap-2.5">
            {q.options.map((opt, i) => {
              const isRight = i === q.a
              const state = !answered ? 'idle' : isRight ? 'right' : i === picked ? 'wrong' : 'idle'
              return (
                <button
                  key={opt} type="button" disabled={answered} onClick={() => answer(i)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left text-base transition ${
                    state === 'right' ? 'border-[#4f7d5a] bg-[#f1f7f2]'
                    : state === 'wrong' ? 'border-[#b8543c] bg-[#fdf2ef]'
                    : 'border-black/20 bg-white hover:border-[#e08151]'}`}>
                  <span className={`grid h-6.5 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    state === 'right' ? 'bg-[#4f7d5a] text-white'
                    : state === 'wrong' ? 'bg-[#b8543c] text-white'
                    : 'bg-[#efddc9]'}`}>{'ABCD'[i]}</span>
                  <span>{opt}</span>
                </button>
              )
            })}
          </div>

          {answered && (
            <div className={`mt-4 rounded-xl border border-black/10 bg-[#fdf8f2] p-4 text-[15px]`}>
              <strong className={`mb-1 block text-[17px] ${picked === q.a ? 'text-[#4f7d5a]' : 'text-[#b8543c]'}`}>
                {picked === q.a
                  ? `Correct. ${pot}% in play.`
                  : correct ? `Gone. You were holding ${correct * STEP}%.` : 'Not this time.'}
              </strong>
              <span>{q.why}{picked === q.a && correct === 1 ? ' 3% is your floor, so the next one costs you nothing.' : ''}</span>
            </div>
          )}

          {answered && picked !== q.a && (
            <div className="mt-3.5"><Btn onClick={() => void finish(STEP, 'busted', correct)}>See your discount</Btn></div>
          )}

          {answered && picked === q.a && idx + 1 < bank.length && (
            <div className="mt-3.5 grid gap-2.5">
              <Btn onClick={() => { setIdx(idx + 1); setPicked(null) }}>
                {correct > 1 ? 'Stake it on ' : 'Go on for '}{pot + STEP}%
              </Btn>
              {correct >= 2 && (
                <Btn ghost onClick={() => void finish(pot, 'banked', correct)}>Bank {pot}% and stop</Btn>
              )}
            </div>
          )}
        </>
      )}

      {screen === 'result' && (
        <Card>
          <div className="text-center">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] opacity-75">
              {outcome === 'perfect' ? 'Clean sweep' : outcome === 'banked' ? 'Banked' : 'Run over'}
            </p>
            <h2 className="mb-1 text-2xl font-black">
              {outcome === 'perfect' ? 'Ten from ten. Show off.'
                : outcome === 'banked' ? `Locked in at ${finalPct}%.`
                : 'Back to the floor.'}
            </h2>
            <div className="my-2 text-6xl font-black leading-none text-[#e08151] sm:text-7xl">{finalPct}% off</div>
            <p className="mb-4 text-[15px]">
              {outcome === 'perfect' ? 'Ten straight, including the ones nobody gets. The full 30% is yours.'
                : outcome === 'banked' ? `You walked away after ${correct} of ${bank.length} with your nerve intact. Sensible.`
                : correct ? `You were holding ${correct * STEP}% before that one. The 3% floor is yours anyway.`
                          : 'The first one got you. It happens. The 3% floor is yours anyway.'}
            </p>

            <button
              type="button"
              onClick={() => { navigator.clipboard?.writeText(code).then(() => setCopied(true), () => {}) }}
              className="my-1 inline-block cursor-pointer rounded-xl border-2 border-dashed border-[#e08151] bg-white px-6 py-3.5 font-mono text-2xl font-bold tracking-wider sm:text-3xl">
              {code}
            </button>
            <p className="mb-3 mt-2 min-h-[18px] text-[13px] font-bold text-[#4f7d5a]">{copied ? 'Copied. Paste it at checkout.' : ''}</p>

            {/* Email-delivery confirmation. Resolves a beat after the result screen appears,
                since the send is fire-and-forget — the code is already on screen regardless. */}
            <div className="mb-4 rounded-xl border border-black/10 bg-white px-4 py-3 text-[13.5px] leading-snug">
              {emailed === null ? (
                <span className="opacity-70">📨 Sending your code to <strong>{email}</strong>…</span>
              ) : emailed ? (
                <span className="text-[#4f7d5a]">✅ We’ve emailed your code to <strong>{email}</strong>. Check your inbox (and spam, just in case).</span>
              ) : (
                <span className="text-[#b8543c]">We couldn’t email your code just now — copy it above so you don’t lose it. It still works at checkout.</span>
              )}
            </div>

            <div className="grid gap-2.5">
              <a href="https://petzbff.com.au/collections/all" target="_blank" rel="noopener noreferrer"
                 className="w-full rounded-xl bg-[#e08151] px-5 py-4 text-[17px] font-bold uppercase tracking-wide text-white hover:opacity-90">
                Spend it on something good
              </a>
              <Btn ghost onClick={() => {
                setEmail(''); setConsent(false); setError(''); setPicked(null)
                setIdx(0); setCorrect(0)
                sessionId.current = crypto.randomUUID()
                setScreen('gate')
              }}>Play again</Btn>
            </div>
            <p className="mt-3 text-xs opacity-70">Enter the code at checkout. One use per customer.</p>
          </div>
        </Card>
      )}
    </main>
  )
}
