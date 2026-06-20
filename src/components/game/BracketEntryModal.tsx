'use client'

import { useState } from 'react'

// Member entry into the Bracket Challenge prize comp: capture the two tie-break
// totals (goals in the Final + the 3rd-place match) and consent, then POST.
// `challenge` is the challenge slug being entered (omitted → the default one).
// `editing` + `initial` re-open the form to amend an existing entry (the POST
// upserts on user+challenge, so re-submitting overwrites the tie-breakers).
export function BracketEntryModal({ challenge, challengeName, editing, initial, onClose, onEntered }: {
  challenge?: string
  challengeName?: string
  editing?: boolean
  initial?: { final_goals?: number | null; tp_goals?: number | null; phone?: string | null }
  onClose: () => void
  onEntered: () => void
}) {
  const [finalGoals, setFinalGoals] = useState(initial?.final_goals != null ? String(initial.final_goals) : '')
  const [tpGoals,    setTpGoals]    = useState(initial?.tp_goals != null ? String(initial.tp_goals) : '')
  const [terms,      setTerms]      = useState(!!editing)     // already consented when amending
  const [marketing,  setMarketing]  = useState(!!editing)
  const [phone,      setPhone]      = useState(initial?.phone ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  const numOk = (v: string) => v !== '' && Number.isInteger(+v) && +v >= 0 && +v <= 20
  const canSubmit = terms && marketing && numOk(finalGoals) && numOk(tpGoals) && !submitting

  const submit = async () => {
    setSubmitting(true); setError(null)
    try {
      const res = await fetch('/api/bracket/enter', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          final_goals: +finalGoals, tp_goals: +tpGoals,
          consent_terms: terms, consent_marketing: marketing,
          phone: phone.trim() || undefined,
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

  const numInput = (v: string, set: (s: string) => void) => (
    <input type="number" min={0} max={20} value={v} inputMode="numeric"
      onChange={e => set(e.target.value.replace(/[^0-9]/g, ''))}
      className="w-16 h-11 text-center text-lg font-bold border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400" />
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:px-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">{editing ? `✏️ Update your entry${challengeName ? ` · ${challengeName}` : ''}` : `🏆 Enter the ${challengeName ?? 'Bracket Challenge'}`}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1" aria-label="Close">✕</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-gray-500">Two quick tie-breakers (used only if players finish level on points), then you&apos;re in the draw.</p>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-800">Total goals in the <strong>Final</strong></label>
            {numInput(finalGoals, setFinalGoals)}
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-800">Total goals in the <strong>3rd-place</strong> match</label>
            {numInput(tpGoals, setTpGoals)}
          </div>
          <p className="text-[11px] text-gray-400 -mt-1">⚽ Count goals up to the end of extra time — penalty shootouts don&apos;t count.</p>

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
