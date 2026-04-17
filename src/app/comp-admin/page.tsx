'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { Spinner, EmptyState } from '@/components/ui'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'
import toast from 'react-hot-toast'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Tipster {
  user_id:      string
  display_name: string
  email:        string
  joined_at:    string | null
}
interface Invitation {
  id:           string
  email:        string
  invited_at:   string
  joined_at:    string | null
  user_id:      string | null   // set if email matches a registered user
  display_name: string | null   // set if user has joined
  joined:       boolean
}
interface Tribe     { id: string; name: string; description?: string | null; invite_code: string; member_count?: number }
interface Challenge { id: string; fixture_id: number; prize: string; sponsor?: string | null; fixture_label?: string }
interface Fixture   { id: number; home: string; away: string; date: string; round: string }
interface Payment   { user_id: string; display_name: string; email: string; paid: boolean; paid_at: string | null; notes: string | null }

type Tab = 'tipsters' | 'payments' | 'email' | 'settings' | 'tribes' | 'challenges'

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'tipsters',   icon: '👥', label: 'Tipsters'   },
  { id: 'payments',   icon: '💳', label: 'Payments'   },
  { id: 'email',      icon: '✉️',  label: 'Email'      },
  { id: 'settings',   icon: '⚙️',  label: 'Settings'   },
  { id: 'tribes',     icon: '🏕️',  label: 'Tribes'     },
  { id: 'challenges', icon: '⚡',  label: 'Challenges' },
]

