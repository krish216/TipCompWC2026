'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { Spinner } from '@/components/ui'
import toast from 'react-hot-toast'

interface Comp { id: string; name: string;
 logo_url?: string | null; invite_code?: string }

// ─── Individual menu panels ────────────────────────────────────────────────────

function InviteTipsters({ comp, onClose }: { comp: Comp; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const link = typeof window !== 'undefined'
    ? `${window.location.origin}/login?tab=register&comp=${comp.invite_code}`
    : ''

  const copy = async () => {
    await navigator.clipboard.writeText(link)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
    toast.success('Link copied!')
  }

  return (
    <Panel title="Invite Tipsters" onClose={onClose}>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: '0 0 16px' }}>
        Share this link so players can register and automatically join <strong>{comp?.name}</strong>.
      </p>
      <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', padding: '10px 12px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', wordBreak: 'break-all', marginBottom: 12 }}>
        {link}
      </div>
      <button onClick={copy} style={btnStyle(copied ? 'success' : 'primary')}>
        {copied ? '✓ Copied' : 'Copy invite link'}
      </button>
      <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 'var(--border-radius-md)', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)' }}>
        <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Comp code</p>
        <p style={{ margin: 0, fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 500, letterSpacing: '0.12em', color: 'var(--color-text-primary)' }}>{comp.invite_code}</p>
      </div>
    </Panel>
  )
}

