'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSupabase } from '@/components/layout/SupabaseProvider'

type Intent = 'organise' | 'join'

// Expression-of-interest form for /melbourne-cup — one form, two kinds of lead (see
// migration 197). Fields switch with the intent; the API keeps only the ones that apply.
export function EoiForm({ tournamentId, source, initialIntent }: { tournamentId: string; source: string | null; initialIntent: Intent }) {
  const { session } = useSupabase()
  const [intent, setIntent] = useState<Intent>(initialIntent)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [organisation, setOrganisation] = useState('')
  const [groupSize, setGroupSize] = useState('')
  const [tickets, setTickets] = useState('1')
  const [notes, setNotes] = useState('')
  const [website, setWebsite] = useState('')   // honeypot
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // Signed in → prefill their email, but leave it editable.
  useEffect(() => {
    if (session?.user?.email && !email) setEmail(session.user.email)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.email])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSending(true); setError(null)
    const size = parseInt(groupSize, 10)
    const res = await fetch('/api/sweep/eoi', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tournament_id: tournamentId, intent, name, email, website,
        source: source ?? undefined,
        notes: notes.trim() || undefined,
        ...(intent === 'organise'
          ? { organisation: organisation.trim() || undefined, group_size: Number.isInteger(size) && size > 0 ? size : undefined }
          : { tickets: parseInt(tickets, 10) || 1 }),
      }),
    }).then(r => r.json()).catch(() => ({ error: 'Something went wrong — please try again.' }))
    setSending(false)
    if (res.error) { setError(res.error); return }
    setDone(true)
  }

  if (done) {
    return (
      <div className="border border-emerald-200 bg-emerald-50 rounded-2xl p-5 text-center">
        <div className="text-3xl">🎉</div>
        <p className="font-bold text-gray-900 mt-1">Thanks{name ? `, ${name.split(' ')[0]}` : ''} — you're on the list.</p>
        <p className="text-xs text-gray-600 mt-1">
          {intent === 'organise' ? "We'll be in touch to help you get your sweep running." : "We'll let you know when there's a sweep you can join."}
        </p>
        {intent === 'organise' && (
          <Link href="/sweep" className="inline-block mt-4 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4 py-2 rounded-lg">
            Or start your sweep now →
          </Link>
        )}
      </div>
    )
  }

  const input = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm'
  return (
    <form onSubmit={submit} className="border border-gray-200 rounded-2xl p-5 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {([['organise', '🏁 I want to run a sweep'], ['join', '🎟️ I want to join a sweep']] as const).map(([v, label]) => (
          <button key={v} type="button" onClick={() => setIntent(v)}
            className={`text-xs font-bold px-3 py-2.5 rounded-lg ${intent === v ? 'bg-emerald-600 text-white' : 'border border-gray-300 text-gray-600'}`}>
            {label}
          </button>
        ))}
      </div>

      <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" required maxLength={80} className={input} />
      <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" required maxLength={120} className={input} />

      {intent === 'organise' ? (
        <div className="flex gap-2">
          <input value={organisation} onChange={e => setOrganisation(e.target.value)} placeholder="Workplace / club / group (optional)" maxLength={120} className={`${input} flex-1`} />
          <input value={groupSize} onChange={e => setGroupSize(e.target.value)} placeholder="How many people?" inputMode="numeric" className={`${input} w-36`} />
        </div>
      ) : (
        <label className="flex items-center justify-between gap-3">
          <span className="text-xs text-gray-500">Tickets you'd like</span>
          <select value={tickets} onChange={e => setTickets(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-2 text-sm">
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      )}

      <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} maxLength={500}
        placeholder={intent === 'organise' ? 'Anything we should know? (optional)' : 'Anything else? (optional)'} className={input} />

      {/* Honeypot: hidden from people, irresistible to bots. */}
      <input value={website} onChange={e => setWebsite(e.target.value)} name="website" tabIndex={-1} autoComplete="off"
        aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />

      {error && <p className="text-xs text-red-600">{error}</p>}
      <button type="submit" disabled={sending}
        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-lg">
        {sending ? 'Sending…' : 'Register interest →'}
      </button>
    </form>
  )
}
