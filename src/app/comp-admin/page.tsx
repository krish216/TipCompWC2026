'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { Spinner, EmptyState } from '@/components/ui'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'
import toast from 'react-hot-toast'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Member    { id: string; display_name: string; email: string; joined_at?: string }
interface Invite    { id: string; email: string; sent_at: string; joined: boolean; joined_at?: string | null; display_name?: string | null }
interface Payment   { id: string; user_id: string; display_name: string; email: string; paid: boolean; amount?: number; paid_at?: string | null; notes?: string | null }
interface Tribe     { id: string; name: string; description?: string | null; invite_code: string; member_count?: number; member_ids?: string[] }
interface Challenge { id: string; fixture_id: number; prize: string; sponsor?: string | null; fixture_label?: string }
interface Fixture   { id: number; home: string; away: string; date: string; round: string }

type Tab = 'tipsters' | 'payments' | 'email' | 'settings' | 'tribes' | 'challenges'

const TAB_CONFIG: { id: Tab; icon: string; label: string; desc: string }[] = [
  { id: 'tipsters',   icon: '👥', label: 'Tipsters',   desc: 'Invite & track' },
  { id: 'payments',   icon: '💳', label: 'Payments',   desc: 'Fees & tracking' },
  { id: 'email',      icon: '✉️',  label: 'Email',      desc: 'Send to tipsters' },
  { id: 'settings',   icon: '⚙️',  label: 'Settings',   desc: 'Comp config' },
  { id: 'tribes',     icon: '🏕️',  label: 'Tribes',     desc: 'Manage groups' },
  { id: 'challenges', icon: '⚡',  label: 'Challenges', desc: 'Daily prizes' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const colors   = ['bg-violet-100 text-violet-700','bg-blue-100 text-blue-700','bg-emerald-100 text-emerald-700','bg-amber-100 text-amber-700','bg-rose-100 text-rose-700']
  const color    = colors[name.charCodeAt(0) % colors.length]
  const sz       = size === 'sm' ? 'w-6 h-6 text-[10px]' : size === 'lg' ? 'w-10 h-10 text-sm' : 'w-8 h-8 text-xs'
  return <div className={clsx('rounded-full flex items-center justify-center font-bold flex-shrink-0', sz, color)}>{initials}</div>
}

function Pill({ color, children }: { color: 'green'|'amber'|'red'|'blue'|'gray'; children: React.ReactNode }) {
  const cls = { green:'bg-emerald-100 text-emerald-700', amber:'bg-amber-100 text-amber-700', red:'bg-red-100 text-red-600', blue:'bg-blue-100 text-blue-700', gray:'bg-gray-100 text-gray-500' }
  return <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide', cls[color])}>{children}</span>
}

function SectionCard({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm mb-4">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/60">
        <div>
          <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">{title}</p>
          {subtitle && <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div>{children}</div>
    </div>
  )
}

// ─── Tab: Tipsters ────────────────────────────────────────────────────────────
function TipstersTab({ comp, members }: { comp: any; members: Member[] }) {
  const [invites,     setInvites]     = useState<Invite[]>([])
  const [emailInput,  setEmailInput]  = useState('')
  const [bulkInput,   setBulkInput]   = useState('')
  const [showBulk,    setShowBulk]    = useState(false)
  const [sending,     setSending]     = useState(false)
  const [loadingInvites, setLoadingInvites] = useState(true)
  const [filter,      setFilter]      = useState<'all'|'joined'|'pending'>('all')

  useEffect(() => {
    fetch(`/api/comp-admins/members?comp_id=${comp.id}`)
      .then(r => r.json())
      .then(d => {
        // Build invite list from members + any pending invites stored
        const memberInvites: Invite[] = (d.data ?? []).map((m: Member) => ({
          id: m.id, email: m.email, sent_at: m.joined_at ?? new Date().toISOString(),
          joined: true, joined_at: m.joined_at, display_name: m.display_name,
        }))
        setInvites(memberInvites)
      })
      .finally(() => setLoadingInvites(false))
  }, [comp.id])

  const sendInvite = async (email: string) => {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed || !/\S+@\S+\.\S+/.test(trimmed)) { toast.error('Enter a valid email address'); return }
    if (invites.some(i => i.email.toLowerCase() === trimmed)) { toast.error('Already invited'); return }
    setSending(true)
    const res = await fetch('/api/comp-admins/self-register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: trimmed, comp_id: comp.id, send_invite: true }),
    })
    const data = await res.json()
    setSending(false)
    if (res.ok) {
      setInvites(prev => [{ id: Date.now().toString(), email: trimmed, sent_at: new Date().toISOString(), joined: false }, ...prev])
      setEmailInput('')
      toast.success(`Invite sent to ${trimmed}`)
    } else {
      toast.error(data.error ?? 'Failed to send invite')
    }
  }

  const sendBulk = async () => {
    const emails = bulkInput.split(/[\n,;]+/).map(e => e.trim()).filter(e => e.includes('@'))
    if (!emails.length) { toast.error('No valid emails found'); return }
    setSending(true)
    let ok = 0, fail = 0
    for (const email of emails) {
      const res = await fetch('/api/comp-admins/self-register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, comp_id: comp.id, send_invite: true }),
      })
      if (res.ok) { ok++; setInvites(prev => [{ id: Date.now().toString() + email, email, sent_at: new Date().toISOString(), joined: false }, ...prev]) }
      else fail++
    }
    setSending(false)
    setBulkInput(''); setShowBulk(false)
    toast.success(`${ok} invite${ok !== 1 ? 's' : ''} sent${fail > 0 ? ` · ${fail} failed` : ''}`)
  }

  const filtered = useMemo(() => {
    if (filter === 'joined')  return invites.filter(i => i.joined)
    if (filter === 'pending') return invites.filter(i => !i.joined)
    return invites
  }, [invites, filter])

  const joinedCount  = invites.filter(i => i.joined).length
  const pendingCount = invites.filter(i => !i.joined).length

  return (
    <div>
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: 'Total invited', value: invites.length, color: 'text-gray-800' },
          { label: 'Joined',  value: joinedCount,  color: 'text-emerald-600' },
          { label: 'Pending', value: pendingCount, color: 'text-amber-600'   },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-3 text-center shadow-sm">
            <p className={clsx('text-2xl font-black', s.color)}>{s.value}</p>
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Invite code */}
      <SectionCard title="Comp join code" subtitle="Share this code — tipsters enter it on the home page">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex-1 bg-gray-50 rounded-xl border border-gray-200 px-4 py-2.5 text-center">
            <span className="text-xl font-mono font-black tracking-[0.25em] text-gray-800 select-all">{comp?.invite_code ?? '—'}</span>
          </div>
          <button onClick={async () => { await navigator.clipboard.writeText(comp?.invite_code ?? ''); toast.success('Copied!') }}
            className="px-3 py-2.5 bg-gray-900 text-white text-xs font-bold rounded-xl hover:bg-gray-800 transition-colors">
            Copy
          </button>
        </div>
      </SectionCard>

      {/* Send invites */}
      <SectionCard title="Send invite" subtitle="Tipster receives an email with a link to join your comp">
        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            <input type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendInvite(emailInput)}
              placeholder="tipster@example.com"
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
            />
            <button onClick={() => sendInvite(emailInput)} disabled={sending || !emailInput.trim()}
              className="px-4 py-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5">
              {sending ? <Spinner className="w-3 h-3 text-white" /> : '→'}
              Send
            </button>
          </div>
          <button onClick={() => setShowBulk(v => !v)}
            className="text-xs text-gray-500 hover:text-gray-700 font-medium underline underline-offset-2">
            {showBulk ? 'Hide bulk import' : 'Bulk import (paste multiple emails)'}
          </button>
          {showBulk && (
            <div className="space-y-2">
              <textarea value={bulkInput} onChange={e => setBulkInput(e.target.value)} rows={4}
                placeholder={"Paste emails separated by commas, semicolons, or new lines\n\nalice@example.com\nbob@example.com"}
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none font-mono"
              />
              <button onClick={sendBulk} disabled={sending || !bulkInput.trim()}
                className="px-4 py-2 bg-gray-900 text-white text-xs font-bold rounded-xl disabled:opacity-40 hover:bg-gray-800 transition-colors">
                {sending ? 'Sending…' : `Send ${bulkInput.split(/[\n,;]+/).filter(e => e.trim().includes('@')).length} invites`}
              </button>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Invite list */}
      <SectionCard title="Tipster list"
        subtitle={`${invites.length} invited · ${joinedCount} joined · ${pendingCount} pending`}
        action={
          <div className="flex gap-1">
            {(['all','joined','pending'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={clsx('px-2.5 py-1 rounded-lg text-[11px] font-semibold capitalize transition-colors',
                  filter === f ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100')}>
                {f}
              </button>
            ))}
          </div>
        }>
        {loadingInvites ? (
          <div className="flex justify-center py-6"><Spinner className="w-5 h-5" /></div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-gray-400">
              {filter === 'all' ? 'No tipsters yet — send your first invite above.' : `No ${filter} tipsters.`}
            </p>
          </div>
        ) : (
          <div>
            {filtered.map((inv, i) => (
              <div key={inv.id} className={clsx('flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0', i % 2 === 0 ? '' : 'bg-gray-50/40')}>
                <Avatar name={inv.display_name || inv.email} size="sm" />
                <div className="flex-1 min-w-0">
                  {inv.display_name && <p className="text-xs font-semibold text-gray-800 truncate">{inv.display_name}</p>}
                  <p className="text-[11px] text-gray-500 truncate">{inv.email}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  {inv.joined
                    ? <Pill color="green">✓ Joined</Pill>
                    : <Pill color="amber">Pending</Pill>}
                  {inv.joined_at && <p className="text-[10px] text-gray-400 mt-0.5">{new Date(inv.joined_at).toLocaleDateString()}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

// ─── Tab: Payments ────────────────────────────────────────────────────────────
function PaymentsTab({ comp, members }: { comp: any; members: Member[] }) {
  const [payments,     setPayments]     = useState<Payment[]>([])
  const [entryFee,     setEntryFee]     = useState<string>('')
  const [savingFee,    setSavingFee]    = useState(false)
  const [filter,       setFilter]       = useState<'all'|'paid'|'unpaid'>('all')
  const [editingNote,  setEditingNote]  = useState<string | null>(null)

  // Build payment records from members
  useEffect(() => {
    const records: Payment[] = members.map(m => ({
      id: m.id, user_id: m.id, display_name: m.display_name, email: m.email,
      paid: false, paid_at: null, notes: null,
    }))
    // Load saved payment state from localStorage (persisted client-side)
    const saved = localStorage.getItem(`payments_${comp.id}`)
    if (saved) {
      const savedMap: Record<string, Partial<Payment>> = JSON.parse(saved)
      records.forEach(r => {
        if (savedMap[r.user_id]) Object.assign(r, savedMap[r.user_id])
      })
    }
    setPayments(records)
    const fee = localStorage.getItem(`entry_fee_${comp.id}`)
    if (fee) setEntryFee(fee)
  }, [comp.id, members])

  const saveFee = () => {
    localStorage.setItem(`entry_fee_${comp.id}`, entryFee)
    setSavingFee(false)
    toast.success('Entry fee updated')
  }

  const togglePaid = (userId: string) => {
    setPayments(prev => {
      const updated = prev.map(p => p.user_id === userId
        ? { ...p, paid: !p.paid, paid_at: !p.paid ? new Date().toISOString() : null }
        : p)
      const savedMap: Record<string, Partial<Payment>> = {}
      updated.forEach(p => { savedMap[p.user_id] = { paid: p.paid, paid_at: p.paid_at, notes: p.notes } })
      localStorage.setItem(`payments_${comp.id}`, JSON.stringify(savedMap))
      return updated
    })
  }

  const saveNote = (userId: string, note: string) => {
    setPayments(prev => {
      const updated = prev.map(p => p.user_id === userId ? { ...p, notes: note || null } : p)
      const savedMap: Record<string, Partial<Payment>> = {}
      updated.forEach(p => { savedMap[p.user_id] = { paid: p.paid, paid_at: p.paid_at, notes: p.notes } })
      localStorage.setItem(`payments_${comp.id}`, JSON.stringify(savedMap))
      return updated
    })
    setEditingNote(null)
  }

  const filtered = useMemo(() => {
    if (filter === 'paid')   return payments.filter(p => p.paid)
    if (filter === 'unpaid') return payments.filter(p => !p.paid)
    return payments
  }, [payments, filter])

  const paidCount   = payments.filter(p => p.paid).length
  const unpaidCount = payments.filter(p => !p.paid).length
  const feeNum      = parseFloat(entryFee) || 0
  const totalCollected = paidCount * feeNum
  const totalExpected  = payments.length * feeNum

  return (
    <div>
      {/* Fee config */}
      <SectionCard title="Entry fee" subtitle="Set the competition entry fee for tracking purposes">
        <div className="p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-600">$</span>
            <input type="number" min="0" step="0.01" value={entryFee}
              onChange={e => { setEntryFee(e.target.value); setSavingFee(true) }}
              placeholder="0.00"
              className="w-32 px-3 py-2 text-sm font-bold border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            {savingFee && (
              <button onClick={saveFee} className="px-3 py-2 bg-gray-900 text-white text-xs font-bold rounded-xl hover:bg-gray-800 transition-colors">
                Save
              </button>
            )}
            {entryFee && !savingFee && <span className="text-xs text-gray-400">per person</span>}
          </div>
          {feeNum > 0 && (
            <p className="text-xs text-gray-500 mt-2">
              Expected: <span className="font-semibold text-gray-700">${totalExpected.toFixed(2)}</span>
              {' · '}Collected: <span className="font-semibold text-emerald-600">${totalCollected.toFixed(2)}</span>
              {' · '}Outstanding: <span className="font-semibold text-amber-600">${(totalExpected - totalCollected).toFixed(2)}</span>
            </p>
          )}
        </div>
      </SectionCard>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: 'Total tipsters', value: payments.length, color: 'text-gray-800' },
          { label: 'Paid',    value: paidCount,   color: 'text-emerald-600' },
          { label: 'Unpaid',  value: unpaidCount, color: 'text-amber-600'   },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-3 text-center shadow-sm">
            <p className={clsx('text-2xl font-black', s.color)}>{s.value}</p>
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Payment list */}
      <SectionCard title="Payment tracker"
        action={
          <div className="flex gap-1">
            {(['all','paid','unpaid'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={clsx('px-2.5 py-1 rounded-lg text-[11px] font-semibold capitalize transition-colors',
                  filter === f ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100')}>
                {f}
              </button>
            ))}
          </div>
        }>
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            {members.length === 0 ? 'No tipsters in this comp yet.' : `No ${filter} tipsters.`}
          </div>
        ) : (
          <div>
            {filtered.map((p, i) => (
              <div key={p.user_id} className={clsx('px-4 py-3 border-b border-gray-50 last:border-0', i % 2 === 0 ? '' : 'bg-gray-50/40')}>
                <div className="flex items-center gap-3">
                  <Avatar name={p.display_name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{p.display_name}</p>
                    <p className="text-[11px] text-gray-400 truncate">{p.email}</p>
                    {p.notes && editingNote !== p.user_id && (
                      <p className="text-[11px] text-gray-500 italic mt-0.5 truncate">📝 {p.notes}</p>
                    )}
                    {editingNote === p.user_id && (
                      <div className="flex gap-1.5 mt-1.5">
                        <input autoFocus type="text" defaultValue={p.notes ?? ''}
                          onBlur={e => saveNote(p.user_id, e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveNote(p.user_id, (e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditingNote(null) }}
                          placeholder="Add note (e.g. paid via bank transfer)"
                          className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => setEditingNote(editingNote === p.user_id ? null : p.user_id)}
                      className="text-gray-300 hover:text-gray-500 transition-colors text-sm" title="Add note">
                      📝
                    </button>
                    <button onClick={() => togglePaid(p.user_id)}
                      className={clsx(
                        'px-3 py-1.5 rounded-xl text-xs font-bold transition-all border',
                        p.paid
                          ? 'bg-emerald-100 border-emerald-200 text-emerald-700 hover:bg-red-50 hover:border-red-200 hover:text-red-600'
                          : 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700'
                      )}>
                      {p.paid ? '✓ Paid' : 'Mark paid'}
                    </button>
                  </div>
                </div>
                {p.paid && p.paid_at && (
                  <p className="text-[10px] text-emerald-600 mt-1 ml-10">
                    Marked paid {new Date(p.paid_at).toLocaleDateString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Export */}
      {payments.length > 0 && (
        <button onClick={() => {
          const csv = ['Name,Email,Paid,Paid At,Notes',
            ...payments.map(p => `"${p.display_name}","${p.email}",${p.paid},${p.paid_at ?? ''},"${p.notes ?? ''}"`)
          ].join('\n')
          const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
          a.download = `${comp.name ?? 'comp'}-payments.csv`; a.click()
        }}
          className="w-full py-2.5 border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
          ↓ Export payments as CSV
        </button>
      )}
    </div>
  )
}

// ─── Tab: Email ───────────────────────────────────────────────────────────────
function EmailTab({ comp, members }: { comp: any; members: Member[] }) {
  const [subject,     setSubject]     = useState('')
  const [body,        setBody]        = useState('')
  const [sending,     setSending]     = useState(false)
  const [recipients,  setRecipients]  = useState<'all'|'paid'|'custom'>('all')
  const [customEmails, setCustomEmails] = useState('')
  const [preview,     setPreview]     = useState(false)

  const templates = [
    { label: '👋 Welcome',    subject: `Welcome to ${comp?.name ?? 'the comp'}!`, body: `Hi {name},\n\nYou've been invited to join ${comp?.name ?? 'our tipping comp'} for the FIFA World Cup 2026.\n\nUse the join code: ${comp?.invite_code ?? '——'}\n\nGood luck!\n\nThe ${comp?.name ?? 'comp'} team` },
    { label: '⏰ Reminder',   subject: `Don't forget to enter your tips!`, body: `Hi {name},\n\nJust a reminder that predictions are open and waiting for your tips!\n\nLog in now and submit your predictions before the next round locks.\n\nGood luck!\n\nThe ${comp?.name ?? 'comp'} team` },
    { label: '🏆 Results',    subject: `Round results are in!`, body: `Hi {name},\n\nThe latest round results are in — check the leaderboard to see where you stand.\n\nKeep tipping!\n\nThe ${comp?.name ?? 'comp'} team` },
    { label: '💰 Pay up',     subject: `Entry fee reminder for ${comp?.name ?? 'the comp'}`, body: `Hi {name},\n\nThis is a friendly reminder that the entry fee for ${comp?.name ?? 'the comp'} is due.\n\nPlease arrange payment at your earliest convenience.\n\nThanks!\n\nThe ${comp?.name ?? 'comp'} team` },
  ]

  const recipientList = useMemo(() => {
    if (recipients === 'custom') return customEmails.split(/[\n,;]+/).map(e => e.trim()).filter(e => e.includes('@'))
    return members.map(m => m.email)
  }, [recipients, members, customEmails])

  const send = async () => {
    if (!subject.trim() || !body.trim()) { toast.error('Subject and body required'); return }
    if (recipientList.length === 0) { toast.error('No recipients selected'); return }
    setSending(true)
    const res = await fetch('/api/comp-announcements', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comp_id: comp.id, title: subject, body, recipients: recipientList }),
    })
    setSending(false)
    if (res.ok) {
      toast.success(`Email sent to ${recipientList.length} tipster${recipientList.length !== 1 ? 's' : ''}`)
      setSubject(''); setBody('')
    } else {
      const d = await res.json()
      toast.error(d.error ?? 'Failed to send')
    }
  }

  return (
    <div>
      {/* Templates */}
      <SectionCard title="Quick templates" subtitle="Click to pre-fill the email">
        <div className="grid grid-cols-2 gap-2 p-3">
          {templates.map(t => (
            <button key={t.label} onClick={() => { setSubject(t.subject); setBody(t.body); setPreview(false) }}
              className="text-left px-3 py-2.5 border border-gray-200 rounded-xl hover:border-gray-900 hover:bg-gray-50 transition-all">
              <p className="text-xs font-semibold text-gray-700">{t.label}</p>
              <p className="text-[10px] text-gray-400 mt-0.5 truncate">{t.subject}</p>
            </button>
          ))}
        </div>
      </SectionCard>

      {/* Compose */}
      <SectionCard title="Compose" subtitle={`Sending to ${recipientList.length} tipster${recipientList.length !== 1 ? 's' : ''}`}>
        <div className="p-4 space-y-3">
          {/* Recipients */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Recipients</label>
            <div className="flex gap-2 flex-wrap">
              {(['all','paid','custom'] as const).map(r => (
                <button key={r} onClick={() => setRecipients(r)}
                  className={clsx('px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors capitalize',
                    recipients === r ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-200 text-gray-600 hover:border-gray-400')}>
                  {r === 'all' ? `All tipsters (${members.length})` : r === 'paid' ? 'Paid only' : 'Custom'}
                </button>
              ))}
            </div>
            {recipients === 'custom' && (
              <textarea value={customEmails} onChange={e => setCustomEmails(e.target.value)} rows={2}
                placeholder="Paste emails, one per line or comma-separated"
                className="mt-2 w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 font-mono resize-none"
              />
            )}
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Subject</label>
            <input type="text" value={subject} onChange={e => setSubject(e.target.value)}
              placeholder="Your email subject…"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          {/* Body */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-600">Message</label>
              <button onClick={() => setPreview(v => !v)} className="text-[11px] text-gray-400 hover:text-gray-600 font-medium">
                {preview ? 'Edit' : 'Preview'}
              </button>
            </div>
            {preview ? (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-700 whitespace-pre-wrap min-h-[120px] font-mono">
                {body || <span className="text-gray-300 italic">Nothing to preview</span>}
              </div>
            ) : (
              <textarea value={body} onChange={e => setBody(e.target.value)} rows={7}
                placeholder={"Hi {name},\n\nWrite your message here…\n\nUse {name} to personalise with each tipster's display name."}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
              />
            )}
            <p className="text-[10px] text-gray-400 mt-1">Tip: use <code className="bg-gray-100 px-1 rounded">{'{name}'}</code> to personalise with each tipster's display name</p>
          </div>

          <button onClick={send} disabled={sending || !subject.trim() || !body.trim() || recipientList.length === 0}
            className="w-full py-2.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
            {sending ? <><Spinner className="w-4 h-4 text-white" />Sending…</> : `✉️ Send to ${recipientList.length} tipster${recipientList.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </SectionCard>
    </div>
  )
}

// ─── Tab: Settings ────────────────────────────────────────────────────────────
function SettingsTab({ comp, tier, domain, minAge, onUpdate }: { comp: any; tier: string; domain: string | null; minAge: number | null; onUpdate: (key: string, val: any) => void }) {
  const [compName,    setCompName]    = useState(comp?.name ?? '')
  const [saving,      setSaving]      = useState(false)
  const [newDomain,   setNewDomain]   = useState(domain ?? '')
  const [newMinAge,   setNewMinAge]   = useState(minAge ? String(minAge) : '')
  const [adminEmail,  setAdminEmail]  = useState('')
  const [grantingAdmin, setGrantingAdmin] = useState(false)

  const saveName = async () => {
    if (!compName.trim()) return
    setSaving(true)
    const res = await fetch('/api/comps/create', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: comp.id, name: compName.trim() }),
    })
    setSaving(false)
    if (res.ok) { onUpdate('name', compName.trim()); toast.success('Name updated') }
    else toast.error('Failed to update name')
  }

  const saveDomain = async () => {
    const res = await fetch('/api/comps/domain', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comp_id: comp.id, email_domain: newDomain.trim() || null }),
    })
    if (res.ok) { onUpdate('domain', newDomain || null); toast.success(newDomain ? 'Domain restriction saved' : 'Domain restriction removed') }
    else toast.error('Failed to update domain')
  }

  const saveAge = async () => {
    const age = parseInt(newMinAge) || null
    const res = await fetch('/api/comps/create', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: comp.id, min_age: age }),
    })
    if (res.ok) { onUpdate('minAge', age); toast.success(age ? `Minimum age set to ${age}` : 'Age restriction removed') }
    else toast.error('Failed to update age restriction')
  }

  const grantAdmin = async () => {
    if (!adminEmail.trim()) return
    setGrantingAdmin(true)
    const res = await fetch('/api/comp-admins', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail.trim(), comp_id: comp.id }),
    })
    setGrantingAdmin(false)
    const d = await res.json()
    if (d.success) { toast.success(`Admin access granted to ${adminEmail}`); setAdminEmail('') }
    else toast.error(d.error ?? 'Failed to grant access')
  }

  return (
    <div className="space-y-0">
      {/* Plan badge */}
      <div className="mb-4 flex items-center gap-2 bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
        <span className={clsx('text-xs font-black uppercase tracking-widest px-2.5 py-1 rounded-full',
          tier === 'enterprise' ? 'bg-violet-100 text-violet-700' :
          tier === 'business'   ? 'bg-blue-100 text-blue-700'     :
          tier === 'trial'      ? 'bg-amber-100 text-amber-700'   : 'bg-gray-100 text-gray-600'
        )}>
          {tier}
        </span>
        <span className="text-xs text-gray-500">Current plan · <a href="/pricing" className="text-blue-600 underline">Upgrade</a></span>
      </div>

      {/* Comp name */}
      <SectionCard title="Comp name">
        <div className="flex gap-2 p-4">
          <input type="text" value={compName} onChange={e => setCompName(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <button onClick={saveName} disabled={saving || compName === comp?.name}
            className="px-4 py-2 bg-gray-900 text-white text-xs font-bold rounded-xl disabled:opacity-40 hover:bg-gray-800 transition-colors">
            {saving ? '…' : 'Save'}
          </button>
        </div>
      </SectionCard>

      {/* Domain restriction */}
      <SectionCard title="Email domain restriction" subtitle={tier === 'enterprise' ? 'Only allow users with this email domain to join' : '🔒 Enterprise plan required'}>
        <div className="p-4">
          {tier === 'enterprise' ? (
            <div className="flex gap-2 items-center">
              <span className="text-xs text-gray-500 font-medium">@</span>
              <input type="text" value={newDomain} onChange={e => setNewDomain(e.target.value.toLowerCase().replace(/^@/, ''))}
                placeholder="company.com (leave blank to remove)"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
              <button onClick={saveDomain} className="px-4 py-2 bg-gray-900 text-white text-xs font-bold rounded-xl hover:bg-gray-800 transition-colors">Save</button>
            </div>
          ) : (
            <div className="text-xs text-gray-400 bg-gray-50 rounded-xl p-3">Upgrade to Enterprise to restrict by email domain.</div>
          )}
        </div>
      </SectionCard>

      {/* Age restriction */}
      <SectionCard title="Minimum age" subtitle="Optionally restrict who can join this comp">
        <div className="flex gap-2 items-center p-4">
          <input type="number" min="13" max="100" value={newMinAge} onChange={e => setNewMinAge(e.target.value)}
            placeholder="No restriction"
            className="w-32 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <button onClick={saveAge} className="px-4 py-2 bg-gray-900 text-white text-xs font-bold rounded-xl hover:bg-gray-800 transition-colors">Save</button>
          {newMinAge && <span className="text-xs text-gray-400">years or older</span>}
        </div>
      </SectionCard>

      {/* Grant admin */}
      <SectionCard title="Grant admin access" subtitle="Give another tipster admin rights for this comp">
        <div className="flex gap-2 p-4">
          <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && grantAdmin()}
            placeholder="tipster@example.com"
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <button onClick={grantAdmin} disabled={grantingAdmin || !adminEmail.trim()}
            className="px-4 py-2 bg-gray-900 text-white text-xs font-bold rounded-xl disabled:opacity-40 hover:bg-gray-800 transition-colors">
            {grantingAdmin ? <Spinner className="w-3 h-3 text-white" /> : 'Grant'}
          </button>
        </div>
      </SectionCard>
    </div>
  )
}

// ─── Tab: Tribes ──────────────────────────────────────────────────────────────
function TribesTab({ comp, members, tribes, setTribes }: { comp: any; members: Member[]; tribes: Tribe[]; setTribes: (fn: (prev: Tribe[]) => Tribe[]) => void }) {
  const [name,    setName]    = useState('')
  const [desc,    setDesc]    = useState('')
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const createTribe = async () => {
    if (!name.trim()) return
    setCreating(true)
    const res = await fetch('/api/tribes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), description: desc.trim() || null, comp_id: comp.id }),
    })
    const { data, error: err } = await res.json()
    setCreating(false)
    if (err) { setError(res.status === 409 ? `"${name.trim()}" already exists. Choose a different name.` : err) }
    else { toast.success(`Tribe "${data.name}" created`); setTribes(prev => [data, ...prev]); setName(''); setDesc(''); setError(null); setShowForm(false) }
  }

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-white border border-gray-200 rounded-xl p-3 text-center shadow-sm col-span-1">
          <p className="text-2xl font-black text-gray-800">{tribes.length}</p>
          <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mt-0.5">Tribes</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3 text-center shadow-sm col-span-1">
          <p className="text-2xl font-black text-gray-800">{members.length}</p>
          <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mt-0.5">Members</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3 text-center shadow-sm col-span-1">
          <p className="text-2xl font-black text-gray-800">
            {tribes.length > 0 ? Math.round(members.length / tribes.length) : 0}
          </p>
          <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mt-0.5">Avg size</p>
        </div>
      </div>

      {/* Create */}
      {!showForm ? (
        <button onClick={() => setShowForm(true)}
          className="w-full mb-4 py-3 border-2 border-dashed border-gray-300 rounded-2xl text-sm font-semibold text-gray-500 hover:border-gray-900 hover:text-gray-900 transition-all flex items-center justify-center gap-2">
          <span className="text-lg">+</span> Create new tribe
        </button>
      ) : (
        <SectionCard title="New tribe">
          <div className="p-4 space-y-3">
            <input type="text" value={name} onChange={e => { setName(e.target.value); setError(null) }}
              onKeyDown={e => e.key === 'Enter' && createTribe()}
              placeholder="Tribe name (e.g. The Offside Trap)"
              maxLength={50}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
              placeholder="Short description (optional)"
              maxLength={200}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
            />
            {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-xl">{error}</p>}
            <div className="flex gap-2">
              <button onClick={createTribe} disabled={creating || !name.trim()}
                className="flex-1 py-2 bg-gray-900 text-white text-xs font-bold rounded-xl disabled:opacity-40 hover:bg-gray-800 transition-colors">
                {creating ? 'Creating…' : 'Create tribe'}
              </button>
              <button onClick={() => { setShowForm(false); setError(null); setName(''); setDesc('') }}
                className="px-4 py-2 border border-gray-200 text-xs font-semibold text-gray-600 rounded-xl hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Tribes list */}
      {tribes.length === 0 ? (
        <EmptyState title="No tribes yet" description="Create your first tribe to organise tipsters into groups." />
      ) : (
        <div className="space-y-3">
          {tribes.map(t => {
            const tribeMembers = members.filter(m => t.member_ids?.includes(m.id))
            return (
              <div key={t.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/60">
                  <div>
                    <p className="text-sm font-bold text-gray-800">{t.name}</p>
                    {t.description && <p className="text-[11px] text-gray-400 mt-0.5">{t.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill color="blue">{t.member_count ?? tribeMembers.length} members</Pill>
                    <button onClick={async () => { await navigator.clipboard.writeText(t.invite_code); toast.success('Tribe code copied!') }}
                      className="text-[11px] font-mono bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded-lg text-gray-600 transition-colors">
                      {t.invite_code}
                    </button>
                  </div>
                </div>
                {tribeMembers.length === 0 ? (
                  <p className="text-xs text-gray-400 italic px-4 py-3">No members yet — share the tribe invite code</p>
                ) : (
                  <div className="px-4 py-2 flex flex-wrap gap-2">
                    {tribeMembers.slice(0, 8).map(m => (
                      <div key={m.id} className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 rounded-full px-2 py-1">
                        <Avatar name={m.display_name} size="sm" />
                        <span className="text-[11px] font-medium text-gray-700 max-w-[80px] truncate">{m.display_name.split(' ')[0]}</span>
                      </div>
                    ))}
                    {tribeMembers.length > 8 && (
                      <div className="flex items-center px-2 py-1">
                        <span className="text-[11px] text-gray-400">+{tribeMembers.length - 8} more</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Tab: Challenges ──────────────────────────────────────────────────────────
function ChallengesTab({ comp }: { comp: any }) {
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [fixtures,   setFixtures]   = useState<Fixture[]>([])
  const [loading,    setLoading]    = useState(true)
  const [showForm,   setShowForm]   = useState(false)
  const [fixtureId,  setFixtureId]  = useState('')
  const [prize,      setPrize]      = useState('')
  const [sponsor,    setSponsor]    = useState('')
  const [saving,     setSaving]     = useState(false)

  useEffect(() => {
    Promise.all([
      fetch(`/api/comp-challenges?comp_id=${comp.id}`).then(r => r.json()),
      fetch('/api/fixtures').then(r => r.json()),
    ]).then(([cData, fData]) => {
      const fs: Fixture[] = (fData.data ?? []).map((f: any) => ({
        id: f.id, home: f.home, away: f.away, date: f.date, round: f.round,
      }))
      setFixtures(fs)
      const challenges: Challenge[] = (cData.data ?? []).map((c: any) => ({
        ...c,
        fixture_label: fs.find(f => f.id === c.fixture_id)
          ? `${fs.find(f => f.id === c.fixture_id)!.home} vs ${fs.find(f => f.id === c.fixture_id)!.away}`
          : `Fixture ${c.fixture_id}`,
      }))
      setChallenges(challenges)
    }).finally(() => setLoading(false))
  }, [comp.id])

  const createChallenge = async () => {
    if (!fixtureId || !prize.trim()) { toast.error('Select a fixture and enter a prize'); return }
    setSaving(true)
    const res = await fetch('/api/comp-challenges', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comp_id: comp.id, fixture_id: parseInt(fixtureId), prize: prize.trim(), sponsor: sponsor.trim() || null }),
    })
    const { data, error } = await res.json()
    setSaving(false)
    if (error) { toast.error(error); return }
    const fx = fixtures.find(f => f.id === parseInt(fixtureId))
    setChallenges(prev => [{ ...data, fixture_label: fx ? `${fx.home} vs ${fx.away}` : `Fixture ${fixtureId}` }, ...prev])
    setFixtureId(''); setPrize(''); setSponsor(''); setShowForm(false)
    toast.success('Challenge created')
  }

  const deleteChallenge = async (id: string) => {
    if (!confirm('Delete this challenge?')) return
    await fetch(`/api/comp-challenges?id=${id}`, { method: 'DELETE' })
    setChallenges(prev => prev.filter(c => c.id !== id))
    toast.success('Challenge deleted')
  }

  // Group fixtures by round
  const fixturesByRound = useMemo(() => {
    const map: Record<string, Fixture[]> = {}
    fixtures.forEach(f => { if (!map[f.round]) map[f.round] = []; map[f.round].push(f) })
    return map
  }, [fixtures])

  return (
    <div>
      <div className="mb-4 bg-blue-50 border border-blue-200 rounded-2xl p-4">
        <p className="text-xs font-bold text-blue-800 mb-1">⚡ Daily challenges</p>
        <p className="text-xs text-blue-700">Attach a special prize to any fixture. The tipster who correctly predicts that match wins the prize. Great for sponsored prizes and keeping engagement high.</p>
      </div>

      {!showForm ? (
        <button onClick={() => setShowForm(true)}
          className="w-full mb-4 py-3 border-2 border-dashed border-gray-300 rounded-2xl text-sm font-semibold text-gray-500 hover:border-gray-900 hover:text-gray-900 transition-all flex items-center justify-center gap-2">
          <span className="text-lg">+</span> Add challenge
        </button>
      ) : (
        <SectionCard title="New challenge">
          <div className="p-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Match</label>
              <select value={fixtureId} onChange={e => setFixtureId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white">
                <option value="">Select a match…</option>
                {Object.entries(fixturesByRound).map(([round, fxs]) => (
                  <optgroup key={round} label={round.toUpperCase()}>
                    {fxs.map(f => (
                      <option key={f.id} value={f.id}>{f.home} vs {f.away} · {f.date}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Prize 🏆</label>
              <input type="text" value={prize} onChange={e => setPrize(e.target.value)}
                placeholder="e.g. $50 gift card, bottle of wine, free dinner…"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Sponsor <span className="font-normal text-gray-400">(optional)</span></label>
              <input type="text" value={sponsor} onChange={e => setSponsor(e.target.value)}
                placeholder="e.g. Joe's Bottle Shop"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={createChallenge} disabled={saving || !fixtureId || !prize.trim()}
                className="flex-1 py-2 bg-gray-900 text-white text-xs font-bold rounded-xl disabled:opacity-40 hover:bg-gray-800 transition-colors">
                {saving ? 'Creating…' : 'Create challenge'}
              </button>
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-gray-200 text-xs font-semibold text-gray-600 rounded-xl hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </SectionCard>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Spinner className="w-5 h-5" /></div>
      ) : challenges.length === 0 ? (
        <EmptyState title="No challenges yet" description="Create your first challenge to attach a prize to a specific match." />
      ) : (
        <div className="space-y-2">
          {challenges.map(c => (
            <div key={c.id} className="bg-white border border-gray-200 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0 text-lg">⚡</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-gray-800 truncate">{c.fixture_label}</p>
                <p className="text-xs text-emerald-700 font-semibold mt-0.5">🏆 {c.prize}</p>
                {c.sponsor && <p className="text-[11px] text-gray-400 mt-0.5">Sponsored by {c.sponsor}</p>}
              </div>
              <button onClick={() => deleteChallenge(c.id)}
                className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 flex-shrink-0">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CompAdminPage() {
  const { session }                                        = useSupabase()
  const { selectedComp, isCompAdmin, loading: ctxLoading } = useUserPrefs()

  const [activeTab,  setActiveTab]  = useState<Tab>('tipsters')
  const [loading,    setLoading]    = useState(false)
  const [tribes,     setTribes]     = useState<Tribe[]>([])
  const [members,    setMembers]    = useState<Member[]>([])
  const [tier,       setTier]       = useState('trial')
  const [domain,     setDomain]     = useState<string | null>(null)
  const [minAge,     setMinAge]     = useState<number | null>(null)

  const comp = selectedComp as any

  useEffect(() => {
    if (!session || !comp?.id) return
    setLoading(true)
    Promise.all([
      fetch(`/api/comp-subscriptions?comp_id=${comp.id}`),
      fetch(`/api/comps/domain?comp_id=${comp.id}`),
      fetch(`/api/tribes/list?comp_id=${comp.id}`),
      fetch(`/api/comp-admins/members?comp_id=${comp.id}`),
    ]).then(async ([subRes, domRes, tribesRes, membersRes]) => {
      const [sub, dom, trib, mem] = await Promise.all([subRes.json(), domRes.json(), tribesRes.json(), membersRes.json()])
      setTier(sub.data?.tier ?? 'trial')
      setDomain(dom.email_domain ?? null)
      setTribes(trib.data ?? [])
      setMembers(mem.data ?? [])
    }).finally(() => setLoading(false))
  }, [session, comp?.id])

  const handleSettingUpdate = useCallback((key: string, val: any) => {
    if (key === 'domain') setDomain(val)
    if (key === 'minAge') setMinAge(val)
  }, [])

  if (ctxLoading || loading) return <div className="flex justify-center py-24"><Spinner className="w-8 h-8" /></div>

  if (!isCompAdmin || !comp) return (
    <div className="max-w-sm mx-auto px-4 py-24 text-center">
      <div className="text-5xl mb-4">🔒</div>
      <h1 className="text-base font-bold text-gray-900 mb-2">
        {comp ? 'Not a comp admin' : 'No comp selected'}
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        {comp ? `You're not an admin for ${comp.name}.` : 'Select a comp you manage on the home page.'}
      </p>
      <a href="/" className="inline-block px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-xl">
        Go home
      </a>
    </div>
  )

  const activeTabCount: Partial<Record<Tab, number | null>> = {
    tipsters:   members.length || null,
    tribes:     tribes.length  || null,
    challenges: null,
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">

      {/* ── Header ────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-5">
        {comp.logo_url ? (
          <img src={comp.logo_url} alt={comp.name} className="w-10 h-10 rounded-xl object-cover border border-gray-200" />
        ) : (
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-800 to-gray-600 flex items-center justify-center text-white text-sm font-black">
            {comp.name?.[0] ?? '?'}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-black text-gray-900 truncate">{comp.name}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={clsx('text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full',
              tier === 'enterprise' ? 'bg-violet-100 text-violet-700' :
              tier === 'business'   ? 'bg-blue-100 text-blue-700'     :
              'bg-amber-100 text-amber-700'
            )}>{tier}</span>
            <span className="text-[11px] text-gray-400">{members.length} tipsters · {tribes.length} tribes</span>
          </div>
        </div>
      </div>

      {/* ── Tab nav ───────────────────────────────── */}
      <div className="grid grid-cols-6 gap-1 bg-gray-100 p-1 rounded-2xl mb-5">
        {TAB_CONFIG.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={clsx(
              'relative flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl text-center transition-all',
              activeTab === t.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            )}>
            <span className="text-base leading-none">{t.icon}</span>
            <span className="text-[10px] font-bold leading-none hidden sm:block">{t.label}</span>
            {activeTabCount[t.id] != null && (
              <span className={clsx('absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-black flex items-center justify-center',
                activeTab === t.id ? 'bg-gray-900 text-white' : 'bg-gray-400 text-white')}>
                {activeTabCount[t.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Active tab label ──────────────────────── */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">{TAB_CONFIG.find(t => t.id === activeTab)?.icon}</span>
        <div>
          <h2 className="text-sm font-black text-gray-900">{TAB_CONFIG.find(t => t.id === activeTab)?.label}</h2>
          <p className="text-[11px] text-gray-400">{TAB_CONFIG.find(t => t.id === activeTab)?.desc}</p>
        </div>
      </div>

      {/* ── Tab content ───────────────────────────── */}
      {activeTab === 'tipsters'   && <TipstersTab   comp={comp} members={members} />}
      {activeTab === 'payments'   && <PaymentsTab   comp={comp} members={members} />}
      {activeTab === 'email'      && <EmailTab      comp={comp} members={members} />}
      {activeTab === 'settings'   && <SettingsTab   comp={comp} tier={tier} domain={domain} minAge={minAge} onUpdate={handleSettingUpdate} />}
      {activeTab === 'tribes'     && <TribesTab     comp={comp} members={members} tribes={tribes} setTribes={setTribes} />}
      {activeTab === 'challenges' && <ChallengesTab comp={comp} />}
    </div>
  )
}
