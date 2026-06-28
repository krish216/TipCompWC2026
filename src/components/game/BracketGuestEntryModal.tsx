'use client'

import { useState, useRef, useEffect } from 'react'

// Phase 3 — guest entry into the Bracket Challenge prize draw.
// Collects name + email + the two tie-break totals + consent, then POSTs to
// /api/bracket/guest-enter along with the guest's localStorage bracket. A new
// email is entered instantly (account created server-side); an email that
// already has an account is bounced to a magic login link, and we stash the
// entry so it replays once they're logged in (see PENDING_ENTRY_KEY below).

export const PENDING_ENTRY_KEY = 'tribepicks_pending_bracket_entry'
// Per-challenge "this guest has entered" marker (they're not logged in, so we
// can't ask the server). Lets the bracket page show an entry summary.
export const ENTERED_KEY = (challenge?: string) => `tribepicks_bracket_entered_${challenge || 'default'}`

interface Props {
  tournamentId: string
  picks: Record<string, string | null>
  sessionId: string
  source?: string | null
  device?: string
  challenge?: string           // challenge slug being entered (omitted → default)
  hasPrize?: boolean           // sponsor with a live prize → use prize-draw copy
  challengeName?: string | null
  sponsorName?: string | null
  sponsorSubsidiary?: string | null
  sponsorLogo?: string | null
  sponsorLogoTone?: string | null
  onClose: () => void
}

