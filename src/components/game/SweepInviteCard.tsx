'use client'

import { useEffect, useState } from 'react'

// sweep-admin's "Invite by email" (Sell tab): paste a list of addresses — one per line, or a
// copied Outlook "To:" line — and each gets a sweep invite from the organiser
// (/api/comps/:id/sweep/invites). Below it, who still needs a nudge: invitations not taken up
// yet (resend / remove), and people who joined but hold no ticket — the ones to chase
// before pools lock.

type Invite = { id: string; email: string; invited_at: string; display_name: string | null }
type Member = { user_id: string; display_name: string }

// Pulls addresses out of anything pasted: "Sam <sam@x.com>; jo@y.com", one per line, etc.
const parseEmails = (text: string) => [...new Set((text.match(/[^\s<>;,"'()]+@[^\s<>;,"'()]+\.[^\s<>;,"'()]+/g) ?? []).map(e => e.toLowerCase()))]

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins}m ago`
  const hrs = Math.round(mins / 60)
  return hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`
}

export function SweepInviteCard({ compId, className = '' }: { compId: string; className?: string }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [invited, setInvited] = useState<Invite[]>([])
  const [noTicket, setNoTicket] = useState<Member[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    const res = await fetch(`/api/comps/${compId}/sweep/invites`).then(r => r.json()).catch(() => null)
    if (!res || res.error) return
    setInvited(res.invited ?? []); setNoTicket(res.no_ticket ?? [])
  }
  useEffect(() => { load() }, [compId])   // eslint-disable-line react-hooks/exhaustive-deps

  const emails = parseEmails(text)

  async function send() {
    if (!emails.length) return
    setSending(true); setMsg(null)
    const res = await fetch(`/api/comps/${compId}/sweep/invites`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emails }),
    }).then(r => r.json()).catch(() => ({ error: 'Something went wrong — try again' }))
    setSending(false)
    if (res.error) { setMsg(res.error); return }
    const parts = [
      res.invited && `✓ Invited ${res.invited}`,
      res.already_invited && `${res.already_invited} already invited`,
      res.already_in && `${res.already_in} already in your sweep`,
    ].filter(Boolean)
    setMsg(parts.join(' · ') || 'Nobody new to invite')
    if (res.invited) setText('')
    load()
  }

  async function resend(inv: Invite) {
    setBusyId(inv.id)
    const res = await fetch(`/api/comps/${compId}/sweep/invites`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: inv.id }),
    }).then(r => r.json()).catch(() => ({ error: 'Something went wrong' }))
    setBusyId(null)
    setMsg(res.error ?? `✓ Sent again to ${inv.email}`)
    if (!res.error) setInvited(list => list.map(i => i.id === inv.id ? { ...i, invited_at: res.invited_at } : i))
  }

  async function remove(inv: Invite) {
    setBusyId(inv.id)
    await fetch(`/api/comps/${compId}/sweep/invites?id=${encodeURIComponent(inv.id)}`, { method: 'DELETE' }).catch(() => {})
    setBusyId(null)
    setInvited(list => list.filter(i => i.id !== inv.id))
  }

  return (
    <div className={`border border-gray-200 rounded-2xl p-5 ${className}`}>
      <h2 className="font-bold text-gray-900 mb-1 text-sm">✉️ Invite by email</h2>
      <p className="text-xs text-gray-500 mb-3">
        Paste addresses — one per line, or straight from an Outlook &ldquo;To&rdquo; line. Each gets an invite from you with a
        one-tap Join, and replies come to you.
      </p>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={3}
        placeholder={'sam@work.com.au\njo@work.com.au'}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
      <div className="flex items-center justify-between gap-3 mt-2">
        <span className="text-xs text-gray-400">{emails.length ? `${emails.length} address${emails.length === 1 ? '' : 'es'}` : ''}</span>
        <button onClick={send} disabled={sending || !emails.length}
          className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-3 py-1.5 rounded-lg">
          {sending ? 'Sending…' : emails.length ? `Send ${emails.length} invite${emails.length === 1 ? '' : 's'}` : 'Send invites'}
        </button>
      </div>
      {msg && <p className={`text-xs mt-2 ${msg.startsWith('✓') ? 'text-emerald-700' : 'text-gray-600'}`}>{msg}</p>}
      <p className="text-[11px] text-gray-400 mt-2">
        Work email can be strict with new senders — if someone can&apos;t find it, tell them to check junk, or share the link in your team chat.
      </p>

      {(invited.length > 0 || noTicket.length > 0) && (
        <div className="mt-4 pt-3 border-t border-gray-100 space-y-4">
          {invited.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-1.5">Invited, not joined yet · {invited.length}</p>
              <ul className="space-y-1.5">
                {invited.map(i => (
                  <li key={i.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate text-gray-700">
                      {i.display_name ? <><span className="font-semibold">{i.display_name}</span> · </> : null}{i.email}
                      <span className="text-gray-400"> · {ago(i.invited_at)}</span>
                    </span>
                    <span className="flex gap-2 flex-shrink-0">
                      <button onClick={() => resend(i)} disabled={busyId === i.id} className="font-bold text-emerald-700 hover:underline disabled:opacity-50">Resend</button>
                      <button onClick={() => remove(i)} disabled={busyId === i.id} className="text-gray-400 hover:text-red-600 disabled:opacity-50">Remove</button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {noTicket.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-1">Joined, no ticket yet · {noTicket.length}</p>
              <p className="text-xs text-gray-600">{noTicket.map(m => m.display_name).join(', ')}</p>
              <p className="text-[11px] text-gray-400 mt-1">Worth a nudge before pools lock.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