// ─── Shared UI ────────────────────────────────────────────────────────────────
function Avi({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const palette  = ['bg-violet-100 text-violet-700','bg-sky-100 text-sky-700','bg-emerald-100 text-emerald-700','bg-amber-100 text-amber-700','bg-rose-100 text-rose-700']
  const color    = palette[(name.charCodeAt(0) || 0) % palette.length]
  const sz       = size === 'sm' ? 'w-7 h-7 text-[10px]' : size === 'lg' ? 'w-10 h-10 text-sm' : 'w-8 h-8 text-xs'
  return <div className={clsx('rounded-full flex items-center justify-center font-bold flex-shrink-0 select-none', sz, color)}>{initials}</div>
}

function StatusPill({ joined, userExists }: { joined: boolean; userExists: boolean }) {
  if (joined) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">✓ Joined</span>
  if (userExists) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-700">Registered</span>
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">Invited</span>
}

function Section({ title, sub, right, children }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm mb-4">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        <div>
          <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">{title}</p>
          {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

// ─── Tab: Tipsters ─────────────────────────────────────────────────────────────
function TipstersTab({ comp, tipsters, setTipsters, invitations, setInvitations, currentUserId }: {
  comp:           any
  tipsters:       Tipster[]
  setTipsters:    React.Dispatch<React.SetStateAction<Tipster[]>>
  invitations:    Invitation[]
  setInvitations: React.Dispatch<React.SetStateAction<Invitation[]>>
  currentUserId:  string
}) {
  const [emailInput, setEmailInput]   = useState('')
  const [bulkInput,  setBulkInput]    = useState('')
  const [showBulk,   setShowBulk]     = useState(false)
  const [sending,    setSending]      = useState(false)
  const [removing,   setRemoving]     = useState<string | null>(null)
  const [filter,     setFilter]       = useState<'all' | 'joined' | 'registered' | 'invited'>('all')
  const [search,     setSearch]       = useState('')

  // Merged view: tipsters (joined) + invitations (pending/registered)
  // A person appears once: joined tipsters take precedence over invitations
  const mergedList = useMemo(() => {
    type Row = { key: string; email: string; display_name: string | null; user_id: string | null; joined: boolean; registered: boolean; joined_at: string | null; invited_at: string | null; inv_id: string | null; is_tipster: boolean }
    const rows: Row[] = []
    const seenEmails = new Set<string>()

    // First: all joined tipsters
    tipsters.forEach(t => {
      seenEmails.add(t.email.toLowerCase())
      rows.push({ key: t.user_id, email: t.email, display_name: t.display_name, user_id: t.user_id, joined: true, registered: true, joined_at: t.joined_at, invited_at: null, inv_id: null, is_tipster: true })
    })
    // Then: invitations whose email hasn't appeared yet
    invitations.forEach(inv => {
      if (seenEmails.has(inv.email.toLowerCase())) return
      seenEmails.add(inv.email.toLowerCase())
      rows.push({ key: inv.id, email: inv.email, display_name: inv.display_name, user_id: inv.user_id, joined: false, registered: !!inv.user_id, joined_at: null, invited_at: inv.invited_at, inv_id: inv.id, is_tipster: false })
    })
    return rows
  }, [tipsters, invitations])

  const filtered = useMemo(() => {
    let list = mergedList
    if (filter === 'joined')     list = list.filter(r => r.joined)
    if (filter === 'registered') list = list.filter(r => r.registered && !r.joined)
    if (filter === 'invited')    list = list.filter(r => !r.registered && !r.joined)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(r => r.email.toLowerCase().includes(q) || (r.display_name ?? '').toLowerCase().includes(q))
    }
    return list
  }, [mergedList, filter, search])

  const counts = useMemo(() => ({
    joined:     mergedList.filter(r => r.joined).length,
    registered: mergedList.filter(r => r.registered && !r.joined).length,
    invited:    mergedList.filter(r => !r.registered && !r.joined).length,
  }), [mergedList])

  const sendInvites = async (emails: string[]) => {
    const valid = emails.map(e => e.trim().toLowerCase()).filter(e => /\S+@\S+\.\S+/.test(e))
    if (!valid.length) { toast.error('No valid email addresses'); return }
    setSending(true)
    const res = await fetch('/api/comp-invitations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comp_id: comp.id, emails: valid }),
    })
    const { results, invited, already } = await res.json()
    setSending(false)
    if (!res.ok) { toast.error('Failed to send invitations'); return }
    // Add new invitations to state
    const newInvs: Invitation[] = (results ?? [])
      .filter((r: any) => r.status === 'invited')
      .map((r: any) => ({ id: r.id, email: r.email, invited_at: new Date().toISOString(), joined_at: null, user_id: null, display_name: null, joined: false }))
    setInvitations(prev => [...newInvs, ...prev])
    setEmailInput(''); setBulkInput(''); setShowBulk(false)
    toast.success(`${invited} invite${invited !== 1 ? 's' : ''} sent${already ? ` · ${already} already invited` : ''}`)
  }

  const removeTipster = async (userId: string, displayName: string) => {
    if (!confirm(`Remove ${displayName} from this comp? They will lose access to their predictions.`)) return
    setRemoving(userId)
    const res = await fetch(`/api/comp-members?comp_id=${comp.id}&user_id=${userId}`, { method: 'DELETE' })
    setRemoving(null)
    if (res.ok) {
      setTipsters(prev => prev.filter(t => t.user_id !== userId))
      toast.success(`${displayName} removed from comp`)
    } else {
      const d = await res.json()
      toast.error(d.error ?? 'Failed to remove')
    }
  }

  const revokeInvitation = async (invId: string, email: string) => {
    if (!confirm(`Revoke invitation for ${email}?`)) return
    const res = await fetch(`/api/comp-invitations?id=${invId}`, { method: 'DELETE' })
    if (res.ok) { setInvitations(prev => prev.filter(i => i.id !== invId)); toast.success('Invitation revoked') }
    else toast.error('Failed to revoke')
  }

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { label: 'Total',       value: mergedList.length,     color: 'text-gray-800'     },
          { label: 'Joined',      value: counts.joined,         color: 'text-emerald-600'  },
          { label: 'Registered',  value: counts.registered,     color: 'text-sky-600'      },
          { label: 'Invited',     value: counts.invited,        color: 'text-amber-600'    },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-2.5 text-center shadow-sm">
            <p className={clsx('text-xl font-black', s.color)}>{s.value}</p>
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4 px-1 text-[11px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /><b>Joined</b> — in user_comps for this comp</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-400 inline-block" /><b>Registered</b> — has an app account, not yet joined</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /><b>Invited</b> — email sent, no app account yet</span>
      </div>

      {/* Invite code */}
      <Section title="Comp join code" sub="Tipsters enter this on the home page to join">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-center">
            <span className="text-xl font-mono font-black tracking-[0.3em] text-gray-800 select-all">{comp?.invite_code ?? '—'}</span>
          </div>
          <button onClick={async () => { await navigator.clipboard.writeText(comp?.invite_code ?? ''); toast.success('Copied!') }}
            className="px-3 py-2 bg-gray-900 text-white text-xs font-bold rounded-xl hover:bg-gray-800 transition-colors">
            Copy
          </button>
        </div>
      </Section>

      {/* Send invites */}
      <Section title="Invite by email" sub="Send an email invitation with a join link">
        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            <input type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendInvites([emailInput])}
              placeholder="tipster@example.com"
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-800"
            />
            <button onClick={() => sendInvites([emailInput])} disabled={sending || !emailInput.trim()}
              className="px-4 py-2 bg-gray-900 disabled:opacity-40 text-white text-xs font-bold rounded-xl hover:bg-gray-800 transition-colors flex items-center gap-1.5">
              {sending ? <Spinner className="w-3 h-3 text-white" /> : null}
              Send invite
            </button>
          </div>
          <button onClick={() => setShowBulk(v => !v)} className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 font-medium">
            {showBulk ? 'Hide bulk import ↑' : '+ Bulk import multiple emails'}
          </button>
          {showBulk && (
            <div className="space-y-2">
              <textarea value={bulkInput} onChange={e => setBulkInput(e.target.value)} rows={4}
                placeholder={"Paste emails — one per line, or comma/semicolon separated:\n\nalice@example.com\nbob@example.com, charlie@example.com"}
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-800 resize-none font-mono"
              />
              <button onClick={() => sendInvites(bulkInput.split(/[\n,;]+/))} disabled={sending || !bulkInput.trim()}
                className="px-4 py-2 bg-gray-900 text-white text-xs font-bold rounded-xl disabled:opacity-40 hover:bg-gray-800 transition-colors">
                {(() => {
                  const n = bulkInput.split(/[\n,;]+/).filter(e => e.trim().includes('@')).length
                  return sending ? 'Sending…' : `Send ${n} invite${n !== 1 ? 's' : ''}`
                })()}
              </button>
            </div>
          )}
        </div>
      </Section>

      {/* Tipster list */}
      <Section
        title="All tipsters"
        sub={`${mergedList.length} total · ${counts.joined} joined · ${counts.registered} registered · ${counts.invited} invited`}
        right={
          <div className="flex gap-1">
            {(['all','joined','registered','invited'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={clsx('px-2 py-1 rounded-lg text-[10px] font-bold capitalize transition-colors',
                  filter === f ? 'bg-gray-900 text-white' : 'text-gray-400 hover:bg-gray-100')}>
                {f}
              </button>
            ))}
          </div>
        }>
        {/* Search */}
        <div className="px-4 pt-3 pb-2 border-b border-gray-100">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-800 bg-white"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            {mergedList.length === 0 ? 'No tipsters yet — send your first invite above.' : `No ${filter === 'all' ? 'results' : filter} tipsters${search ? ` matching "${search}"` : ''}.`}
          </div>
        ) : (
          <div>
            {filtered.map((row, i) => (
              <div key={row.key} className={clsx('flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 group', i % 2 === 1 ? 'bg-gray-50/30' : '')}>
                <Avi name={row.display_name || row.email} />
                <div className="flex-1 min-w-0">
                  {row.display_name && <p className="text-xs font-bold text-gray-800 truncate">{row.display_name}</p>}
                  <p className="text-[11px] text-gray-500 truncate">{row.email}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {row.joined && row.joined_at && `Joined ${new Date(row.joined_at).toLocaleDateString()}`}
                    {!row.joined && row.invited_at && `Invited ${new Date(row.invited_at).toLocaleDateString()}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusPill joined={row.joined} userExists={row.registered} />
                  {/* Remove joined tipster */}
                  {row.is_tipster && row.user_id !== currentUserId && (
                    <button onClick={() => removeTipster(row.user_id!, row.display_name ?? row.email)}
                      disabled={removing === row.user_id}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      title="Remove from comp">
                      {removing === row.user_id ? <Spinner className="w-3 h-3" /> : '✕'}
                    </button>
                  )}
                  {/* Revoke invitation (only for non-joined, non-member rows) */}
                  {!row.is_tipster && row.inv_id && (
                    <button onClick={() => revokeInvitation(row.inv_id!, row.email)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      title="Revoke invitation">
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

// ─── Tab: Payments ─────────────────────────────────────────────────────────────
function PaymentsTab({ comp, tipsters }: { comp: any; tipsters: Tipster[] }) {
  const storageKey = `payments_${comp.id}`
  const feeKey     = `fee_${comp.id}`

  const loadPayments = (): Payment[] => {
    const savedMap: Record<string, Partial<Payment>> = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
    return tipsters.map(t => ({
      user_id: t.user_id, display_name: t.display_name, email: t.email,
      paid: false, paid_at: null, notes: null,
      ...savedMap[t.user_id],
    }))
  }

  const [payments,    setPayments]    = useState<Payment[]>([])
  const [fee,         setFee]         = useState(localStorage.getItem(feeKey) ?? '')
  const [editingFee,  setEditingFee]  = useState(false)
  const [filter,      setFilter]      = useState<'all'|'paid'|'unpaid'>('all')
  const [editingNote, setEditingNote] = useState<string | null>(null)
  const [search,      setSearch]      = useState('')

  useEffect(() => { setPayments(loadPayments()) }, [tipsters, comp.id])

  const persist = (updated: Payment[]) => {
    const map: Record<string, Partial<Payment>> = {}
    updated.forEach(p => { map[p.user_id] = { paid: p.paid, paid_at: p.paid_at, notes: p.notes } })
    localStorage.setItem(storageKey, JSON.stringify(map))
    setPayments(updated)
  }

  const toggle = (userId: string) => {
    persist(payments.map(p => p.user_id === userId
      ? { ...p, paid: !p.paid, paid_at: !p.paid ? new Date().toISOString() : null }
      : p))
  }

  const saveNote = (userId: string, note: string) => {
    persist(payments.map(p => p.user_id === userId ? { ...p, notes: note || null } : p))
    setEditingNote(null)
  }

  const saveFee = () => {
    localStorage.setItem(feeKey, fee)
    setEditingFee(false)
    toast.success('Entry fee saved')
  }

  const feeNum      = parseFloat(fee) || 0
  const paidCount   = payments.filter(p => p.paid).length
  const unpaidCount = payments.filter(p => !p.paid).length

  const filtered = useMemo(() => {
    let list = payments
    if (filter === 'paid')   list = list.filter(p => p.paid)
    if (filter === 'unpaid') list = list.filter(p => !p.paid)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(p => p.display_name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
    }
    return list
  }, [payments, filter, search])

  return (
    <div>
      {/* Fee + summary */}
      <Section title="Entry fee">
        <div className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
              <span className="text-sm font-bold text-gray-500">$</span>
              <input type="number" min="0" step="0.50" value={fee}
                onChange={e => { setFee(e.target.value); setEditingFee(true) }}
                placeholder="0.00"
                className="w-20 bg-transparent text-sm font-bold focus:outline-none"
              />
            </div>
            {editingFee && (
              <button onClick={saveFee} className="px-3 py-2 bg-gray-900 text-white text-xs font-bold rounded-xl hover:bg-gray-800">Save</button>
            )}
            {fee && !editingFee && <span className="text-xs text-gray-400">per person</span>}
          </div>
          {feeNum > 0 && (
            <div className="grid grid-cols-3 gap-3 mt-3">
              {[
                { label: 'Expected',    val: (payments.length * feeNum).toFixed(2), color: 'text-gray-700' },
                { label: 'Collected',   val: (paidCount * feeNum).toFixed(2),       color: 'text-emerald-600' },
                { label: 'Outstanding', val: (unpaidCount * feeNum).toFixed(2),     color: 'text-amber-600' },
              ].map(s => (
                <div key={s.label} className="text-center bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                  <p className={clsx('text-base font-black', s.color)}>${s.val}</p>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: 'Tipsters', value: payments.length, color: 'text-gray-800' },
          { label: 'Paid',     value: paidCount,       color: 'text-emerald-600' },
          { label: 'Unpaid',   value: unpaidCount,     color: 'text-amber-600' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-2.5 text-center shadow-sm">
            <p className={clsx('text-xl font-black', s.color)}>{s.value}</p>
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tracker */}
      <Section title="Payment tracker"
        right={
          <div className="flex gap-1">
            {(['all','paid','unpaid'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={clsx('px-2 py-1 rounded-lg text-[10px] font-bold capitalize transition-colors',
                  filter === f ? 'bg-gray-900 text-white' : 'text-gray-400 hover:bg-gray-100')}>
                {f}
              </button>
            ))}
          </div>
        }>
        <div className="px-4 pt-3 pb-2 border-b border-gray-100">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search tipster…"
            className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-800"
          />
        </div>
        {payments.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">No joined tipsters yet.</div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-gray-400">No {filter} tipsters{search ? ` matching "${search}"` : ''}.</div>
        ) : filtered.map((p, i) => (
          <div key={p.user_id} className={clsx('px-4 py-3 border-b border-gray-50 last:border-0 group', i % 2 === 1 ? 'bg-gray-50/30' : '')}>
            <div className="flex items-center gap-3">
              <Avi name={p.display_name} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-gray-800 truncate">{p.display_name}</p>
                <p className="text-[11px] text-gray-400 truncate">{p.email}</p>
                {p.notes && editingNote !== p.user_id && (
                  <p className="text-[11px] text-gray-500 italic mt-0.5 truncate">📝 {p.notes}</p>
                )}
                {editingNote === p.user_id && (
                  <input autoFocus type="text" defaultValue={p.notes ?? ''}
                    onBlur={e => saveNote(p.user_id, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveNote(p.user_id, (e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditingNote(null) }}
                    placeholder="e.g. paid via bank transfer"
                    className="mt-1.5 w-full px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900"
                  />
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => setEditingNote(editingNote === p.user_id ? null : p.user_id)}
                  className="text-sm text-gray-300 hover:text-gray-500 transition-colors opacity-0 group-hover:opacity-100" title="Add note">📝</button>
                <button onClick={() => toggle(p.user_id)}
                  className={clsx('px-3 py-1.5 rounded-xl text-xs font-bold transition-all border',
                    p.paid
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-red-50 hover:border-red-200 hover:text-red-600'
                      : 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700')}>
                  {p.paid ? '✓ Paid' : 'Mark paid'}
                </button>
              </div>
            </div>
            {p.paid && p.paid_at && <p className="text-[10px] text-emerald-500 mt-1 ml-11">{new Date(p.paid_at).toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' })}</p>}
          </div>
        ))}
      </Section>

      {payments.length > 0 && (
        <button onClick={() => {
          const rows = ['Name,Email,Paid,Paid At,Notes', ...payments.map(p => `"${p.display_name}","${p.email}",${p.paid},${p.paid_at ?? ''},"${p.notes ?? ''}"`)]
          const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type:'text/csv' }))
          a.download = `${comp.name ?? 'comp'}-payments.csv`; a.click()
        }} className="w-full py-2.5 border border-gray-200 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-50 transition-colors">
          ↓ Export payments CSV
        </button>
      )}
    </div>
  )
}

// ─── Tab: Email ────────────────────────────────────────────────────────────────
function EmailTab({ comp, tipsters }: { comp: any; tipsters: Tipster[] }) {
  const [subject,      setSubject]      = useState('')
  const [body,         setBody]         = useState('')
  const [recipients,   setRecipients]   = useState<'all'|'custom'>('all')
  const [customEmails, setCustomEmails] = useState('')
  const [sending,      setSending]      = useState(false)
  const [preview,      setPreview]      = useState(false)

  const TEMPLATES = [
    { label: '👋 Welcome',  subject: `Welcome to ${comp?.name}!`,                  body: `Hi {name},\n\nYou've been invited to join ${comp?.name} for the FIFA World Cup 2026.\n\nJoin code: ${comp?.invite_code}\n\nGood luck!\n\nThe ${comp?.name} team` },
    { label: '⏰ Reminder', subject: `Don't forget your tips!`,                     body: `Hi {name},\n\nJust a reminder — predictions are open! Log in and get your tips in before the next match locks.\n\nGood luck!\n\nThe ${comp?.name} team` },
    { label: '🏆 Results',  subject: `Round results are in!`,                       body: `Hi {name},\n\nThe latest results are in — check the leaderboard to see where you stand!\n\nThe ${comp?.name} team` },
    { label: '💰 Pay up',   subject: `Entry fee reminder for ${comp?.name}`,        body: `Hi {name},\n\nFriendly reminder that your entry fee for ${comp?.name} is still outstanding.\n\nPlease arrange payment when you get a chance.\n\nThanks!\n\nThe ${comp?.name} team` },
  ]

  const recipientList = useMemo(() =>
    recipients === 'all'
      ? tipsters.map(t => t.email)
      : customEmails.split(/[\n,;]+/).map(e => e.trim()).filter(e => e.includes('@'))
  , [recipients, tipsters, customEmails])

  const send = async () => {
    if (!subject.trim() || !body.trim()) { toast.error('Subject and body required'); return }
    if (!recipientList.length) { toast.error('No recipients'); return }
    setSending(true)
    const res = await fetch('/api/comp-announcements', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comp_id: comp.id, title: subject, body, recipients: recipientList }),
    })
    setSending(false)
    if (res.ok) { toast.success(`Email sent to ${recipientList.length} tipster${recipientList.length !== 1 ? 's' : ''}`); setSubject(''); setBody('') }
    else { const d = await res.json(); toast.error(d.error ?? 'Failed to send') }
  }

  return (
    <div>
      <Section title="Quick templates" sub="Click to pre-fill">
        <div className="grid grid-cols-2 gap-2 p-3">
          {TEMPLATES.map(t => (
            <button key={t.label} onClick={() => { setSubject(t.subject); setBody(t.body); setPreview(false) }}
              className="text-left px-3 py-2.5 border border-gray-200 rounded-xl hover:border-gray-900 hover:bg-gray-50 transition-all">
              <p className="text-xs font-bold text-gray-700">{t.label}</p>
              <p className="text-[10px] text-gray-400 mt-0.5 truncate">{t.subject}</p>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Compose" sub={`Sending to ${recipientList.length} tipster${recipientList.length !== 1 ? 's' : ''}`}>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1.5">Recipients</label>
            <div className="flex gap-2">
              {(['all','custom'] as const).map(r => (
                <button key={r} onClick={() => setRecipients(r)}
                  className={clsx('px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors',
                    recipients === r ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-200 text-gray-600 hover:border-gray-400')}>
                  {r === 'all' ? `All joined tipsters (${tipsters.length})` : 'Custom list'}
                </button>
              ))}
            </div>
            {recipients === 'custom' && (
              <textarea value={customEmails} onChange={e => setCustomEmails(e.target.value)} rows={2}
                placeholder="Paste emails, comma or newline separated"
                className="mt-2 w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-800 font-mono resize-none"
              />
            )}
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1.5">Subject</label>
            <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Your email subject…"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-800"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-gray-600">Message</label>
              <button onClick={() => setPreview(v => !v)} className="text-[11px] text-gray-400 hover:text-gray-700 font-medium">
                {preview ? 'Edit' : 'Preview'}
              </button>
            </div>
            {preview ? (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-700 whitespace-pre-wrap min-h-[100px] font-mono">{body || <span className="text-gray-300 italic">Nothing to preview</span>}</div>
            ) : (
              <textarea value={body} onChange={e => setBody(e.target.value)} rows={6}
                placeholder={"Hi {name},\n\nWrite your message here…\n\nUse {name} to personalise with each tipster's name."}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-800 resize-none"
              />
            )}
            <p className="text-[10px] text-gray-400 mt-1">Use <code className="bg-gray-100 px-1 rounded">{'{name}'}</code> to personalise with each tipster's display name</p>
          </div>
          <button onClick={send} disabled={sending || !subject.trim() || !body.trim() || !recipientList.length}
            className="w-full py-2.5 bg-gray-900 disabled:opacity-40 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-colors flex items-center justify-center gap-2">
            {sending ? <><Spinner className="w-4 h-4 text-white" />Sending…</> : `✉️ Send to ${recipientList.length} tipster${recipientList.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </Section>
    </div>
  )
}

// ─── Tab: Settings ─────────────────────────────────────────────────────────────
function SettingsTab({ comp, tier, domain, minAge, onUpdate }: { comp: any; tier: string; domain: string | null; minAge: number | null; onUpdate: (k: string, v: any) => void }) {
  const [name,         setName]         = useState(comp?.name ?? '')
  const [savingName,   setSavingName]   = useState(false)
  const [newDomain,    setNewDomain]    = useState(domain ?? '')
  const [newMinAge,    setNewMinAge]    = useState(minAge ? String(minAge) : '')
  const [adminEmail,   setAdminEmail]   = useState('')
  const [grantingAdmin,setGrantingAdmin]= useState(false)

  const saveName = async () => {
    if (!name.trim() || name === comp?.name) return
    setSavingName(true)
    const res = await fetch('/api/comps/create', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: comp.id, name: name.trim() }) })
    setSavingName(false)
    if (res.ok) { onUpdate('name', name.trim()); toast.success('Name updated') } else toast.error('Failed')
  }
  const saveDomain = async () => {
    const res = await fetch('/api/comps/domain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comp_id: comp.id, email_domain: newDomain.trim() || null }) })
    if (res.ok) { onUpdate('domain', newDomain || null); toast.success(newDomain ? 'Domain restriction saved' : 'Domain restriction removed') } else toast.error('Failed')
  }
  const saveAge = async () => {
    const age = parseInt(newMinAge) || null
    const res = await fetch('/api/comps/create', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: comp.id, min_age: age }) })
    if (res.ok) { onUpdate('minAge', age); toast.success(age ? `Minimum age set to ${age}` : 'Age restriction removed') } else toast.error('Failed')
  }
  const grantAdmin = async () => {
    if (!adminEmail.trim()) return
    setGrantingAdmin(true)
    const res = await fetch('/api/comp-admins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: adminEmail.trim(), comp_id: comp.id }) })
    setGrantingAdmin(false)
    const d = await res.json()
    if (d.success) { toast.success(`Admin access granted to ${adminEmail}`); setAdminEmail('') } else toast.error(d.error ?? 'Failed')
  }

  return (
    <div className="space-y-0">
      <div className="mb-4 flex items-center gap-2 bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
        <span className={clsx('text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full',
          tier === 'enterprise' ? 'bg-violet-100 text-violet-700' : tier === 'business' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700')}>
          {tier}
        </span>
        <span className="text-xs text-gray-500">Current plan</span>
      </div>

      {[
        { title: 'Comp name', content: (
          <div className="flex gap-2 p-4">
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-800" />
            <button onClick={saveName} disabled={savingName || name === comp?.name} className="px-4 py-2 bg-gray-900 text-white text-xs font-bold rounded-xl disabled:opacity-40 hover:bg-gray-800">{savingName ? '…' : 'Save'}</button>
          </div>
        )},
        { title: 'Domain restriction', sub: tier === 'enterprise' ? 'Only allow emails from this domain' : '🔒 Enterprise plan required', content: (
          <div className="p-4">
            {tier === 'enterprise' ? (
              <div className="flex gap-2 items-center">
                <span className="text-xs text-gray-500 font-bold">@</span>
                <input type="text" value={newDomain} onChange={e => setNewDomain(e.target.value.toLowerCase().replace(/^@/,''))} placeholder="company.com (blank to remove)" className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-800" />
                <button onClick={saveDomain} className="px-4 py-2 bg-gray-900 text-white text-xs font-bold rounded-xl hover:bg-gray-800">Save</button>
              </div>
            ) : <p className="text-xs text-gray-400 bg-gray-50 rounded-xl p-3">Upgrade to Enterprise to restrict by email domain.</p>}
          </div>
        )},
        { title: 'Minimum age', sub: 'Optional — restrict who can join', content: (
          <div className="flex gap-2 items-center p-4">
            <input type="number" min="13" max="100" value={newMinAge} onChange={e => setNewMinAge(e.target.value)} placeholder="No restriction" className="w-28 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-800" />
            <button onClick={saveAge} className="px-4 py-2 bg-gray-900 text-white text-xs font-bold rounded-xl hover:bg-gray-800">Save</button>
            {newMinAge && <span className="text-xs text-gray-400">years or older</span>}
          </div>
        )},
        { title: 'Grant admin access', sub: 'Give another tipster comp admin rights', content: (
          <div className="flex gap-2 p-4">
            <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && grantAdmin()} placeholder="tipster@example.com" className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-800" />
            <button onClick={grantAdmin} disabled={grantingAdmin || !adminEmail.trim()} className="px-4 py-2 bg-gray-900 text-white text-xs font-bold rounded-xl disabled:opacity-40 hover:bg-gray-800 flex items-center gap-1.5">
              {grantingAdmin && <Spinner className="w-3 h-3 text-white" />}Grant
            </button>
          </div>
        )},
      ].map(s => (
        <Section key={s.title} title={s.title} sub={(s as any).sub}>{s.content}</Section>
      ))}
    </div>
  )
}

// ─── Tab: Tribes ───────────────────────────────────────────────────────────────
function TribesTab({ comp, tipsters, tribes, setTribes }: { comp: any; tipsters: Tipster[]; tribes: Tribe[]; setTribes: React.Dispatch<React.SetStateAction<Tribe[]>> }) {
  const [name,     setName]     = useState('')
  const [desc,     setDesc]     = useState('')
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const create = async () => {
    if (!name.trim()) return
    setCreating(true)
    const res = await fetch('/api/tribes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), description: desc.trim() || null, comp_id: comp.id }) })
    const { data, error: err } = await res.json()
    setCreating(false)
    if (err) { setError(res.status === 409 ? `"${name.trim()}" already exists` : err) }
    else { toast.success(`Tribe "${data.name}" created`); setTribes(prev => [data, ...prev]); setName(''); setDesc(''); setError(null); setShowForm(false) }
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[{ label:'Tribes', v:tribes.length },{ label:'Tipsters', v:tipsters.length },{ label:'Avg size', v: tribes.length ? Math.round(tipsters.length / tribes.length) : 0 }].map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-2.5 text-center shadow-sm">
            <p className="text-xl font-black text-gray-800">{s.v}</p>
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {!showForm ? (
        <button onClick={() => setShowForm(true)} className="w-full mb-4 py-3 border-2 border-dashed border-gray-300 rounded-2xl text-sm font-semibold text-gray-500 hover:border-gray-900 hover:text-gray-900 transition-all flex items-center justify-center gap-2">
          <span className="text-lg">+</span> Create new tribe
        </button>
      ) : (
        <Section title="New tribe">
          <div className="p-4 space-y-3">
            <input type="text" value={name} onChange={e => { setName(e.target.value); setError(null) }} onKeyDown={e => e.key === 'Enter' && create()} placeholder="Tribe name" maxLength={50} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-800" />
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="Short description (optional)" maxLength={200} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-800 resize-none" />
            {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-xl">{error}</p>}
            <div className="flex gap-2">
              <button onClick={create} disabled={creating || !name.trim()} className="flex-1 py-2 bg-gray-900 text-white text-xs font-bold rounded-xl disabled:opacity-40 hover:bg-gray-800">{creating ? 'Creating…' : 'Create tribe'}</button>
              <button onClick={() => { setShowForm(false); setName(''); setDesc(''); setError(null) }} className="px-4 py-2 border border-gray-200 text-xs font-semibold text-gray-600 rounded-xl hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </Section>
      )}

      {tribes.length === 0 ? <EmptyState title="No tribes yet" description="Create a tribe to organise tipsters into groups." /> : (
        <div className="space-y-3">
          {tribes.map(t => (
            <div key={t.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                <div>
                  <p className="text-sm font-bold text-gray-800">{t.name}</p>
                  {t.description && <p className="text-[11px] text-gray-400 mt-0.5">{t.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{t.member_count ?? 0} members</span>
                  <button onClick={async () => { await navigator.clipboard.writeText(t.invite_code); toast.success('Tribe code copied!') }}
                    className="font-mono text-[11px] bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded-lg text-gray-600 transition-colors">{t.invite_code}</button>
                </div>
              </div>
              <p className="text-xs text-gray-400 italic px-4 py-3">Share the tribe code for members to join this tribe.</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Tab: Challenges ───────────────────────────────────────────────────────────
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
    Promise.all([fetch(`/api/comp-challenges?comp_id=${comp.id}`).then(r => r.json()), fetch('/api/fixtures').then(r => r.json())])
      .then(([cd, fd]) => {
        const fs: Fixture[] = (fd.data ?? []).map((f: any) => ({ id: f.id, home: f.home, away: f.away, date: f.date, round: f.round }))
        setFixtures(fs)
        setChallenges((cd.data ?? []).map((c: any) => ({ ...c, fixture_label: fs.find(f => f.id === c.fixture_id) ? `${fs.find(f => f.id === c.fixture_id)!.home} vs ${fs.find(f => f.id === c.fixture_id)!.away}` : `Fixture ${c.fixture_id}` })))
      }).finally(() => setLoading(false))
  }, [comp.id])

  const create = async () => {
    if (!fixtureId || !prize.trim()) { toast.error('Select a match and enter a prize'); return }
    setSaving(true)
    const res = await fetch('/api/comp-challenges', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comp_id: comp.id, fixture_id: parseInt(fixtureId), prize: prize.trim(), sponsor: sponsor.trim() || null }) })
    const { data, error } = await res.json()
    setSaving(false)
    if (error) { toast.error(error); return }
    const fx = fixtures.find(f => f.id === parseInt(fixtureId))
    setChallenges(prev => [{ ...data, fixture_label: fx ? `${fx.home} vs ${fx.away}` : `Fixture ${fixtureId}` }, ...prev])
    setFixtureId(''); setPrize(''); setSponsor(''); setShowForm(false)
    toast.success('Challenge created')
  }

  const del = async (id: string) => {
    if (!confirm('Delete this challenge?')) return
    await fetch(`/api/comp-challenges?id=${id}`, { method: 'DELETE' })
    setChallenges(prev => prev.filter(c => c.id !== id))
    toast.success('Deleted')
  }

  const byRound = useMemo(() => {
    const m: Record<string, Fixture[]> = {}
    fixtures.forEach(f => { if (!m[f.round]) m[f.round] = []; m[f.round].push(f) })
    return m
  }, [fixtures])

  return (
    <div>
      <div className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <p className="text-xs font-bold text-amber-800 mb-1">⚡ Match challenges</p>
        <p className="text-xs text-amber-700">Attach a special prize to any match. The tipster who correctly predicts that match wins. Great for keeping engagement high throughout the tournament.</p>
      </div>

      {!showForm ? (
        <button onClick={() => setShowForm(true)} className="w-full mb-4 py-3 border-2 border-dashed border-gray-300 rounded-2xl text-sm font-semibold text-gray-500 hover:border-gray-900 hover:text-gray-900 transition-all flex items-center justify-center gap-2">
          <span className="text-lg">+</span> Add challenge
        </button>
      ) : (
        <Section title="New challenge">
          <div className="p-4 space-y-3">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5">Match</label>
              <select value={fixtureId} onChange={e => setFixtureId(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-800 bg-white">
                <option value="">Select a match…</option>
                {Object.entries(byRound).map(([r, fs]) => (
                  <optgroup key={r} label={r.toUpperCase()}>
                    {fs.map(f => <option key={f.id} value={f.id}>{f.home} vs {f.away} · {f.date}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5">Prize 🏆</label>
              <input type="text" value={prize} onChange={e => setPrize(e.target.value)} placeholder="e.g. $50 gift card, bottle of wine…" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-800" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5">Sponsor <span className="font-normal text-gray-400">(optional)</span></label>
              <input type="text" value={sponsor} onChange={e => setSponsor(e.target.value)} placeholder="e.g. Joe's Bottle Shop" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-800" />
            </div>
            <div className="flex gap-2">
              <button onClick={create} disabled={saving || !fixtureId || !prize.trim()} className="flex-1 py-2 bg-gray-900 text-white text-xs font-bold rounded-xl disabled:opacity-40 hover:bg-gray-800">{saving ? 'Creating…' : 'Create'}</button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-200 text-xs font-semibold text-gray-600 rounded-xl hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </Section>
      )}

      {loading ? <div className="flex justify-center py-8"><Spinner className="w-5 h-5" /></div>
       : challenges.length === 0 ? <EmptyState title="No challenges yet" description="Create a challenge to attach a prize to a specific match." />
       : (
        <div className="space-y-2">
          {challenges.map(c => (
            <div key={c.id} className="bg-white border border-gray-200 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm group">
              <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-base flex-shrink-0">⚡</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-gray-800 truncate">{c.fixture_label}</p>
                <p className="text-xs text-emerald-700 font-semibold mt-0.5">🏆 {c.prize}</p>
                {c.sponsor && <p className="text-[11px] text-gray-400 mt-0.5">Sponsored by {c.sponsor}</p>}
              </div>
              <button onClick={() => del(c.id)} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100 flex-shrink-0">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function CompAdminPage() {
  const { session }                                         = useSupabase()
  const { selectedComp, isCompAdmin, loading: ctxLoading }  = useUserPrefs()

  const [activeTab,   setActiveTab]   = useState<Tab>('tipsters')
  const [loading,     setLoading]     = useState(false)
  const [tipsters,    setTipsters]    = useState<Tipster[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [tribes,      setTribes]      = useState<Tribe[]>([])
  const [tier,        setTier]        = useState('trial')
  const [domain,      setDomain]      = useState<string | null>(null)
  const [minAge,      setMinAge]      = useState<number | null>(null)

  const comp = selectedComp as any

  useEffect(() => {
    if (!session || !comp?.id) return
    setLoading(true)
    Promise.all([
      fetch(`/api/comp-members?comp_id=${comp.id}`),        // joined tipsters from user_comps
      fetch(`/api/comp-invitations?comp_id=${comp.id}`),    // invitation records
      fetch(`/api/comp-subscriptions?comp_id=${comp.id}`),
      fetch(`/api/comps/domain?comp_id=${comp.id}`),
      fetch(`/api/tribes/list?comp_id=${comp.id}`),
    ]).then(async rs => {
      const [tipData, invData, subData, domData, tribesData] = await Promise.all(rs.map(r => r.json()))
      setTipsters(tipData.data ?? [])
      setInvitations(invData.data ?? [])
      setTier(subData.data?.tier ?? 'trial')
      setDomain(domData.email_domain ?? null)
      setTribes(tribesData.data ?? [])
    }).finally(() => setLoading(false))
  }, [session, comp?.id])

  const handleSettingUpdate = useCallback((k: string, v: any) => {
    if (k === 'domain') setDomain(v)
    if (k === 'minAge') setMinAge(v)
  }, [])

  if (ctxLoading || loading) return <div className="flex justify-center py-24"><Spinner className="w-8 h-8" /></div>

  if (!isCompAdmin || !comp) return (
    <div className="max-w-sm mx-auto px-4 py-24 text-center">
      <div className="text-5xl mb-4">🔒</div>
      <h1 className="text-base font-bold text-gray-900 mb-2">{comp ? 'Not a comp admin' : 'No comp selected'}</h1>
      <p className="text-sm text-gray-500 mb-6">{comp ? `You're not an admin for ${comp.name}.` : 'Select a comp you manage on the home page.'}</p>
      <a href="/" className="inline-block px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-xl">Go home</a>
    </div>
  )

  const badgeCounts: Partial<Record<Tab, number>> = {
    tipsters:   tipsters.length + invitations.filter(i => !i.joined).length || 0,
    tribes:     tribes.length || 0,
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        {comp.logo_url
          ? <img src={comp.logo_url} alt={comp.name} className="w-10 h-10 rounded-xl object-cover border border-gray-200" />
          : <div className="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center text-white text-base font-black">{comp.name?.[0] ?? '?'}</div>
        }
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-black text-gray-900 truncate">{comp.name}</h1>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {tipsters.length} joined · {invitations.filter(i => !i.joined).length} pending · {tribes.length} tribes
          </p>
        </div>
        <span className={clsx('text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full flex-shrink-0',
          tier === 'enterprise' ? 'bg-violet-100 text-violet-700' : tier === 'business' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700')}>
          {tier}
        </span>
      </div>

      {/* Tab nav */}
      <div className="grid grid-cols-6 gap-1 bg-gray-100 p-1 rounded-2xl mb-5">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={clsx('relative flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl transition-all',
              activeTab === t.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600')}>
            <span className="text-base leading-none">{t.icon}</span>
            <span className="text-[10px] font-bold leading-none hidden sm:block">{t.label}</span>
            {(badgeCounts[t.id] ?? 0) > 0 && (
              <span className={clsx('absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-black flex items-center justify-center',
                activeTab === t.id ? 'bg-gray-900 text-white' : 'bg-gray-400 text-white')}>
                {badgeCounts[t.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'tipsters'   && <TipstersTab   comp={comp} tipsters={tipsters} setTipsters={setTipsters} invitations={invitations} setInvitations={setInvitations} currentUserId={session?.user.id ?? ''} />}
      {activeTab === 'payments'   && <PaymentsTab   comp={comp} tipsters={tipsters} />}
      {activeTab === 'email'      && <EmailTab      comp={comp} tipsters={tipsters} />}
      {activeTab === 'settings'   && <SettingsTab   comp={comp} tier={tier} domain={domain} minAge={minAge} onUpdate={handleSettingUpdate} />}
      {activeTab === 'tribes'     && <TribesTab     comp={comp} tipsters={tipsters} tribes={tribes} setTribes={setTribes} />}
      {activeTab === 'challenges' && <ChallengesTab comp={comp} />}
    </div>
  )
}
