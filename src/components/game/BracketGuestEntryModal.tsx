'use client'

import { useState } from 'react'

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
  onClose: () => void
}

export function BracketGuestEntryModal({ tournamentId, picks, sessionId, source, device, challenge, onClose }: Props) {
  const [name,       setName]       = useState('')
  const [email,      setEmail]      = useState('')
  const [finalGoals, setFinalGoals] = useState('')
  const [tpGoals,    setTpGoals]    = useState('')
  const [phone,      setPhone]      = useState('')
  const [terms,      setTerms]      = useState(false)
  const [marketing,  setMarketing]  = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [done,       setDone]       = useState<{ message: string } | null>(null)

  const numOk    = (v: string) => v !== '' && Number.isInteger(+v) && +v >= 0 && +v <= 20
  const emailOk  = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
  const canSubmit = name.trim().length >= 2 && emailOk && terms && marketing && numOk(finalGoals) && numOk(tpGoals) && !submitting

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
          final_goals:   +finalGoals,
          tp_goals:      +tpGoals,
          phone:         phone.trim() || undefined,
          consent_terms: terms,
          consent_marketing: marketing,
          picks,
          session_id:    sessionId,
          source:        source ?? undefined,
          device:        device ?? undefined,
          timezone:      Intl.DateTimeFormat().resolvedOptions().timeZone || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? 'Could not submit your entry.'); return }

      // Existing-email path: account untouched, login link sent. Stash the entry
      // so it can be replayed once they're authenticated.
      if (data.status === 'existing') {
        try {
          localStorage.setItem(PENDING_ENTRY_KEY, JSON.stringify({
            tournament_id: tournamentId, challenge: challenge || undefined,
            final_goals: +finalGoals, tp_goals: +tpGoals,
            phone: phone.trim() || null, consent_terms: true, consent_marketing: true,
          }))
        } catch {}
      } else {
        // New email → actually entered now. Remember it so the bracket page can
        // show an "entered" summary instead of the Enter CTA (guest, not logged in).
        try { localStorage.setItem(ENTERED_KEY(challenge), JSON.stringify({ final_goals: +finalGoals, tp_goals: +tpGoals })) } catch {}
      }
      setDone({ message: data.message ?? 'You’re in the draw!' })
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const numInput = (v: string, set: (s: string) => void) => (
    <input type="number" min={0} max={20} value={v} inputMode="numeric"
      onChange={e => set(e.target.value.replace(/[^0-9]/g, ''))}
      className="w-16 h-11 text-center text-lg font-bold border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400" />
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:px-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">🏆 Enter the Bracket Challenge</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1" aria-label="Close">✕</button>
        </div>

        {done ? (
          <div className="px-5 py-8 text-center space-y-3">
            <div className="text-4xl">📩</div>
            <p className="text-sm font-bold text-emerald-900">You’re all set</p>
            <p className="text-sm text-gray-600">{done.message}</p>
            <button onClick={onClose} className="w-full py-3 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white">Done</button>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            <p className="text-xs text-gray-500">Enter your details to join the prize draw. We’ll create your free TribePicks account so your bracket is saved and scored all tournament.</p>

            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Your name"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} inputMode="email" autoComplete="email"
              placeholder="Email address"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-400" />

            <div className="border-t border-gray-100 pt-3 space-y-3">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Tie-breakers</p>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-800">Total goals in the <strong>Final</strong></label>
                {numInput(finalGoals, setFinalGoals)}
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

            <label className="flex items-start gap-2.5 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} className="mt-0.5 w-4 h-4 accent-emerald-600" />
              <span>I accept the challenge <a href="/terms" target="_blank" className="underline">terms &amp; conditions</a>. <span className="text-red-500">*</span></span>
            </label>
            <label className="flex items-start gap-2.5 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={marketing} onChange={e => setMarketing(e.target.checked)} className="mt-0.5 w-4 h-4 accent-emerald-600" />
              <span>I agree my contact details can be shared with the prize sponsor, who hands out the prizes. <span className="text-red-500">*</span></span>
            </label>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button onClick={submit} disabled={!canSubmit}
              className="w-full py-3 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition-colors">
              {submitting ? 'Entering…' : 'Enter to win 🎯'}
            </button>
            <p className="text-center text-[11px] text-gray-400">Already have an account? Just use this email — we’ll send you a login link.</p>
          </div>
        )}
      </div>
    </div>
  )
}