export function BracketGuestEntryModal({ tournamentId, picks, sessionId, source, device, challenge, hasPrize, challengeName, sponsorName, sponsorLogo, onClose }: Props) {
  const [name,       setName]       = useState('')
  const [email,      setEmail]      = useState('')
  const [finalGoals, setFinalGoals] = useState('')
  const [tpGoals,    setTpGoals]    = useState('')
  const [phone,      setPhone]      = useState('')
  const [postcode,   setPostcode]   = useState('')
  const [terms,      setTerms]      = useState(false)
  const [marketing,  setMarketing]  = useState(false)
  const [over18,     setOver18]     = useState(false)   // prize-draw eligibility (AU 18+)
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [done,       setDone]       = useState<{ message: string } | null>(null)
  // Email verification
  const [code,        setCode]       = useState('')
  const [codeSent,    setCodeSent]   = useState(false)
  const [sendingCode, setSendingCode] = useState(false)

  // Scroll/focus targets so we can guide the user to the next required field —
  // most of these sit below the fold, so a disabled CTA is otherwise a dead end.
  const scrollBoxRef = useRef<HTMLDivElement>(null)
  const nameRef     = useRef<HTMLInputElement>(null)
  const emailRef    = useRef<HTMLInputElement>(null)
  const codeRef     = useRef<HTMLInputElement>(null)
  const tieRef      = useRef<HTMLDivElement>(null)
  const postcodeRef = useRef<HTMLInputElement>(null)
  const consentRef  = useRef<HTMLDivElement>(null)

  // Reliably scroll the modal's own scroll box to bring `el` into view. We scroll
  // the container explicitly (rect math) rather than el.scrollIntoView(), which is
  // flaky inside a flex/overflow modal and gets overridden by native focus-scroll.
  const reveal = (el: HTMLElement | null, focus = false) => {
    const box = scrollBoxRef.current
    if (!box || !el) return
    const delta = el.getBoundingClientRect().bottom - box.getBoundingClientRect().bottom + 24
    if (delta > 0) box.scrollTo({ top: box.scrollTop + delta, behavior: 'smooth' })
    if (focus) setTimeout(() => el.focus?.(), 300)
  }

  const numOk    = (v: string) => v !== '' && Number.isInteger(+v) && +v >= 0 && +v <= 20
  const emailOk  = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
  const codeOk   = /^\d{6}$/.test(code.trim())
  const pcOk     = !hasPrize || /^\d{4}$/.test(postcode.trim())   // postcode required for prize draws
  const ageOk    = !hasPrize || over18   // must confirm 18+ to enter a prize draw
  const canSubmit = name.trim().length >= 2 && emailOk && codeSent && codeOk && terms && marketing && ageOk && numOk(finalGoals) && numOk(tpGoals) && pcOk && !submitting

  // The first unmet requirement (in form order): drives both the helper line above
  // the CTA and where a tap on the (incomplete) CTA jumps the user to.
  const missing: { ref: React.RefObject<HTMLElement>; msg: string; focus?: boolean } | null =
      name.trim().length < 2              ? { ref: nameRef,     msg: 'Enter your name', focus: true }
    : !emailOk                            ? { ref: emailRef,    msg: 'Enter a valid email', focus: true }
    : !codeSent                           ? { ref: emailRef,    msg: 'Tap “Send code”, then enter the code we email you' }
    : !codeOk                             ? { ref: codeRef,     msg: 'Enter the 6-digit code from your email', focus: true }
    : (!numOk(finalGoals) || !numOk(tpGoals)) ? { ref: tieRef,  msg: 'Add your tie-breaker goal totals' }
    : !pcOk                               ? { ref: postcodeRef, msg: 'Enter your 4-digit postcode', focus: true }
    : !ageOk                              ? { ref: consentRef,  msg: 'Confirm you’re 18 or older' }
    : !terms                              ? { ref: consentRef,  msg: 'Accept the terms & conditions' }
    : !marketing                          ? { ref: consentRef,  msg: 'Agree to share your details with the sponsor' }
    : null

  // Once the email code is fully entered, advance the user to the next required
  // section (tie-breakers + consents sit below the fold) so they aren't left
  // staring at a disabled CTA, unsure what's missing.
  useEffect(() => {
    if (codeOk) reveal(tieRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeOk])

  // CTA is always tappable: complete → submit; incomplete → jump to the first
  // missing field (and focus it when it's a text input) instead of doing nothing.
  const handleEnter = () => {
    if (canSubmit) { submit(); return }
    if (missing) reveal(missing.ref.current, missing.focus)
  }

  const sendCode = async () => {
    if (!emailOk) { setError('Enter a valid email first.'); return }
    setSendingCode(true); setError(null)
    try {
      const res = await fetch('/api/bracket/send-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) setCodeSent(true)
      else setError(d.error ?? 'Could not send the code.')
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSendingCode(false)
    }
  }

  const submit = async () => {
    setSubmitting(true); setError(null)
    try {
      const res = await fetch('/api/bracket/guest-enter', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournament_id: tournamentId,
          challenge:     challenge || undefined,
          name:          name.trim(),
          email:         email.trim(),
          code:          code.trim(),
          final_goals:   +finalGoals,
          tp_goals:      +tpGoals,
          phone:         phone.trim() || undefined,
          postcode:      postcode.trim() || undefined,
          consent_terms: terms,
          consent_marketing: marketing,
          consent_over18: over18,
          picks,
          session_id:    sessionId,
          source:        source ?? undefined,
          device:        device ?? undefined,
          timezone:      Intl.DateTimeFormat().resolvedOptions().timeZone || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? 'Could not submit your entry.'); return }

      // Their entry is saved either way. Mark this device as entered so the
      // bracket page shows an "entered" summary rather than the Enter CTA.
      try { localStorage.setItem(ENTERED_KEY(challenge), JSON.stringify({ final_goals: +finalGoals, tp_goals: +tpGoals })) } catch {}

      // Primary path: the code verified the email, so we signed them straight in.
      // Hard-navigate (not router.push) so the freshly-set session cookies are
      // picked up and they land on the leaderboard as a real logged-in user.
      if (data.status === 'signed_in') {
        window.location.href = data.redirect || '/bracket/leaderboard'
        return
      }

      // Fallback (session couldn't be established) → a sign-in link was emailed.
      setDone({ message: data.message ?? 'You’re entered! Check your email to sign in.' })
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const numInput = (v: string, set: (s: string) => void, onBlur?: () => void) => (
    <input type="number" min={0} max={20} value={v} inputMode="numeric"
      onChange={e => set(e.target.value.replace(/[^0-9]/g, ''))}
      onBlur={onBlur}
      className="w-16 h-11 text-center text-lg font-bold border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400" />
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:px-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {sponsorLogo && <img src={sponsorLogo} alt={sponsorName || 'Sponsor'} className="h-9 w-auto max-w-[84px] object-contain rounded flex-shrink-0" />}
            <div className="min-w-0">
              {sponsorLogo && <p className="text-[9px] uppercase tracking-[0.12em] text-gray-400 leading-none mb-0.5">Presents</p>}
              <h3 className="text-sm font-bold text-gray-900 leading-tight truncate">{challengeName || (hasPrize ? '🏆 Enter the Bracket Challenge' : '🎯 Enter your bracket')}</h3>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1 flex-shrink-0" aria-label="Close">✕</button>
        </div>

        {done ? (
          <div className="px-5 py-8 text-center space-y-3">
            <div className="text-4xl">📩</div>
            <p className="text-sm font-bold text-emerald-900">You’re all set</p>
            <p className="text-sm text-gray-600">{done.message}</p>
            <p className="text-[11px] text-gray-400">Can’t find the email? Check your spam/junk folder.</p>
            <button onClick={onClose} className="w-full py-3 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white">Done</button>
          </div>
        ) : (
          <>
          <div ref={scrollBoxRef} className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
            <p className="text-xs text-gray-500">{hasPrize ? 'Enter your details to join the prize draw. We’ll create your free TribePicks account so your bracket is saved and scored all tournament.' : 'Enter your details to save your bracket. We’ll create your free TribePicks account so it’s scored all tournament long.'}</p>

            <input ref={nameRef} type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Your name"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            {/* Email + verification code */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <input ref={emailRef} type="email" value={email} onChange={e => { setEmail(e.target.value); setCodeSent(false); setCode('') }} inputMode="email" autoComplete="email"
                  placeholder="Email address"
                  className="flex-1 min-w-0 text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                <button onClick={sendCode} disabled={!emailOk || sendingCode}
                  className="flex-shrink-0 px-3 py-2.5 rounded-xl text-xs font-bold bg-gray-800 text-white hover:bg-gray-900 disabled:opacity-50 whitespace-nowrap">
                  {sendingCode ? 'Sending…' : codeSent ? 'Resend' : 'Send code'}
                </button>
              </div>
              {codeSent && (
                <>
                  <input ref={codeRef} type="text" value={code} onChange={e => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                    inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code from your email"
                    className="w-full text-sm tracking-[0.3em] font-bold text-center border-2 border-emerald-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                  <p className="text-[11px] text-emerald-700">📩 We emailed a code to <strong>{email.trim()}</strong> — enter it to verify and lock in your entry.</p>
                  <p className="text-[11px] text-gray-400">Can’t find it? Check your spam/junk folder (and add us to your contacts).</p>
                </>
              )}
            </div>

            <div ref={tieRef} className="border-t border-gray-100 pt-3 space-y-3 scroll-mt-2">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Tie-breakers</p>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-800">Total goals in the <strong>Final</strong></label>
                {numInput(finalGoals, setFinalGoals, () => { if (numOk(finalGoals)) reveal(consentRef.current) })}
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-800">Total goals in the <strong>3rd-place</strong> match</label>
                {numInput(tpGoals, setTpGoals)}
              </div>
              <p className="text-[11px] text-gray-400 -mt-1">⚽ Count goals up to the end of extra time — penalty shootouts don’t count.</p>
            </div>

            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="Phone (optional — for the prize)"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-400" />

            {hasPrize && (
              <input ref={postcodeRef} type="text" inputMode="numeric" value={postcode}
                onChange={e => setPostcode(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                placeholder="Postcode (to go in the prize draw) *"
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            )}

            <div ref={consentRef} className="space-y-3 scroll-mt-2">
              {hasPrize && (
                <label className="flex items-start gap-2.5 text-xs text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={over18} onChange={e => setOver18(e.target.checked)} className="mt-0.5 w-4 h-4 accent-emerald-600" />
                  <span>I confirm I am 18 years or older. <span className="text-red-500">*</span></span>
                </label>
              )}
              <label className="flex items-start gap-2.5 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} className="mt-0.5 w-4 h-4 accent-emerald-600" />
                <span>I accept the challenge <a href="/terms" target="_blank" className="underline">terms &amp; conditions</a>. <span className="text-red-500">*</span></span>
              </label>
              <label className="flex items-start gap-2.5 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={marketing} onChange={e => setMarketing(e.target.checked)} className="mt-0.5 w-4 h-4 accent-emerald-600" />
                <span>{hasPrize
                  ? <>I agree my postcode and contact details can be shared with the prize sponsor, who runs the draw and may contact me about their services.</>
                  : <>I agree my contact details can be shared with the prize sponsor, who hands out the prizes.</>} <span className="text-red-500">*</span></span>
              </label>
            </div>
          </div>
          <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0 space-y-2">
            {error && <p className="text-xs text-red-600">{error}</p>}
            {!canSubmit && !submitting && missing && (
              <p className="text-center text-[11px] font-medium text-amber-600">👉 {missing.msg}</p>
            )}
            <button onClick={handleEnter} aria-disabled={!canSubmit}
              className={`w-full py-3 rounded-xl text-sm font-bold text-white transition-colors ${canSubmit ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-emerald-600/50 hover:bg-emerald-600/60'}`}>
              {submitting ? 'Entering…' : 'Enter to win 🎯'}
            </button>
            <p className="text-center text-[11px] text-gray-400">Already have an account? Just use this email — we’ll send you a login link.</p>
          </div>
          </>
        )}
      </div>
    </div>
  )
}
