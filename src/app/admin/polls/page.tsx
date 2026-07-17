'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Spinner, Card } from '@/components/ui'
import { useSupabase } from '@/components/layout/SupabaseProvider'

interface AdminPoll {
  id: string; topic: string; question: string; description: string | null; options: string[]
  audience: string; comp_id: string | null; active: boolean; ends_at: string | null; created_at: string
  tallies: number[]; total: number
}
interface CompLite { id: string; name: string }

const TOPICS = ['football', 'feedback', 'codesign', 'general']

export default function PollsAdminPage() {
  const { session, supabase } = useSupabase()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [polls, setPolls] = useState<AdminPoll[]>([])
  const [comps, setComps] = useState<CompLite[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session) { setIsAdmin(false); return }
    fetch('/api/admin').then(r => r.json()).then(d => setIsAdmin(!!d.is_admin)).catch(() => setIsAdmin(false))
  }, [session])

  // Comps list for the comp-scoped audience picker (comps are public-read).
  useEffect(() => {
    if (!isAdmin) return
    ;(supabase.from('comps') as any).select('id, name').order('name').then(({ data }: any) => setComps(data ?? []))
  }, [isAdmin, supabase])

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/admin/polls').then(r => r.json())
      .then(d => setPolls(Array.isArray(d?.polls) ? d.polls : []))
      .catch(() => toast.error('Failed to load polls'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { if (isAdmin) load() }, [isAdmin, load])

  if (isAdmin === null) return <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
  if (!isAdmin) return <div className="max-w-md mx-auto py-20 text-center text-gray-500">Admin access required.</div>

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link href="/admin" className="text-sm text-emerald-600 hover:underline">← Admin home</Link>
          <h1 className="text-2xl font-extrabold text-gray-900 mt-1">Polls</h1>
          <p className="text-sm text-gray-500">Ask signed-in users a quick question on the homepage — football or product feedback.</p>
        </div>
      </div>

      <NewPollForm onCreated={load} comps={comps} />

      {loading ? (
        <div className="flex justify-center py-12"><Spinner className="w-7 h-7" /></div>
      ) : polls.length === 0 ? (
        <Card><p className="text-center text-gray-400 py-8 text-sm">No polls yet — create one above.</p></Card>
      ) : (
        <div className="space-y-2.5">{polls.map(p => <PollRow key={p.id} poll={p} comps={comps} onChanged={load} />)}</div>
      )}
    </div>
  )
}