function ManageTipsters({ comp, onClose }: { comp: Comp; onClose: () => void }) {
  const [members, setMembers]   = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [search,  setSearch]    = useState('')

  useEffect(() => {
    fetch(`/api/comp-admins/members?comp_id=${comp.id}`)
      .then(r => r.json())
      .then(d => { setMembers(d.data ?? []); setLoading(false) })
  }, [comp.id])

  const filtered = members.filter(m =>
    m.display_name?.toLowerCase().includes(search.toLowerCase()) ||
    m.email?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Panel title={`Manage Tipsters (${members.length})`} onClose={onClose}>
      <input type="text" value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by name or email…" style={{ marginBottom: 12 }} />
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spinner className="w-6 h-6" /></div>
      ) : filtered.length === 0 ? (
        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--color-text-tertiary)', padding: 24 }}>No members found</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {filtered.map((m: any) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-background-info)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 500, color: 'var(--color-text-info)', flexShrink: 0 }}>
                {(m.display_name || m.email || '?')[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.display_name || '—'}</p>
                <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</p>
              </div>
              {m.tribe_name && (
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)', flexShrink: 0 }}>
                  {m.tribe_name}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

function CompSettings({ comp, onClose, onSaved }: { comp: Comp; onClose: () => void; onSaved: () => void }) {
  const { supabase, session } = useSupabase()
  const [compName, setCompName] = useState(comp.name || '')
  const [saving,   setSaving]   = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [preview,  setPreview]  = useState<string | null>(comp.logo_url || null)
  const fileRef = useRef<HTMLInputElement>(null)

  const save = async () => {
    setSaving(true)
    let logoUrl: string | undefined
    if (logoFile && session?.user.id) {
      const ext  = logoFile.name.split('.').pop()
      const path = `${session.user.id}/logo.${ext}`
      const { data } = await supabase.storage.from('org-logos').upload(path, logoFile, { upsert: true })
      if (data) {
        const { data: url } = supabase.storage.from('org-logos').getPublicUrl(path)
        logoUrl = url.publicUrl
      }
    }
    await fetch('/api/comps/create', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comp_id: comp.id, user_id: session!.user.id, name: compName || null, ...(logoUrl ? { logo_url: logoUrl } : {}) }),
    })
    setSaving(false); toast.success('Settings saved'); onSaved()
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return
    setLogoFile(f)
    const r = new FileReader(); r.onloadend = () => setPreview(r.result as string); r.readAsDataURL(f)
  }

  return (
    <Panel title="Comp Settings" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Display name (shown to players)</label>
          <input value={compName} onChange={e => setCompName(e.target.value)} placeholder={comp.name} />
        </div>
        <div>
          <label style={labelStyle}>Logo</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div onClick={() => fileRef.current?.click()} style={{ width: 48, height: 48, borderRadius: 'var(--border-radius-md)', overflow: 'hidden', border: '0.5px solid var(--color-border-secondary)', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-background-secondary)', fontSize: 20 }}>
              {preview ? <img src={preview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : '🏢'}
            </div>
            <button type="button" onClick={() => fileRef.current?.click()} style={btnStyle('secondary')}>
              {logoFile ? 'Change' : 'Upload logo'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
          </div>
        </div>
        <button onClick={save} disabled={saving} style={btnStyle('primary')}>
          {saving ? <><Spinner className="w-4 h-4" /> Saving…</> : 'Save settings'}
        </button>
      </div>
    </Panel>
  )
}

function Reporting({ comp, onClose }: { comp: Comp; onClose: () => void }) {
  const [stats, setStats] = useState<any>(null)

  useEffect(() => {
    fetch(`/api/comp-admins/members?comp_id=${comp.id}`)
      .then(r => r.json())
      .then(d => {
        const members = d.data ?? []
        const inTribe   = members.filter((m: any) => m.tribe_id).length
        const withPreds = members.filter((m: any) => (m.predictions_made ?? 0) > 0).length
        setStats({ total: members.length, inTribe, withPreds })
      })
  }, [comp.id])

  return (
    <Panel title="Reporting" onClose={onClose}>
      {!stats ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spinner className="w-6 h-6" /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { label: 'Total tipsters', value: stats.total },
            { label: 'In a tribe',     value: stats.inTribe },
            { label: 'Made predictions', value: stats.withPreds },
            { label: 'Not yet predicting', value: stats.total - stats.withPreds },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)' }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{label}</span>
              <span style={{ fontSize: 20, fontWeight: 500, color: 'var(--color-text-primary)' }}>{value}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

function ManagePrizes({ comp, onClose }: { comp: Comp; onClose: () => void }) {
  const [prizes,   setPrizes]   = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [place,    setPlace]    = useState<number>(1)
  const [desc,     setDesc]     = useState('')
  const [saving,   setSaving]   = useState(false)

  const load = () => {
    fetch(`/api/comp-prizes?comp_id=${comp.id}`)
      .then(r => r.json())
      .then(d => { setPrizes(d.data ?? []); setLoading(false) })
  }
  useEffect(() => { load() }, [comp.id])

  const add = async () => {
    if (!desc.trim()) return
    setSaving(true)
    await fetch('/api/comp-prizes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comp_id: comp.id, place, description: desc.trim() }),
    })
    setDesc(''); setSaving(false); load(); toast.success('Prize saved')
  }

  const remove = async (p: number) => {
    await fetch(`/api/comp-prizes?comp_id=${comp.id}&place=${p}`, { method: 'DELETE' })
    load()
  }

  const MEDALS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣']

  return (
    <Panel title="Manage Prizes" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}><Spinner className="w-5 h-5" /></div>
          : prizes.length === 0
          ? <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: 16 }}>No prizes set yet</p>
          : prizes.map((p: any) => (
            <div key={p.place} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)' }}>
              <span style={{ fontSize: 18 }}>{MEDALS[p.place - 1] ?? `${p.place}.`}</span>
              <span style={{ flex: 1, fontSize: 13, color: 'var(--color-text-primary)' }}>{p.description}</span>
              <button onClick={() => remove(p.place)} style={{ fontSize: 12, color: 'var(--color-text-danger)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>Remove</button>
            </div>
          ))
        }
        <div style={{ borderTop: '0.5px solid var(--color-border-tertiary)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={place} onChange={e => setPlace(Number(e.target.value))} style={{ width: 80 }}>
              {[1,2,3,4,5].map(n => <option key={n} value={n}>{MEDALS[n-1]} {n}{n===1?'st':n===2?'nd':n===3?'rd':'th'}</option>)}
            </select>
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Prize description" style={{ flex: 1 }} onKeyDown={e => e.key === 'Enter' && add()} />
          </div>
          <button onClick={add} disabled={saving || !desc.trim()} style={btnStyle('primary')}>
            {saving ? <Spinner className="w-4 h-4" /> : 'Add prize'}
          </button>
        </div>
      </div>
    </Panel>
  )
}

function EmailTipsters({ comp, onClose }: { comp: Comp; onClose: () => void }) {
  const [subject, setSubject] = useState('')
  const [body,    setBody]    = useState('')
  const [sending, setSending] = useState(false)
  const [sent,    setSent]    = useState(false)

  const send = async () => {
    if (!subject.trim() || !body.trim()) return
    setSending(true)
    const res = await fetch('/api/comp-announcements', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comp_id: comp.id, title: subject.trim(), body: body.trim(), send_email: true }),
    })
    setSending(false)
    if (res.ok) { setSent(true); toast.success('Message sent to all tipsters') }
    else toast.error('Failed to send')
  }

  return (
    <Panel title="Email All Tipsters" onClose={onClose}>
      {sent ? (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <p style={{ fontSize: 32, margin: '0 0 8px' }}>✅</p>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>Message sent!</p>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>All tipsters in {comp?.name} have been notified.</p>
          <button onClick={() => { setSent(false); setSubject(''); setBody('') }} style={{ ...btnStyle('secondary'), marginTop: 16 }}>Send another</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>Send an email to all tipsters in your comp.</p>
          <div>
            <label style={labelStyle}>Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Matchday reminder" />
          </div>
          <div>
            <label style={labelStyle}>Message</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Your message…" rows={5}
              style={{ width: '100%', resize: 'vertical', fontFamily: 'var(--font-sans)', fontSize: 14, padding: '8px 12px', border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-md)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', boxSizing: 'border-box' }} />
          </div>
          <button onClick={send} disabled={sending || !subject.trim() || !body.trim()} style={btnStyle('primary')}>
            {sending ? <><Spinner className="w-4 h-4" /> Sending…</> : 'Send to all tipsters'}
          </button>
        </div>
      )}
    </Panel>
  )
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '0.5px solid var(--color-border-tertiary)', flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--color-text-secondary)', lineHeight: 1, padding: 0 }}>←</button>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500, color: 'var(--color-text-primary)' }}>{title}</h2>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {children}
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }

