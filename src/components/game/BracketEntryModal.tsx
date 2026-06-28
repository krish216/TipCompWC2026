'use client'

import { useState, useRef } from 'react'

// Member entry into the Bracket Challenge prize comp: capture the two tie-break
// totals (goals in the Final + the 3rd-place match) and consent, then POST.
// `challenge` is the challenge slug being entered (omitted → the default one).
// `editing` + `initial` re-open the form to amend an existing entry (the POST
// upserts on user+challenge, so re-submitting overwrites the tie-breakers).
export function BracketEntryModal({ challenge, challengeName, editing, initial, hasPrize, sponsorName, sponsorLogo, onClose, onEntered }: {
  challenge?: string
  challengeName?: string
  editing?: boolean
  initial?: { final_goals?: number | null; tp_goals?: number | null; phone?: string | null; postcode?: string | null }
  hasPrize?: boolean   // sponsored challenge with a live prize → capture postcode for the draw
  sponsorName?: string | null
  sponsorSubsidiary?: string | null
  sponsorLogo?: string | null
  sponsorLogoTone?: string | null
  onClose: () => void
  onEntered: () => void
}) {
  const [finalGoals, setFinalGoals] = useState(initial?.final_goals != null ? String(initial.final_goals) : '')
  const [tpGoals,    setTpGoals]    = useState(initial?.tp_goals != null ? String(initial.tp_goals) : '')
  const [terms,      setTerms]      = useState(!!editing)     // already consented when amending
  const [marketing,  setMarketing]  = useState(!!editing)
  const [over18,     setOver18]     = useState(!!editing)     // prize-draw eligibility (AU 18+)
  const [phone,      setPhone]      = useState(initial?.phone ?? '')
  const [postcode,   setPostcode]   = useState(initial?.postcode ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // Scroll/focus targets — the postcode + consent fields sit below the fold, so a
  // disabled CTA is otherwise a dead end (the user can't see what's missing).
  const scrollBoxRef = useRef<HTMLDivElement>(null)
  const tieRef       = useRef<HTMLDivElement>(null)
  const postcodeRef  = useRef<HTMLInputElement>(null)
  const consentRef   = useRef<HTMLDivElement>(null)

  // Scroll the modal's own scroll box (rect math, not el.scrollIntoView() which is
  // flaky here). Deferred so it runs AFTER the browser's native focus-scroll, which
  // would otherwise override ours when the user taps the next field.
  // align 'top' → pin element near the top (reveals everything below it);
  // align 'bottom' → bring the element's bottom into view (jump to one field).
  const scrollBox = (el: HTMLElement | null, align: 'top' | 'bottom', focus = false) => {
    const box = scrollBoxRef.current
    if (!box || !el) return
    setTimeout(() => {
      const b = box.getBoundingClientRect()
      const e = el.getBoundingClientRect()
      const delta = align === 'top' ? (e.top - b.top - 12) : (e.bottom - b.bottom + 24)
      box.scrollTo({ top: box.scrollTop + delta, behavior: 'smooth' })
    }, 60)
    if (focus) setTimeout(() => el.focus?.(), 120)
  }

  const numOk = (v: string) => v !== '' && Number.isInteger(+v) && +v >= 0 && +v <= 20
  const pcOk  = !hasPrize || /^\d{4}$/.test(postcode.trim())   // postcode required for prize draws
  const ageOk = !hasPrize || over18                            // must confirm 18+ to enter a prize draw
  const canSubmit = terms && marketing && ageOk && numOk(finalGoals) && numOk(tpGoals) && pcOk && !submitting

  // First unmet requirement (in form order): drives the helper line above the CTA
  // and where a tap on the (incomplete) CTA jumps the user to.
  const missing: { ref?: React.RefObject<HTMLElement>; msg: string; focus?: boolean } | null =
      !numOk(finalGoals) ? { msg: 'Add total goals for the Final' }
    : !numOk(tpGoals)    ? { msg: 'Add total goals for the 3rd-place match' }
    : !pcOk              ? { ref: postcodeRef, msg: 'Enter your 4-digit postcode', focus: true }
    : !ageOk             ? { ref: consentRef,  msg: 'Confirm you’re 18 or older' }
    : !terms             ? { ref: consentRef,  msg: 'Accept the terms & conditions' }
    : !marketing         ? { ref: consentRef,  msg: 'Agree to share your details with the sponsor' }
    : null

  // CTA is always tappable: complete → submit; incomplete → jump to the first
  // missing field (and focus it when it's a text input) instead of doing nothing.
  const handleEnter = () => {
    if (canSubmit) { submit(); return }
    if (missing?.ref) scrollBox(missing.ref.current, 'bottom', missing.focus)
  }

  const submit = async () => {
    setSubmitting(true); setError(null)
    try {
      const res = await fetch('/api/bracket/enter', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          final_goals: +finalGoals, tp_goals: +tpGoals,
          consent_terms: terms, consent_marketing: marketing, consent_over18: over18,
          phone: phone.trim() || undefined,
          postcode: postcode.trim() || undefined,
          challenge: challenge || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) onEntered()
      else setError(data.error ?? 'Could not submit your entry.')
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const withdraw = async () => {
    if (!confirm('Withdraw from the draw? This removes your entry and takes you off this leaderboard. You can re-enter any time before entries close.')) return
    setSubmitting(true); setError(null)
    try {
      const res = await fetch(`/api/bracket/enter${challenge ? `?challenge=${encodeURIComponent(challenge)}` : ''}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) onEntered()   // refresh entry status → caller now sees the "enter" CTA
      else setError(data.error ?? 'Could not withdraw your entry.')
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
              {sponsorLogo && !editing && <p className="text-[9px] uppercase tracking-[0.12em] text-gray-400 leading-none mb-0.5">Presents</p>}
              <h3 className="text-sm font-bold text-gray-900 leading-tight truncate">{editing ? '✏️ Update your entry' : (challengeName ?? '🏆 Enter the Bracket Challenge')}</h3>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1 flex-shrink-0" aria-label="Close">✕</button>
        </div>

        <div ref={scrollBoxRef} className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
          <p className="text-xs text-gray-500">Two quick tie-breakers (used only if players finish level on points), then you&apos;re in the draw.</p>

          <div ref={tieRef} className="space-y-4 scroll-mt-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-800">Total goals in the <strong>Final</strong></label>
              {numInput(finalGoals, setFinalGoals, () => { if (numOk(finalGoals)) scrollBox(tieRef.current, 'top') })}
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-800">Total goals in the <strong>3rd-place</strong> match</label>
              {numInput(tpGoals, setTpGoals)}
            </div>
            <p className="text-[11px] text-gray-400 -mt-1">⚽ Count goals up to the end of extra time — penalty shootouts don&apos;t count.</p>
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
            {submitting ? (editing ? 'Updating…' : 'Entering…') : (editing ? 'Update entry' : 'Enter to win 🎯')}
          </button>
          {editing && (
            <button onClick={withdraw} disabled={submitting}
              className="w-full text-center text-xs font-medium text-red-600 hover:text-red-700 underline disabled:opacity-50">
              Withdraw from the draw
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