function NewPollForm({ onCreated, comps }: { onCreated: () => void; comps: CompLite[] }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [question, setQuestion] = useState('')
  const [description, setDescription] = useState('')
  const [options, setOptions] = useState<string[]>(['', ''])
  const [topic, setTopic] = useState('football')
  const [audience, setAudience] = useState<'all' | 'tournament' | 'comp'>('all')
  const [compId, setCompId] = useState('')

  const reset = () => { setQuestion(''); setDescription(''); setOptions(['', '']); setTopic('football'); setAudience('all'); setCompId(''); setOpen(false) }

  const create = async () => {
    const opts = options.map(o => o.trim()).filter(Boolean)
    if (!question.trim()) { toast.error('Question required'); return }
    if (opts.length < 2) { toast.error('Add at least two options'); return }
    if (audience === 'comp' && !compId) { toast.error('Pick a comp'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/admin/polls', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim(), description: description.trim() || null, options: opts, topic, audience, comp_id: audience === 'comp' ? compId : null }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error ?? 'Failed to create'); return }
      toast.success('Poll created')
      reset(); onCreated()
    } catch { toast.error('Network error') } finally { setBusy(false) }
  }

  if (!open) return (
    <button onClick={() => setOpen(true)} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700">+ New poll</button>
  )

  return (
    <Card className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Question *</label>
        <input value={question} onChange={e => setQuestion(e.target.value)} placeholder="e.g. Who wins Australia v Egypt?"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Description <span className="font-normal text-gray-400">(optional — shown under the question; links are clickable)</span></label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
          placeholder="e.g. Check out https://tribepicks.com/match/mt-ausegypt — scores hidden until kick-off. N.B. Challenges don't count towards the WC2026 Scoreboard."
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none resize-y" />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Options *</label>
        <div className="space-y-2">
          {options.map((o, i) => (
            <div key={i} className="flex gap-2">
              <input value={o} onChange={e => setOptions(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                placeholder={`Option ${i + 1}`} className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
              {options.length > 2 && (
                <button onClick={() => setOptions(prev => prev.filter((_, j) => j !== i))} className="px-2 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 text-sm">✕</button>
              )}
            </div>
          ))}
        </div>
        <button onClick={() => setOptions(prev => [...prev, ''])} className="mt-2 text-xs font-semibold text-emerald-600 hover:underline">+ Add option</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Topic</label>
          <select value={topic} onChange={e => setTopic(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none">
            {TOPICS.map(t => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Audience</label>
          <select value={audience} onChange={e => setAudience(e.target.value as any)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none">
            <option value="all">Everyone (signed-in)</option>
            <option value="tournament">This tournament only</option>
            <option value="comp">A specific comp</option>
          </select>
        </div>
      </div>

      {audience === 'comp' && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Comp *</label>
          <select value={compId} onChange={e => setCompId(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none">
            <option value="">Select a comp…</option>
            {comps.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      <div className="flex gap-2">
        <button disabled={busy} onClick={create} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
          {busy ? 'Creating…' : 'Create poll'}
        </button>
        <button onClick={reset} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium">Cancel</button>
      </div>
    </Card>
  )
}

function PollRow({ poll, comps, onChanged }: { poll: AdminPoll; comps: CompLite[]; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [q, setQ]       = useState(poll.question)
  const [desc, setDesc] = useState(poll.description ?? '')
  const [opts, setOpts] = useState<string[]>(poll.options)
  const [topic, setTopic]       = useState(poll.topic)
  const [audience, setAudience] = useState<'all' | 'tournament' | 'comp'>(
    poll.audience === 'tournament' ? 'tournament' : poll.audience === 'comp' ? 'comp' : 'all')
  const [compId, setCompId]     = useState(poll.comp_id ?? '')
  const compName = comps.find(c => c.id === poll.comp_id)?.name
  const optionsLocked = poll.total > 0
  const pct = (n: number) => (poll.total ? Math.round((n / poll.total) * 100) : 0)

  const patch = async (body: any, ok: string): Promise<boolean> => {
    setBusy(true)
    const res = await fetch(`/api/admin/polls/${poll.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (res.ok) { toast.success(ok); onChanged(); return true }
    toast.error(d.error ?? 'Update failed'); return false
  }

  const saveEdit = async () => {
    const cleanOpts = opts.map(o => o.trim()).filter(Boolean)
    if (!q.trim()) { toast.error('Question required'); return }
    if (!optionsLocked && cleanOpts.length < 2) { toast.error('Add at least two options'); return }
    if (audience === 'comp' && !compId) { toast.error('Pick a comp'); return }
    const body: any = { question: q.trim(), description: desc.trim() || null, topic, audience }
    if (audience === 'comp') body.comp_id = compId
    if (!optionsLocked) body.options = cleanOpts
    if (await patch(body, 'Poll updated')) setEditing(false)
  }
  const remove = async () => {
    if (!confirm(`Delete this poll? Its ${poll.total} vote${poll.total === 1 ? '' : 's'} will be removed.`)) return
    const res = await fetch(`/api/admin/polls/${poll.id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Poll deleted'); onChanged() } else toast.error('Delete failed')
  }

  return (
    <Card className="space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">{poll.topic}</span>
            {!poll.active && <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">closed</span>}
            {poll.audience === 'tournament' && <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">tournament</span>}
            {poll.audience === 'comp' && <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">🏢 {compName ?? 'comp'}</span>}
          </div>
          <p className="font-semibold text-gray-900 mt-1">{poll.question}</p>
        </div>
        <span className="text-xs text-gray-400 flex-shrink-0">{poll.total} vote{poll.total === 1 ? '' : 's'}</span>
      </div>

      <div className="space-y-1.5">
        {poll.options.map((opt, i) => (
          <div key={i} className="relative rounded-lg border border-gray-100 bg-gray-50 overflow-hidden">
            <span className="absolute inset-y-0 left-0 bg-violet-200/60" style={{ width: `${pct(poll.tallies[i] ?? 0)}%` }} aria-hidden />
            <div className="relative flex items-center justify-between px-3 py-1.5 text-sm">
              <span className="text-gray-700 truncate">{opt}</span>
              <span className="text-xs font-bold text-violet-700 tabular-nums flex-shrink-0">{pct(poll.tallies[i] ?? 0)}% · {poll.tallies[i] ?? 0}</span>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="space-y-2.5 border-t border-gray-100 pt-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Question</label>
            <input value={q} onChange={e => setQ(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Description <span className="font-normal text-gray-400">(links clickable)</span></label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none resize-y" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Options {optionsLocked && <span className="font-normal text-amber-600">· locked ({poll.total} vote{poll.total === 1 ? '' : 's'} cast)</span>}</label>
            <div className="space-y-2">
              {opts.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <input value={o} disabled={optionsLocked} onChange={e => setOpts(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400" />
                  {!optionsLocked && opts.length > 2 && <button onClick={() => setOpts(prev => prev.filter((_, j) => j !== i))} className="px-2 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 text-sm">✕</button>}
                </div>
              ))}
            </div>
            {!optionsLocked && <button onClick={() => setOpts(prev => [...prev, ''])} className="mt-2 text-xs font-semibold text-emerald-600 hover:underline">+ Add option</button>}
            {optionsLocked && <p className="text-[11px] text-gray-400 mt-1">Options can’t change once voting starts (votes are tied to positions). Delete &amp; recreate to change them.</p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Topic</label>
              <select value={topic} onChange={e => setTopic(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none">
                {TOPICS.map(t => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Audience</label>
              <select value={audience} onChange={e => setAudience(e.target.value as any)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none">
                <option value="all">Everyone (signed-in)</option>
                <option value="tournament">This tournament only</option>
                <option value="comp">A specific comp</option>
              </select>
            </div>
          </div>
          {audience === 'comp' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Comp *</label>
              <select value={compId} onChange={e => setCompId(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none">
                <option value="">Select a comp…</option>
                {comps.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <button disabled={busy} onClick={saveEdit} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">{busy ? 'Saving…' : 'Save changes'}</button>
            <button onClick={() => { setEditing(false); setQ(poll.question); setDesc(poll.description ?? ''); setOpts(poll.options); setTopic(poll.topic); setAudience(poll.audience === 'tournament' ? 'tournament' : poll.audience === 'comp' ? 'comp' : 'all'); setCompId(poll.comp_id ?? '') }} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button onClick={() => setEditing(v => !v)} className="px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 text-xs font-medium hover:bg-violet-100">{editing ? 'Close editor' : 'Edit'}</button>
        <button disabled={busy} onClick={() => patch({ active: !poll.active }, poll.active ? 'Closed' : 'Reopened')}
          className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium', poll.active ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100')}>
          {poll.active ? 'Close poll' : 'Reopen'}
        </button>
        <button onClick={remove} className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 ml-auto">Delete</button>
      </div>
    </Card>
  )
}