function btnStyle(variant: 'primary' | 'secondary' | 'success'): React.CSSProperties {
  const base: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '11px 0', border: 'none', borderRadius: 'var(--border-radius-lg)', fontSize: 14, fontWeight: 500, cursor: 'pointer' }
  if (variant === 'primary')   return { ...base, background: 'var(--color-text-primary)', color: 'var(--color-background-primary)' }
  if (variant === 'success')   return { ...base, background: 'var(--color-background-success)', color: 'var(--color-text-success)' }
  return { ...base, background: 'var(--color-background-secondary)', color: 'var(--color-text-primary)', border: '0.5px solid var(--color-border-secondary)' }
}

// ─── MAIN MENU ───────────────────────────────────────────────────────────────

type MenuItem = 'invite' | 'members' | 'settings' | 'reporting' | 'prizes' | 'email'

const MENU_ITEMS: { id: MenuItem; icon: string; label: string }[] = [
  { id: 'invite',    icon: '👤+',  label: 'Invite Tipsters'  },
  { id: 'members',   icon: '👥',   label: 'Manage Tipsters'  },
  { id: 'settings',  icon: '⚙️',   label: 'Comp Settings'    },
  { id: 'reporting', icon: '📊',   label: 'Reporting'        },
  { id: 'prizes',    icon: '🏆',   label: 'Manage Prizes'    },
  { id: 'email',     icon: '✉️',   label: 'Email All Tipsters'},
]

export function CompAdminMenu({ adminComps }: { adminComps?: Comp[] }) {
  const { supabase, session } = useSupabase()
  const [open,         setOpen]         = useState(false)
  const [activePanel,  setActivePanel]  = useState<MenuItem | null>(null)
  const [myComps,      setMyComps]      = useState<Comp[]>(adminComps ?? [])
  const [selectedComp, setSelectedComp] = useState<Comp | null>(adminComps?.[0] ?? null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Sync when adminComps prop changes (context updates after load)
  useEffect(() => {
    if (adminComps?.length) {
      setMyComps(adminComps)
      setSelectedComp(c => c ?? adminComps[0] ?? null)
    }
  }, [adminComps])

  // Rendered conditionally by Navbar only when isCompAdmin=true — no internal gate needed

  const comp = selectedComp

  return (
    <>
      {/* Manage button */}
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors text-blue-600 hover:text-blue-700 hover:bg-blue-50"
        aria-label="Manage comp">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" fill="currentColor"/>
          <path fillRule="evenodd" clipRule="evenodd" d="M5.612 1.223a.75.75 0 0 1 .734-.596h1.308a.75.75 0 0 1 .734.596l.17.859a4.02 4.02 0 0 1 .748.435l.824-.29a.75.75 0 0 1 .905.317l.654 1.133a.75.75 0 0 1-.15.937l-.642.568a4.08 4.08 0 0 1 0 .836l.642.568a.75.75 0 0 1 .15.937l-.654 1.133a.75.75 0 0 1-.905.318l-.824-.29a4.02 4.02 0 0 1-.748.434l-.17.86a.75.75 0 0 1-.734.596H6.346a.75.75 0 0 1-.734-.596l-.17-.86a4.02 4.02 0 0 1-.748-.434l-.824.29a.75.75 0 0 1-.905-.318L2.311 8.323a.75.75 0 0 1 .15-.937l.642-.568a4.08 4.08 0 0 1 0-.836l-.642-.568a.75.75 0 0 1-.15-.937l.654-1.133a.75.75 0 0 1 .905-.318l.824.29a4.02 4.02 0 0 1 .748-.434l.17-.86ZM7 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" fill="currentColor"/>
        </svg>
        Manage
      </button>

      {/* Overlay backdrop */}
      {open && (
        <div
          ref={overlayRef}
          onClick={e => { if (e.target === overlayRef.current) { setOpen(false); setActivePanel(null) } }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}>

          {/* Drawer */}
          <div style={{
            width: 'min(340px, 100vw)', height: '100%',
            background: 'var(--color-background-primary)',
            display: 'flex', flexDirection: 'column',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
          }}>
            {activePanel && comp ? (
              // ── Sub-panel ──
              <>
                {activePanel === 'invite'    && <InviteTipsters  comp={comp} onClose={() => setActivePanel(null)} />}
                {activePanel === 'members'   && <ManageTipsters  comp={comp} onClose={() => setActivePanel(null)} />}
                {activePanel === 'settings'  && <CompSettings    comp={comp} onClose={() => setActivePanel(null)} onSaved={() => { setActivePanel(null) }} />}
                {activePanel === 'reporting' && <Reporting       comp={comp} onClose={() => setActivePanel(null)} />}
                {activePanel === 'prizes'    && <ManagePrizes    comp={comp} onClose={() => setActivePanel(null)} />}
                {activePanel === 'email'     && <EmailTipsters   comp={comp} onClose={() => setActivePanel(null)} />}
              </>
            ) : (
              // ── Main menu ──
              <>
                {/* Header */}
                <div style={{ padding: '16px 20px', borderBottom: '0.5px solid var(--color-border-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {comp?.logo_url
                      ? <img src={comp.logo_url} alt={comp.name} style={{ width: 32, height: 32, borderRadius: 'var(--border-radius-md)', objectFit: 'cover' }} />
                      : <div style={{ width: 32, height: 32, borderRadius: 'var(--border-radius-md)', background: 'var(--color-background-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🏢</div>
                    }
                    <div>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{comp?.name || 'Comp Admin'}</p>
                      <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-tertiary)' }}>Comp management</p>
                    </div>
                  </div>
                  <button onClick={() => { setOpen(false); setActivePanel(null) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--color-text-secondary)', padding: '4px 8px' }}>✕</button>
                </div>

                {/* Comp switcher (if admin of multiple) */}
                {myComps.length > 1 && (
                  <div style={{ padding: '10px 20px', borderBottom: '0.5px solid var(--color-border-tertiary)', display: 'flex', gap: 8, overflowX: 'auto' }}>
                    {myComps.map(c => (
                      <button key={c.id} onClick={() => setSelectedComp(c)} style={{
                        padding: '5px 12px', borderRadius: 99, fontSize: 12, fontWeight: 500, cursor: 'pointer', flexShrink: 0,
                        border: selectedComp?.id === c.id ? '1.5px solid var(--color-border-success)' : '0.5px solid var(--color-border-secondary)',
                        background: selectedComp?.id === c.id ? 'var(--color-background-success)' : 'transparent',
                        color: selectedComp?.id === c.id ? 'var(--color-text-success)' : 'var(--color-text-secondary)',
                      }}>
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}

                {/* Section label */}
                <div style={{ padding: '12px 20px 6px', flexShrink: 0 }}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Comp Management</p>
                </div>

                {/* Menu items */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {MENU_ITEMS.map(item => (
                    <button key={item.id} onClick={() => setActivePanel(item.id)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                        padding: '15px 20px', background: 'none', border: 'none',
                        borderBottom: '0.5px solid var(--color-border-tertiary)',
                        cursor: 'pointer', textAlign: 'left',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-background-secondary)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                      <span style={{ fontSize: 20, width: 28, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', flex: 1 }}>{item.label}</span>
                      <span style={{ fontSize: 16, color: 'var(--color-text-tertiary)' }}>›</span>
                    </button>
                  ))}
                </div>

                {/* Footer */}
                <div style={{ padding: '12px 20px', borderTop: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-secondary)', flexShrink: 0 }}>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                    Logged in as <span style={{ color: 'var(--color-text-success)', fontWeight: 500 }}>
                      {session?.user?.user_metadata?.display_name ?? session?.user?.email ?? ''}
                    </span>
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
