'use client'

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { Avatar, Medal, Spinner, EmptyState, Card } from '@/components/ui'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import toast from 'react-hot-toast'
import type { RoundId } from '@/types'
import { formatKickoff } from '@/lib/timezone'
import { useTimezone } from '@/hooks/useTimezone'
import { SCORING } from '@/types'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Member {
  user_id: string
  display_name: string
  avatar_url?: string | null
  total_points: number
  exact_count: number
  correct_count: number
  joined_at: string
}

interface TribeData {
  id: string
  name: string
  invite_code: string
  created_by: string
  members: Member[]
}

interface Message {
  id: string
  user_id: string
  content: string
  created_at: string
  fixture_id?: number | null
  user: { display_name: string; avatar_url?: string | null }
}

interface Fixture {
  id: number
  round: RoundId
  group?: string
  home: string
  away: string
  kickoff_utc: string
  venue: string
  result?: { home: number; away: number } | null
}

const FLAGS: Record<string, string> = {
  Algeria:'🇩🇿', Argentina:'🇦🇷', Australia:'🇦🇺', Austria:'🇦🇹',
  Belgium:'🇧🇪', 'Bosnia and Herzegovina':'🇧🇦', Brazil:'🇧🇷',
  Canada:'🇨🇦', 'Cape Verde':'🇨🇻', Colombia:'🇨🇴', Croatia:'🇭🇷',
  Curacao:'🏝️', Czechia:'🇨🇿', 'DR Congo':'🇨🇩',
  Ecuador:'🇪🇨', Egypt:'🇪🇬', England:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', France:'🇫🇷',
  Germany:'🇩🇪', Ghana:'🇬🇭', Haiti:'🇭🇹', Iran:'🇮🇷',
  Iraq:'🇮🇶', 'Ivory Coast':'🇨🇮', Japan:'🇯🇵', Jordan:'🇯🇴',
  Mexico:'🇲🇽', Morocco:'🇲🇦', Netherlands:'🇳🇱', 'New Zealand':'🇳🇿',
  Norway:'🇳🇴', Panama:'🇵🇦', Paraguay:'🇵🇾', Portugal:'🇵🇹',
  Qatar:'🇶🇦', 'Saudi Arabia':'🇸🇦', Scotland:'🏴󠁧󠁢󠁳󠁣󠁴󠁿', Senegal:'🇸🇳',
  'South Africa':'🇿🇦', 'South Korea':'🇰🇷', Spain:'🇪🇸', Sweden:'🇸🇪',
  Switzerland:'🇨🇭', Tunisia:'🇹🇳', Turkey:'🇹🇷', Uruguay:'🇺🇾',
  USA:'🇺🇸', Uzbekistan:'🇺🇿',
}
const flag = (t: string) => FLAGS[t] ?? '🏳️'

type MainTab   = 'leaderboard' | 'picks' | 'chat'
type ChatTopic = 'general' | number   // number = fixture_id

// ── Chat bubble ───────────────────────────────────────────────────────────────
function ChatBubble({ msg, myId }: { msg: Message; myId: string }) {
  const isMe        = msg.user_id === myId
  const displayName = msg.user?.display_name ?? 'Unknown'
  const time        = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className={clsx('flex gap-2 items-end', isMe && 'flex-row-reverse')}>
      {!isMe && <Avatar name={displayName} size="xs" className="flex-shrink-0 mb-0.5" />}
      <div className={clsx('max-w-[75%]', isMe && 'items-end flex flex-col')}>
        {!isMe && <p className="text-[10px] text-gray-400 mb-0.5 ml-1">{displayName}</p>}
        <div className={clsx(
          'px-3 py-2 rounded-xl text-sm leading-relaxed',
          isMe ? 'bg-green-600 text-white rounded-br-sm' : 'bg-gray-100 text-gray-900 rounded-bl-sm'
        )}>
          {msg.content}
        </div>
        <p className="text-[9px] text-gray-400 mt-0.5 mx-1">{time}</p>
      </div>
    </div>
  )
}

// ── Match topic selector ──────────────────────────────────────────────────────
function MatchTopicList({
  fixtures,
  activeTopic,
  onSelect,
  timezone,
}: {
  fixtures: Fixture[]
  activeTopic: ChatTopic
  onSelect: (topic: ChatTopic) => void
  timezone: string
}) {
  const now = new Date()

  // Group fixtures: recent (past 3 days) + upcoming (next 3 days) shown first
  const recent   = fixtures.filter(f => {
    const diff = (now.getTime() - new Date(f.kickoff_utc).getTime()) / 86400000
    return diff >= 0 && diff <= 5
  })
  const upcoming = fixtures.filter(f => {
    const diff = (new Date(f.kickoff_utc).getTime() - now.getTime()) / 86400000
    return diff > 0 && diff <= 3
  })
  const featured = [...new Map([...upcoming, ...recent].map(f => [f.id, f])).values()]
    .sort((a, b) => new Date(a.kickoff_utc).getTime() - new Date(b.kickoff_utc).getTime())
    .slice(0, 12)

  return (
    <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      {/* General chat */}
      <button
        onClick={() => onSelect('general')}
        className={clsx(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
          activeTopic === 'general'
            ? 'bg-green-600 text-white'
            : 'bg-white border border-gray-200 hover:bg-gray-50 text-gray-900'
        )}
      >
        <span className="text-base flex-shrink-0">💬</span>
        <div>
          <p className="text-xs font-semibold">General</p>
          <p className={clsx('text-[10px]', activeTopic === 'general' ? 'text-green-100' : 'text-gray-400')}>
            Tribe chat
          </p>
        </div>
      </button>

      {/* Section: Featured matches */}
      {featured.length > 0 && (
        <>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mt-3 mb-1 px-1">
            Recent &amp; upcoming
          </p>
          {featured.map(f => {
            const isActive  = activeTopic === f.id
            const kickoff   = new Date(f.kickoff_utc)
            const started   = kickoff <= now
            const kickoffLabel = formatKickoff(f.kickoff_utc, timezone)

            return (
              <button
                key={f.id}
                onClick={() => onSelect(f.id)}
                className={clsx(
                  'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors',
                  isActive
                    ? 'bg-green-600 text-white'
                    : 'bg-white border border-gray-200 hover:bg-gray-50'
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className={clsx('text-xs font-semibold truncate', !isActive && 'text-gray-900')}>
                    {flag(f.home)} {f.home} <span className={clsx('font-normal', isActive ? 'text-green-200' : 'text-gray-400')}>vs</span> {flag(f.away)} {f.away}
                  </p>
                  <p className={clsx('text-[10px] mt-0.5', isActive ? 'text-green-100' : 'text-gray-400')}>
                    {f.result
                      ? `FT: ${f.result.home}–${f.result.away}`
                      : started ? 'In progress' : kickoffLabel}
                  </p>
                </div>
                {f.result && (
                  <span className={clsx('text-[10px] font-bold flex-shrink-0', isActive ? 'text-green-100' : 'text-green-700')}>
                    FT
                  </span>
                )}
              </button>
            )
          })}
        </>
      )}

      {/* All matches by round */}
      {(['gs','r32','r16','qf','sf','tp','f'] as RoundId[]).map(round => {
        const roundFixtures = fixtures.filter(f => f.round === round)
        if (!roundFixtures.length) return null
        return (
          <div key={round}>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mt-3 mb-1 px-1">
              {SCORING[round].label}
            </p>
            {roundFixtures.map(f => {
              const isActive    = activeTopic === f.id
              const localDate   = formatKickoff(f.kickoff_utc, timezone)
              return (
                <button
                  key={f.id}
                  onClick={() => onSelect(f.id)}
                  className={clsx(
                    'flex items-start gap-2.5 px-3 py-2 rounded-lg text-left transition-colors mb-0.5 w-full',
                    isActive ? 'bg-green-600 text-white' : 'hover:bg-gray-50 text-gray-600'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className={clsx('text-xs truncate font-medium', isActive ? 'text-white' : 'text-gray-800')}>
                      {flag(f.home)} {f.home} vs {flag(f.away)} {f.away}
                    </p>
                    <p className={clsx('text-[10px] mt-0.5', isActive ? 'text-green-100' : 'text-gray-400')}>
                      {f.result ? `FT: ${f.result.home}–${f.result.away}` : localDate}
                    </p>
                  </div>
                  {f.result && (
                    <span className={clsx('text-[10px] font-bold flex-shrink-0 mt-0.5', isActive ? 'text-green-100' : 'text-green-600')}>
                      FT
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ── Chat panel ────────────────────────────────────────────────────────────────
function ChatPanel({
  tribeId,
  topic,
  myId,
  fixtures,
  timezone,
}: {
  tribeId: string
  topic: ChatTopic
  myId: string
  fixtures: Fixture[]
  timezone: string
}) {
  const { supabase } = useSupabase()
  const [messages,  setMessages]  = useState<Message[]>([])
  const [loading,   setLoading]   = useState(true)
  const [msgInput,  setMsgInput]  = useState('')
  const [sending,   setSending]   = useState(false)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const fixture = typeof topic === 'number'
    ? fixtures.find(f => f.id === topic)
    : null

  // ── Load messages for this topic ──────────────────────────────
  useEffect(() => {
    setMessages([])
    setLoading(true)
    const url = `/api/chat?tribe_id=${tribeId}&fixture_id=${topic}&limit=60`
    fetch(url)
      .then(r => r.json())
      .then(({ data }) => {
        setMessages(data ?? [])
        setLoading(false)
        scrollToBottom(false)
      })
      .catch(() => setLoading(false))
  }, [tribeId, topic])

  // ── Realtime subscription scoped to this topic ────────────────
  useEffect(() => {
    const channelName = `chat-${tribeId}-${topic}`
    const filter = typeof topic === 'number'
      ? `tribe_id=eq.${tribeId}`
      : `tribe_id=eq.${tribeId}`

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages',
        filter,
      }, async payload => {
        const newMsg = payload.new as any

        // Only show if it matches the current topic
        const matchesTopic = typeof topic === 'number'
          ? newMsg.fixture_id === topic
          : newMsg.fixture_id === null

        if (!matchesTopic) return

        // Fetch with user join
        const { data } = await supabase
          .from('chat_messages')
          .select('id, content, created_at, user_id, fixture_id, users(display_name, avatar_url)')
          .eq('id', newMsg.id)
          .single()

        if (data) {
          const raw = data as any
          const usr = Array.isArray(raw.users) ? raw.users[0] : raw.users
          setMessages(prev => [...prev, { ...raw, user: usr ?? { display_name: 'Unknown', avatar_url: null } }])
          scrollToBottom(true)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase, tribeId, topic])

  const scrollToBottom = (smooth = true) => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' }), 60)
  }

  const sendMessage = async () => {
    if (!msgInput.trim()) return
    setSending(true)
    await supabase.from('chat_messages').insert({
      tribe_id:   tribeId,
      user_id:    myId,
      content:    msgInput.trim(),
      fixture_id: typeof topic === 'number' ? topic : null,
    })
    setMsgInput('')
    setSending(false)
    textareaRef.current?.focus()
  }

  // Topic header
  const topicLabel = fixture
    ? `${flag(fixture.home)} ${fixture.home} vs ${flag(fixture.away)} ${fixture.away}`
    : '💬 General chat'
  const topicSub = fixture
    ? fixture.result
        ? `Full time: ${fixture.result.home}–${fixture.result.away}`
        : formatKickoff(fixture.kickoff_utc, timezone)
    : 'Tribe-wide conversation'

  return (
    <div className="flex flex-col h-full">
      {/* Topic header */}
      <div className="px-3 py-2.5 border-b border-gray-100 bg-gray-50 rounded-t-xl">
        <p className="text-sm font-semibold text-gray-900">{topicLabel}</p>
        <p className="text-[11px] text-gray-500 mt-0.5">{topicSub}</p>
        {fixture && !fixture.result && (
          <p className="text-[10px] text-green-700 mt-0.5 font-medium">
            🕐 {formatKickoff(fixture.kickoff_utc, timezone)} your time
          </p>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">
        {loading ? (
          <div className="flex justify-center py-8"><Spinner className="w-5 h-5" /></div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <p className="text-sm text-gray-400">No messages yet</p>
            <p className="text-xs text-gray-300 mt-1">
              {fixture ? 'Start the match chat!' : 'Say something to your tribe!'}
            </p>
          </div>
        ) : (
          messages.map(msg => <ChatBubble key={msg.id} msg={msg} myId={myId} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 pb-3 pt-2 border-t border-gray-100">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={msgInput}
            onChange={e => setMsgInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            placeholder={fixture ? `Chat about ${fixture.home} vs ${fixture.away}…` : 'Message your tribe…'}
            rows={1}
            maxLength={1000}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
            style={{ minHeight: '40px', maxHeight: '100px' }}
          />
          <button
            onClick={sendMessage}
            disabled={sending || !msgInput.trim()}
            className="w-10 h-10 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white flex items-center justify-center transition-colors flex-shrink-0"
          >
            {sending ? <Spinner className="w-4 h-4 text-white" /> : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            )}
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-1">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  )
}

// ── No tribe panel ────────────────────────────────────────────────────────────
// ── Announcements feed (shown to PUBLIC org members) ─────────────────────────
function AnnouncementsFeed() {
  const [announcements, setAnnouncements] = useState<any[]>([])

  useEffect(() => {
    fetch('/api/announcements').then(r => r.json()).then(d => setAnnouncements(d.data ?? []))
  }, [])

  if (announcements.length === 0) return null
  return (
    <div className="mb-5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">📢 Comp announcements</p>
      <div className="space-y-2">
        {announcements.map((a: any) => {
          const orgRaw = a.comps
          const org    = Array.isArray(orgRaw) ? orgRaw[0] : orgRaw
          return (
            <div key={a.id} className="bg-white border border-blue-200 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                {org?.logo_url && <img src={org.logo_url} alt={org.name} className="w-5 h-5 rounded object-cover" />}
                <p className="text-[11px] font-medium text-blue-700">{org?.name ?? 'Comp'}</p>
              </div>
              <p className="text-xs font-semibold text-gray-900">{a.title}</p>
              <p className="text-xs text-gray-600 mt-0.5">{a.body}</p>
              <p className="text-[10px] text-gray-400 mt-1">{new Date(a.created_at).toLocaleDateString()}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Tribe dropdown with member count ─────────────────────────────────────────
// ── Tribe Dropdown ────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// TribeCard — single selectable tribe in the picker
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// TribeCard
// ─────────────────────────────────────────────────────────────────────────────
function TribeCard({ tribe, selected, onSelect }: {
  tribe: { id:string; name:string; description?:string|null; invite_code:string; member_count?:number }
  selected: boolean
  onSelect: () => void
}) {
  const count = tribe.member_count ?? 0
  return (
    <button type="button" onClick={onSelect} style={{
      width:'100%', textAlign:'left', padding:'12px 14px',
      borderRadius:'var(--border-radius-lg)',
      border: selected ? '2px solid var(--color-border-success)' : '1.5px solid var(--color-border-tertiary)',
      background: selected ? 'var(--color-background-success)' : 'var(--color-background-primary)',
      display:'flex', alignItems:'center', gap:12,
      cursor:'pointer', transition:'border-color 0.15s, background 0.15s',
    }}>
      <div style={{
        width:18, height:18, borderRadius:'50%', flexShrink:0,
        border: selected ? '5px solid var(--color-border-success)' : '1.5px solid var(--color-border-secondary)',
        background:'var(--color-background-primary)', transition:'border 0.15s',
      }}/>
      <div style={{flex:1, minWidth:0}}>
        <p style={{margin:0, fontSize:14, fontWeight:500, color:'var(--color-text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
          {tribe.name}
        </p>
        {tribe.description && (
          <p style={{margin:'2px 0 0', fontSize:12, color:'var(--color-text-secondary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
            {tribe.description}
          </p>
        )}
      </div>
      <div style={{
        flexShrink:0, fontSize:12, fontWeight:500,
        padding:'3px 10px', borderRadius:99,
        background: selected ? 'var(--color-background-primary)' : 'var(--color-background-secondary)',
        color: selected ? 'var(--color-text-success)' : 'var(--color-text-secondary)',
        border:'0.5px solid var(--color-border-tertiary)',
      }}>
        {count} {count === 1 ? 'member' : 'members'}
      </div>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TribeDropdown
// ─────────────────────────────────────────────────────────────────────────────
function TribeDropdown({ tribes, onJoin, loading }: {
  tribes: {id:string; name:string; description?:string|null; invite_code:string; member_count?:number}[]
  onJoin: (code:string) => void
  loading: boolean
}) {
  const [selected, setSelected] = useState('')
  const sel = tribes.find(t => t.invite_code === selected)

  return (
    <div style={{display:'flex', flexDirection:'column', gap:8}}>
      {tribes.map(t => (
        <TribeCard key={t.id} tribe={t} selected={selected === t.invite_code}
          onSelect={() => setSelected(selected === t.invite_code ? '' : t.invite_code)}/>
      ))}
      {sel && (
        <button onClick={() => onJoin(sel.invite_code)} disabled={loading} style={{
          marginTop:4, padding:'11px 0', width:'100%', border:'none',
          borderRadius:'var(--border-radius-lg)',
          background:'var(--color-background-success)', color:'var(--color-text-success)',
          fontSize:14, fontWeight:500, cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center', gap:8,
          opacity: loading ? 0.6 : 1,
        }}>
          {loading && <Spinner className="w-4 h-4"/>}
          Join {sel.name}
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// NoTribePanel
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// NoTribePanel — join comps, create comps, join/switch tribes
// ─────────────────────────────────────────────────────────────────────────────
// ── SwitchTribePanel — shown when user already has a tribe ───────────────────
function SwitchTribePanel({
  currentTribeId, compId, onSwitch,
}: { currentTribeId: string; compId: string | null; onSwitch: () => void }) {
  const [tribes,    setTribes]    = useState<any[]>([])
  const [expanded,  setExpanded]  = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [selected,  setSelected]  = useState('')
  const { session } = useSupabase()

  useEffect(() => {
    if (!compId) return
    fetch(`/api/tribes/list?comp_id=${compId}`)
      .then(r => r.json())
      .then(d => setTribes((d.data ?? []).filter((t: any) => t.id !== currentTribeId)))
  }, [compId, currentTribeId])

  const switchTribe = async () => {
    if (!selected) return
    setLoading(true)
    // Leave current tribe then join new one
    await fetch('/api/tribes', { method: 'DELETE' })
    const { error } = await fetch('/api/tribes', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invite_code: selected }),
    }).then(r => r.json())
    setLoading(false)
    if (error) { toast.error(error); return }
    toast.success('Switched tribe!')
    onSwitch()
  }

  if (tribes.length === 0) return null

  return (
    <div style={{
      background: 'var(--color-background-primary)',
      border: '0.5px solid var(--color-border-tertiary)',
      borderRadius: 'var(--border-radius-xl)',
      marginBottom: 12, overflow: 'hidden',
    }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '12px 16px',
          background: 'transparent', border: 'none', cursor: 'pointer',
        }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
          Switch tribe ({tribes.length} other{tribes.length !== 1 ? 's' : ''} in this comp)
        </span>
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
      </button>

      {expanded && (
        <div style={{ borderTop: '0.5px solid var(--color-border-tertiary)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <TribeDropdown tribes={tribes} onJoin={(code) => { setSelected(code) }} loading={false} />
          {selected && (
            <button onClick={switchTribe} disabled={loading}
              style={{
                padding: '11px 0', border: 'none', borderRadius: 'var(--border-radius-lg)',
                background: 'var(--color-text-primary)', color: 'var(--color-background-primary)',
                fontSize: 14, fontWeight: 500, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: loading ? 0.5 : 1,
              }}>
              {loading && <Spinner className="w-4 h-4" />}
              Switch to {tribes.find(t => t.invite_code === selected)?.name}
            </button>
          )}
        </div>
      )}
    </div>
  )
}


function NoTribePanel({
  onJoined, activeTournamentId, selectedComp, selectedTourn,
}: {
  onJoined:             () => void
  activeTournamentId:   string | null
  selectedComp:         { id:string; name:string; logo_url?:string|null } | null
  selectedTourn:        { id:string; name:string } | null
}) {
  const { session, supabase } = useSupabase()
  const MAX_COMPS = 3

  // Use selectedTourn from context (always ready) instead of waiting for effectiveTournId prop
  const effectiveTournId = selectedTourn?.id ?? activeTournamentId

  type View = 'main' | 'join-comp' | 'create-comp'
  const [view,          setView]          = useState<View>('main')
  const [myComps,       setMyComps]       = useState<any[]>([])
  const [compTribesMap, setCompTribesMap] = useState<Record<string,any[]>>({})
  const [initLoading,   setInitLoading]   = useState(true)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState<string|null>(null)

  // Join comp
  const [compCode,      setCompCode]      = useState('')
  const [compLookup,    setCompLookup]    = useState<{id:string;name:string}|null>(null)
  const [compCodeErr,   setCompCodeErr]   = useState<string|null>(null)
  const [lookingUp,     setLookingUp]     = useState(false)

  // Create comp
  const [newCompName,   setNewCompName]   = useState('')
  const [ownerPhone,    setOwnerPhone]    = useState('')
  const [ownerEmail,    setOwnerEmail]    = useState('')
  const [logoFile,      setLogoFile]      = useState<File|null>(null)
  const [logoPreview,   setLogoPreview]   = useState<string|null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadMyComps = async () => {
    if (!session) return
    try {
      // Only load tribes for the selected comp (from home page context)
      // If no comp is selected, fall back to all comps for this tournament
      const compsToLoad = selectedComp
        ? [selectedComp]
        : await (async () => {
            const res  = await fetch(effectiveTournId ? `/api/user-comps?tournament_id=${effectiveTournId}` : '/api/user-comps')
            const data = await res.json()
            return (data.data ?? [])
              .map((uc: any) => Array.isArray(uc.comps) ? uc.comps[0] : uc.comps)
              .filter(Boolean)
          })()

      setMyComps(compsToLoad)

      if (compsToLoad.length > 0) {
        const map: Record<string,any[]> = {}
        await Promise.all(compsToLoad.map(async (c: any) => {
          const r = await fetch(`/api/tribes/list?comp_id=${c.id}`)
          const d = await r.json()
          map[c.id] = d.data ?? []
        }))
        setCompTribesMap(map)
      }
    } catch(e) { console.error('loadMyComps', e) }
    setInitLoading(false)
  }

  useEffect(() => {
    if (session) loadMyComps()
  }, [session, selectedComp?.id, effectiveTournId])

  const lookupComp = async () => {
    setLookingUp(true); setCompCodeErr(null); setCompLookup(null)
    const { data, error } = await fetch(`/api/comps?code=${compCode.toUpperCase()}`).then(r=>r.json())
    setLookingUp(false)
    if (error || !data) { setCompCodeErr('Code not found — check with your comp admin'); return }
    if (effectiveTournId && data.tournament_id && data.tournament_id !== effectiveTournId)
      { setCompCodeErr('This comp is not for your current tournament'); return }
    if (myComps.some(c => c.id === data.id))
      { setCompCodeErr('You already joined this comp'); return }
    setCompLookup(data)
  }

  const joinComp = async () => {
    if (!compLookup) return
    setLoading(true); setError(null)
    const { success, error } = await fetch('/api/comp-admins/self-register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comp_id: compLookup.id, invite_code: compCode.toUpperCase() }),
    }).then(r=>r.json())
    if (!success) { setError(error ?? 'Failed to join comp'); setLoading(false); return }
    setView('main'); setCompCode(''); setCompLookup(null)
    await loadMyComps(); setLoading(false)
  }

  const createComp = async () => {
    if (!newCompName.trim()) return
    setLoading(true); setError(null)
    const { data: org, error: orgErr } = await fetch('/api/comps/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newCompName.trim(), owner_phone: ownerPhone.trim(),
        owner_email: ownerEmail.trim(), owner_name: '',
        user_id: session!.user.id, email: session!.user.email,
        tournament_id: effectiveTournId,
      }),
    }).then(r=>r.json())
    if (orgErr || !org) { setError(orgErr ?? 'Failed to create comp'); setLoading(false); return }
    if (logoFile && session?.user.id) {
      const ext = logoFile.name.split('.').pop()
      const p   = `${session.user.id}/logo.${ext}`
      const { data: uploaded } = await supabase.storage.from('org-logos').upload(p, logoFile, { upsert: true })
      if (uploaded) {
        const { data: urlData } = supabase.storage.from('org-logos').getPublicUrl(p)
        await fetch('/api/comps/create', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comp_id: org.id, logo_url: urlData.publicUrl, user_id: session!.user.id }),
        })
      }
    }
    setView('main'); setNewCompName(''); setOwnerPhone(''); setOwnerEmail('')
    await loadMyComps(); setLoading(false)
  }

  const joinTribe = async (inviteCode: string) => {
    setLoading(true); setError(null)
    const { error } = await fetch('/api/tribes', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invite_code: inviteCode }),
    }).then(r=>r.json())
    setLoading(false)
    if (error) { setError(error); return }
    onJoined()
  }

  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return
    if (f.size > 2*1024*1024) { setError('Logo must be under 2MB'); return }
    setLogoFile(f)
    const r = new FileReader(); r.onloadend = () => setLogoPreview(r.result as string); r.readAsDataURL(f)
  }

  if (initLoading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
      <Spinner className="w-7 h-7" />
    </div>
  )

  // ── View: Join comp ──────────────────────────────────────────────────────────
  if (view === 'join-comp') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button onClick={() => { setView('main'); setCompCode(''); setCompLookup(null); setCompCodeErr(null) }}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--color-text-secondary)', alignSelf: 'flex-start', padding: '4px 0' }}>
        ← Back
      </button>
      <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-xl)', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <p style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)' }}>Join a comp</p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>Enter the invite code from your comp admin</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="text" value={compCode}
            onChange={e => { setCompCode(e.target.value.toUpperCase()); setCompLookup(null); setCompCodeErr(null) }}
            placeholder="INVITE CODE" maxLength={10}
            style={{ flex: 1, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em' }} />
          <button onClick={lookupComp} disabled={lookingUp || compCode.length < 4}
            style={{ padding: '0 16px', border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-md)', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', opacity: (lookingUp || compCode.length < 4) ? 0.4 : 1 }}>
            {lookingUp ? <Spinner className="w-4 h-4" /> : 'Find'}
          </button>
        </div>
        {compCodeErr && <p style={{ margin: 0, fontSize: 12, padding: '8px 12px', borderRadius: 'var(--border-radius-md)', background: 'var(--color-background-danger)', color: 'var(--color-text-danger)' }}>{compCodeErr}</p>}
        {compLookup && (
          <div style={{ padding: '14px', borderRadius: 'var(--border-radius-lg)', border: '1.5px solid var(--color-border-success)', background: 'var(--color-background-success)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--color-text-success)' }}>🏢 {compLookup.name}</p>
            <button onClick={joinComp} disabled={loading}
              style={{ padding: '10px 0', border: 'none', borderRadius: 'var(--border-radius-md)', background: 'var(--color-background-success)', color: 'var(--color-text-success)', fontSize: 14, fontWeight: 500, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
              {loading && <Spinner className="w-4 h-4" />} Join {compLookup.name}
            </button>
          </div>
        )}
        {error && <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-danger)' }}>{error}</p>}
      </div>
    </div>
  )

  // ── View: Create comp ────────────────────────────────────────────────────────
  if (view === 'create-comp') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button onClick={() => { setView('main'); setNewCompName('') }}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--color-text-secondary)', alignSelf: 'flex-start', padding: '4px 0' }}>
        ← Back
      </button>
      <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-xl)', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <p style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)' }}>Create a comp</p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>Set up a competition for your team or group</p>
        </div>
        <input type="text" value={newCompName} onChange={e => setNewCompName(e.target.value)} placeholder="Comp name *" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <input type="tel" value={ownerPhone} onChange={e => setOwnerPhone(e.target.value)} placeholder="Phone (optional)" />
          <input type="email" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} placeholder="Email (optional)" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div onClick={() => fileRef.current?.click()} style={{ width: 44, height: 44, borderRadius: 'var(--border-radius-md)', border: '0.5px solid var(--color-border-secondary)', overflow: 'hidden', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-background-secondary)', fontSize: 20 }}>
            {logoPreview ? <img src={logoPreview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : '🏢'}
          </div>
          <button type="button" onClick={() => fileRef.current?.click()}
            style={{ fontSize: 12, fontWeight: 500, padding: '5px 12px', border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-md)', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-primary)' }}>
            {logoFile ? 'Change logo' : 'Upload logo'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogo} />
        </div>
        {error && <p style={{ margin: 0, fontSize: 12, padding: '8px 12px', borderRadius: 'var(--border-radius-md)', background: 'var(--color-background-danger)', color: 'var(--color-text-danger)' }}>{error}</p>}
        <button onClick={createComp} disabled={loading || !newCompName.trim()}
          style={{ marginTop: 4, padding: '11px 0', border: 'none', borderRadius: 'var(--border-radius-lg)', background: 'var(--color-text-primary)', color: 'var(--color-background-primary)', fontSize: 14, fontWeight: 500, cursor: 'pointer', opacity: (loading || !newCompName.trim()) ? 0.35 : 1 }}>
          {loading && <Spinner className="w-4 h-4" />} Create comp
        </button>
      </div>
    </div>
  )

  // ── View: Main ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 32 }}>

      {/* Hero — context-aware header */}
      <div style={{
        borderRadius: 'var(--border-radius-xl)', overflow: 'hidden',
        background: 'linear-gradient(135deg, #0d3d2a 0%, #1a5c3e 60%, #0f4d34 100%)',
        padding: '24px 20px',
      }}>
        {selectedComp ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              {selectedComp.logo_url
                ? <img src={selectedComp.logo_url} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }} />
                : <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🏢</div>
              }
              <div>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#ffffff' }}>
                  {selectedComp.name}
                </p>
                {selectedTourn && <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{selectedTourn.name}</p>}
              </div>
            </div>
            <p style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>
              You're in this comp — pick a tribe below to compete with friends.
            </p>
          </>
        ) : (
          <>
            <p style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700, color: '#ffffff' }}>Join the competition</p>
            <p style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
              Join or create a comp to access tribes, climb the leaderboard, and compete with your group.
            </p>
            <a href="/" style={{ display: 'inline-block', marginTop: 12, fontSize: 12, color: 'rgba(74,222,128,0.9)', textDecoration: 'none', fontWeight: 500 }}>
              ← Select a tournament on the home page first
            </a>
          </>
        )}
      </div>

      {/* Joined comp cards with tribe pickers */}
      {myComps.map((comp, idx) => {
        const tribes = compTribesMap[comp.id] ?? []
        return (
          <div key={comp.id} style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-xl)', overflow: 'hidden' }}>
            {/* Comp header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
              {comp.logo_url
                ? <img src={comp.logo_url} alt={comp.name} style={{ width: 36, height: 36, borderRadius: 'var(--border-radius-md)', objectFit: 'cover', flexShrink: 0 }} />
                : <div style={{ width: 36, height: 36, borderRadius: 'var(--border-radius-md)', background: 'var(--color-background-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🏢</div>
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {comp?.name}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  {tribes.length === 0 ? 'No tribes yet' : `${tribes.length} tribe${tribes.length !== 1 ? 's' : ''} available`}
                </p>
              </div>
              {myComps.length > 1 && (
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>{idx + 1}/{myComps.length}</span>
              )}
            </div>
            {/* Tribe picker */}
            <div style={{ padding: 16 }}>
              {tribes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <p style={{ margin: '0 0 4px', fontSize: 14, color: 'var(--color-text-secondary)' }}>No tribes available yet</p>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)' }}>Ask your comp admin to create one.</p>
                </div>
              ) : (
                <TribeDropdown tribes={tribes} onJoin={joinTribe} loading={loading} />
              )}
            </div>
            {error && (
              <p style={{ margin: '0 16px 16px', padding: '8px 12px', borderRadius: 'var(--border-radius-md)', background: 'var(--color-background-danger)', color: 'var(--color-text-danger)', fontSize: 12 }}>
                {error}
              </p>
            )}
          </div>
        )
      })}

      {/* No comps yet empty state */}
      {myComps.length === 0 && (
        <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-xl)', padding: '28px 20px', textAlign: 'center' }}>
          <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>No comp joined yet</p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Join with an invite code or create your own below.
          </p>
        </div>
      )}

      {/* Action bar */}
      <div style={{ display: 'grid', gridTemplateColumns: myComps.length < MAX_COMPS ? '1fr 1fr' : '1fr', gap: 10 }}>
        <button onClick={() => setView('join-comp')}
          style={{ padding: '12px 0', border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-lg)', background: 'transparent', cursor: 'pointer', fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          🔑 Join comp
        </button>
        {myComps.length < MAX_COMPS ? (
          <button onClick={() => setView('create-comp')}
            style={{ padding: '12px 0', border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-lg)', background: 'var(--color-background-secondary)', cursor: 'pointer', fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            + Create comp
          </button>
        ) : (
          <div style={{ padding: '12px 0', border: '0.5px dashed var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', textAlign: 'center', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            Max {MAX_COMPS} comps reached
          </div>
        )}
      </div>
    </div>
  )
}


export default function TribePage() {
  const { session, supabase } = useSupabase()
  const { timezone } = useTimezone()
  const { selectedComp, selectedTourn } = useUserPrefs()

  const [tribe,          setTribe]          = useState<TribeData | null>(null)
  const [tribePicksData, setTribePicksData] = useState<any | null>(null)
  const [activeTournamentId, setActiveTournamentId] = useState<string | null>(null)
  const [picksLoading,   setPicksLoading]   = useState(false)
  const [fixtures,       setFixtures]       = useState<Fixture[]>([])
  const [loading,        setLoading]        = useState(true)
  const [tab,            setTab]            = useState<MainTab>('leaderboard')
  const [chatTopic,      setChatTopic]      = useState<ChatTopic>('general')
  const [copied,         setCopied]         = useState(false)
  const myId = session?.user.id ?? ''

  const loadPicks = async () => {
    if (!tribe) return
    setPicksLoading(true)
    const tidParam = activeTournamentId ? `&tournament_id=${activeTournamentId}` : ''
    const res  = await fetch(`/api/tribes/picks?tribe_id=${tribe.id}${tidParam}`)
    const data = await res.json()
    setTribePicksData(data)
    setPicksLoading(false)
  }

  useEffect(() => {
    if (tab === 'picks' && tribe && !tribePicksData) loadPicks()
  }, [tab, tribe])

  const loadTribe = async () => {
    setLoading(true)
    try {
      const { data: userRow } = await supabase
        .from('user_preferences').select('tournament_id').eq('user_id', session!.user.id).single()
      const tid = (userRow as any)?.tournament_id ?? null
      setActiveTournamentId(tid)

      const compParam = selectedComp?.id ? `?comp_id=${selectedComp.id}` : ''
      const tribeRes = await fetch(`/api/tribes${compParam}`)
      const tribeData = await tribeRes.json()

      // Fetch fixtures in background — don't block tribe display on failure
      fetch(`/api/fixtures${tid ? `?tournament_id=${tid}` : ''}`)
        .then(r => r.json())
        .then(fxData => setFixtures((fxData.data ?? []).map((f: any) => ({
          id: f.id, round: f.round, group: f.group, home: f.home, away: f.away,
          kickoff_utc: f.kickoff_utc, venue: f.venue, result: f.result ?? null,
        })))).catch(() => {})

      if (tribeData.data) {
        const raw = tribeData.data
        if (tid && raw.tournament_id && raw.tournament_id !== tid) {
          setTribe(null)
        } else {
          if (raw.comp_id) {
            const { data: compRow } = await supabase
              .from('comps').select('name, logo_url').eq('id', raw.comp_id).single()
            if (compRow) raw._org = compRow
          }
          const members: Member[] = (raw.tribe_members ?? []).map((tm: any) => {
            const u = tm.users ?? tm.user ?? {}
            return {
              user_id:       u.id ?? '',
              display_name:  u.display_name ?? 'Unknown',
              avatar_url:    u.avatar_url ?? null,
              total_points:  u.total_points ?? 0,
              exact_count:   u.exact_count  ?? 0,
              correct_count: u.correct_count ?? 0,
              joined_at:     tm.joined_at ?? '',
            }
          })
          setTribe({ ...raw, members })
        }
      } else {
        setTribe(null)
      }
    } catch (e) {
      console.error('[loadTribe] error:', e)
      setTribe(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (session) loadTribe() }, [session])

  const leaveTribe = async () => {
    if (!confirm('Leave this tribe? Your predictions and points history are kept.')) return
    const res = await fetch('/api/tribes', { method: 'DELETE' })
    if (res.ok) { toast.success('Left tribe'); setTribe(null) }
    else toast.error('Failed to leave tribe')
  }

  const copyCode = async () => {
    if (!tribe) return
    await navigator.clipboard.writeText(tribe.invite_code)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
    toast.success('Invite code copied!')
  }

  const sortedMembers = tribe
    ? [...tribe.members].sort((a, b) => b.total_points - a.total_points)
    : []

  // ── Context bar — shown at top of every state ──────────────────────────────
  const ContextBar = () => {
    if (!selectedTourn && !selectedComp) return null
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 16px', marginBottom: 16,
        background: 'var(--color-background-secondary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--border-radius-lg)',
      }}>
        {selectedComp?.logo_url && (
          <img src={selectedComp.logo_url} alt="" style={{ width: 24, height: 24, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {selectedComp && (
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
              {selectedComp.name}
            </span>
          )}
          {selectedTourn && (
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginLeft: selectedComp ? 8 : 0 }}>
              {selectedTourn.name}
            </span>
          )}
        </div>
        {!selectedComp && (
          <a href="/" style={{ fontSize: 12, color: 'var(--color-text-info)', textDecoration: 'none', flexShrink: 0 }}>
            Select comp on Home →
          </a>
        )}
      </div>
    )
  }

  if (loading) return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <ContextBar />
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
        <Spinner className="w-8 h-8" />
      </div>
    </div>
  )

  if (!tribe) return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <ContextBar />
      <NoTribePanel
        onJoined={loadTribe}
        activeTournamentId={activeTournamentId}
        selectedComp={selectedComp}
        selectedTourn={selectedTourn}
      />
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto px-4 py-4">

      {/* ── Hero header ── */}
      <div style={{
        borderRadius: 'var(--border-radius-xl)',
        overflow: 'hidden',
        marginBottom: 16,
        border: '0.5px solid var(--color-border-tertiary)',
      }}>
        {/* Dark banner strip */}
        <div style={{
          background: 'linear-gradient(135deg, #0d3d2a 0%, #1a5c3e 60%, #0f4d34 100%)',
          padding: '18px 20px 14px',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
        }}>
          <div>
            {/* Comp + tournament context */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              {(selectedComp || (tribe as any)._org) && (() => {
                const org = selectedComp || (tribe as any)._org
                return (
                  <>
                    {org.logo_url && <img src={org.logo_url} alt="" style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'cover' }} />}
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>
                      {org.name}
                    </span>
                  </>
                )
              })()}
              {selectedTourn && (
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginLeft: 2 }}>
                  · {selectedTourn.name}
                </span>
              )}
            </div>
            {/* Tribe name */}
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#ffffff', letterSpacing: '-0.3px' }}>
              {tribe.name}
            </h1>
            {/* Member count + invite code */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                {tribe.members.length} member{tribe.members.length !== 1 ? 's' : ''}
              </span>
              <button onClick={copyCode} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: copied ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.1)',
                border: copied ? '1px solid rgba(74,222,128,0.4)' : '1px solid rgba(255,255,255,0.2)',
                color: copied ? '#4ade80' : 'rgba(255,255,255,0.7)',
                transition: 'all 0.15s', letterSpacing: '0.05em',
              }}>
                <span style={{ fontFamily: 'monospace' }}>{tribe.invite_code}</span>
                <span style={{ fontSize: 10 }}>{copied ? '✓ copied' : 'copy'}</span>
              </button>
            </div>
          </div>
          <button onClick={leaveTribe} style={{
            padding: '6px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer', flexShrink: 0,
            border: '1px solid rgba(255,100,100,0.4)', borderRadius: 'var(--border-radius-md)',
            background: 'rgba(255,100,100,0.1)', color: 'rgba(255,150,150,0.9)',
          }}>
            Leave
          </button>
        </div>

        {/* Tab bar — sits inside the card, below the header */}
        <div style={{
          display: 'flex', background: 'var(--color-background-primary)',
          borderTop: '0.5px solid var(--color-border-tertiary)',
        }}>
          {(['leaderboard','picks','chat'] as MainTab[]).map(t => {
            const labels: Record<MainTab,string> = { leaderboard: 'Standings', picks: 'Picks', chat: 'Chat' }
            const isActive = tab === t
            return (
              <button key={t} onClick={() => setTab(t)} style={{
                flex: 1, padding: '11px 0', fontSize: 13, fontWeight: isActive ? 600 : 400,
                border: 'none', cursor: 'pointer', background: 'transparent',
                color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                borderBottom: isActive ? '2px solid #1a5c3e' : '2px solid transparent',
                transition: 'all 0.15s',
              }}>
                {labels[t]}
              </button>
            )
          })}
        </div>
      </div>

      {/* Switch tribe — shows other tribes in the same comp */}
      <SwitchTribePanel
        currentTribeId={tribe.id}
        compId={(tribe as any).comp_id}
        onSwitch={() => { setTribe(null); setTribePicksData(null); loadTribe() }}
      />

      {/* Prizes */}
      {(tribe as any).comp_id && <PrizesDisplay compId={(tribe as any).comp_id} />}

      {/* ── Standings tab — cross-tab by round ── */}
      {tab === 'leaderboard' && (
        <TribeStandingsView
          members={sortedMembers}
          myId={myId}
          tribePicksData={tribePicksData}
          onLoadPicks={loadPicks}
          picksLoading={picksLoading}
        />
      )}

      {/* ── Picks tab ── */}
      {tab === 'picks' && (
        <TribePicksView
          tribePicksData={tribePicksData}
          loading={picksLoading}
          myId={myId}
          onRefresh={loadPicks}
          timezone={timezone}
        />
      )}

      {/* ── Chat tab — two column layout ── */}
      {tab === 'chat' && (
        <div className="flex gap-3" style={{ height: 'calc(100vh - 220px)', minHeight: '500px' }}>
          {/* Left: topic selector */}
          <div className="w-64 flex-shrink-0 overflow-y-auto">
            <MatchTopicList
              fixtures={fixtures}
              activeTopic={chatTopic}
              onSelect={setChatTopic}
              timezone={timezone}
            />
          </div>

          {/* Right: chat panel */}
          <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
            <ChatPanel
              tribeId={tribe.id}
              topic={chatTopic}
              myId={myId}
              fixtures={fixtures}
              timezone={timezone}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tribe Standings (cross-tab by round) ─────────────────────────────────────
const ROUND_ORDER_DISPLAY = ['gs','r32','r16','qf','sf','tp','f'] as const
const ROUND_SHORT: Record<string, string> = {
  gs:'GS', r32:'R32', r16:'R16', qf:'QF', sf:'SF', tp:'3rd', f:'FIN'
}

function TribeStandingsView({ members, myId, tribePicksData, onLoadPicks, picksLoading }: {
  members: Member[]
  myId: string
  tribePicksData: any
  onLoadPicks: () => void
  picksLoading: boolean
}) {
  // Load picks on mount if not yet loaded
  useEffect(() => {
    if (!tribePicksData && !picksLoading) onLoadPicks()
  }, [])

  // Build per-member per-round points from picks data
  const roundBreakdown = useMemo(() => {
    if (!tribePicksData) return {}
    const { fixtures, picks } = tribePicksData
    const breakdown: Record<string, Record<string, number>> = {}
    members.forEach(m => { breakdown[m.user_id] = {} })
    ;(fixtures ?? []).forEach((fx: any) => {
      const fxPicks = picks?.[fx.id] ?? {}
      Object.entries(fxPicks).forEach(([uid, p]: any) => {
        if (!breakdown[uid]) breakdown[uid] = {}
        const pts = Number(p.points_earned ?? 0)
        if (pts > 0) {
          breakdown[uid][fx.round] = (breakdown[uid][fx.round] ?? 0) + pts
        }
      })
    })
    return breakdown
  }, [tribePicksData, members])

  // Which rounds have any data
  const activeRounds = ROUND_ORDER_DISPLAY.filter(r =>
    members.some(m => (roundBreakdown[m.user_id]?.[r] ?? 0) > 0)
  )

  if (picksLoading) return <div className="flex justify-center py-16"><Spinner className="w-7 h-7" /></div>

  if (members.length === 0) return (
    <EmptyState title="No members yet" description="Share the invite code to get started." />
  )

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide sticky left-0 bg-gray-50 min-w-[120px]">
                Member
              </th>
              {activeRounds.length === 0
                ? <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-400">Awaiting results</th>
                : activeRounds.map(r => (
                  <th key={r} className="px-2 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wide min-w-[44px]">
                    {ROUND_SHORT[r]}
                  </th>
                ))
              }
              <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-gray-700 uppercase tracking-wide bg-gray-50">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((member, i) => {
              const isMe  = member.user_id === myId
              const breakdown = roundBreakdown[member.user_id] ?? {}
              const totalFromBreakdown = Object.values(breakdown).reduce((s, v) => s + v, 0)
              // Use member.total_points as source of truth; breakdown may differ slightly due to filter timing
              const displayTotal = member.total_points

              return (
                <tr key={member.user_id}
                  className={clsx(
                    'border-b border-gray-100 last:border-0 transition-colors',
                    isMe ? 'bg-green-50' : 'hover:bg-gray-50'
                  )}>
                  {/* Member name */}
                  <td className={clsx('px-3 py-2.5 sticky left-0', isMe ? 'bg-green-50' : 'bg-white hover:bg-gray-50')}>
                    <div className="flex items-center gap-2 min-w-0">
                      <Medal rank={i + 1} />
                      <Avatar name={member.display_name} src={member.avatar_url} size="xs" />
                      <span className={clsx('font-medium truncate', isMe && 'text-green-700')}>
                        {member.display_name}{isMe && ' (you)'}
                      </span>
                    </div>
                  </td>

                  {/* Points per round */}
                  {activeRounds.length === 0
                    ? <td className="px-3 py-2.5 text-center text-gray-400">—</td>
                    : activeRounds.map(r => {
                      const pts = breakdown[r] ?? 0
                      return (
                        <td key={r} className="px-2 py-2.5 text-center">
                          {pts > 0
                            ? <span className={clsx(
                                'inline-block px-1.5 py-0.5 rounded font-semibold min-w-[28px] text-center',
                                isMe ? 'bg-green-200 text-green-900' : 'bg-gray-100 text-gray-700'
                              )}>{pts}</span>
                            : <span className="text-gray-300">—</span>
                          }
                        </td>
                      )
                    })
                  }

                  {/* Total */}
                  <td className="px-3 py-2.5 text-right">
                    <span className={clsx('font-bold text-sm', isMe ? 'text-green-700' : 'text-gray-900')}>
                      {displayTotal}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      {activeRounds.length > 0 && (
        <div className="mt-2 flex gap-3 flex-wrap text-[11px] text-gray-400">
          {activeRounds.map(r => (
            <span key={r}><span className="font-medium text-gray-500">{ROUND_SHORT[r]}</span> = {
              r==='gs'?'Group Stage':r==='r32'?'Round of 32':r==='r16'?'Round of 16':
              r==='qf'?'Quarter-finals':r==='sf'?'Semi-finals':r==='tp'?'3rd Place':'Final'
            }</span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tribe Picks View ──────────────────────────────────────────────────────────
function TribePicksView({ tribePicksData, loading, myId, onRefresh, timezone }: {
  tribePicksData: any; loading: boolean; myId: string; onRefresh: () => void; timezone: string
}) {
  const [expandedFixture, setExpandedFixture] = useState<number | null>(null)
  const [activePickRound, setActivePickRound] = useState<string>('gs')

  if (loading) return <div className="flex justify-center py-16"><Spinner className="w-7 h-7" /></div>

  if (!tribePicksData) return (
    <div className="text-center py-12">
      <p className="text-sm text-gray-500 mb-3">Load tribe picks to see how everyone predicted.</p>
      <button onClick={onRefresh} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg">
        Load picks
      </button>
    </div>
  )

  const { fixtures, members, picks } = tribePicksData
  if (!fixtures?.length) return (
    <div className="text-center py-12">
      <p className="text-gray-400 text-sm">No locked fixtures yet — picks will appear here once matches kick off.</p>
    </div>
  )

  const picksMap: Record<number, Record<string, any>> = picks ?? {}

  const OUTCOME_ROUNDS_SET = new Set(['gs','r32','r16','qf'])
  const EXACT_ROUNDS_SET   = new Set(['sf','tp','f'])

  // Map outcome code to display label
  const outcomeLabel = (o: string | null) =>
    o === 'H' ? '1' : o === 'D' ? 'X' : o === 'A' ? '2' : null

  // Colour and label derived from prediction vs result
  const cellInfo = (fx: any, userId: string) => {
    const pick = picksMap[fx.id]?.[userId]
    if (!pick) return { colour: 'bg-gray-100 text-gray-400', label: '—' }

    const isOutcomeRound = OUTCOME_ROUNDS_SET.has(fx.round)
    const isExactRound   = EXACT_ROUNDS_SET.has(fx.round)

    // Build display label
    const label = isOutcomeRound
      ? (outcomeLabel(pick.outcome) ?? '—')  // show 1 / X / 2
      : `${pick.home}–${pick.away}`           // show score for sf/tp/f

    // No result yet — amber awaiting
    if (!fx.result) {
      const needsPen = fx.round !== 'gs' && !['gs'].includes(fx.round) && pick.outcome === 'D' && !pick.pen_winner
      if (needsPen) return { colour: 'bg-amber-50 text-amber-700 border border-amber-300', label: `${label} 🥅?` }
      return { colour: 'bg-amber-50 text-amber-800 border border-amber-200', label }
    }

    // Compute outcomes for comparison
    const rh = Number(fx.result.home); const ra = Number(fx.result.away)
    const resultOutcome = rh > ra ? 'H' : ra > rh ? 'A' : 'D'

    if (isOutcomeRound) {
      if (!pick.outcome) return { colour: 'bg-gray-100 text-gray-400', label: '—' }
      if (pick.outcome === resultOutcome) return { colour: 'bg-green-100 text-green-800 font-semibold', label }
      return { colour: 'bg-red-100 text-red-700', label }
    } else {
      // Exact score round
      const ph = Number(pick.home); const pa = Number(pick.away)
      const predOutcome = ph > pa ? 'H' : pa > ph ? 'A' : 'D'
      if (ph === rh && pa === ra) return { colour: 'bg-green-100 text-green-800 font-semibold', label }
      if (predOutcome === resultOutcome) return { colour: 'bg-blue-100 text-blue-800', label }
      return { colour: 'bg-red-100 text-red-700', label }
    }
  }

  const roundOrder = ['gs','r32','r16','qf','sf','tp','f']
  const roundLabels: Record<string, string> = {
    gs:'Group Stage', r32:'Round of 32', r16:'Round of 16',
    qf:'Quarter-finals', sf:'Semi-finals', tp:'3rd Place', f:'Final',
  }
  const byRound: Record<string, any[]> = {}
  for (const f of fixtures) {
    if (!byRound[f.round]) byRound[f.round] = []
    byRound[f.round].push(f)
  }
  const availableRounds = roundOrder.filter(r => byRound[r]?.length)
  // Auto-select first available round if current selection has no data
  const effectiveRound = byRound[activePickRound]?.length ? activePickRound : (availableRounds[0] ?? 'gs')

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] text-gray-500">Locked fixtures — picks colour coded once results are in</p>
        <button onClick={onRefresh} className="text-xs text-blue-500 hover:text-blue-700">↻ Refresh</button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap mb-4 text-[11px] text-gray-500">
        <div className="flex items-center gap-1.5"><div className="w-1 h-4 rounded-full bg-green-400"/><span>Correct</span></div>
        <div className="flex items-center gap-1.5"><div className="w-1 h-4 rounded-full bg-red-300"/><span>Wrong</span></div>
        <div className="flex items-center gap-1.5"><div className="w-1 h-4 rounded-full bg-amber-300"/><span>Awaiting result</span></div>
        <div className="flex items-center gap-1.5"><div className="w-1 h-4 rounded-full bg-gray-200"/><span>No pick</span></div>
      </div>

      {/* Round filter tabs — always shown, empty rounds disabled */}
      <div className="flex gap-1 flex-wrap mb-4">
        {roundOrder.map(r => {
          const hasFixtures = !!byRound[r]?.length
          const isActive    = effectiveRound === r
          return (
            <button key={r}
              disabled={!hasFixtures}
              onClick={() => { setActivePickRound(r); setExpandedFixture(null) }}
              className={clsx(
                'px-3 py-1.5 text-xs font-medium border rounded-full transition-colors whitespace-nowrap',
                isActive && hasFixtures  && 'bg-green-600 border-green-700 text-white',
                !isActive && hasFixtures && 'border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-400',
                !hasFixtures             && 'border-gray-200 text-gray-300 cursor-not-allowed',
              )}>
              {roundLabels[r]}
              {hasFixtures && (
                <span className={clsx(
                  'ml-1 text-[10px] font-semibold',
                  isActive ? 'text-green-200' : 'text-gray-400'
                )}>
                  {byRound[r].length}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Fixtures for selected round */}
      {[effectiveRound].filter(r => byRound[r]?.length).map(round => (
        <div key={round} className="space-y-3">
          {byRound[round].map((fx: any) => {
            const isExpanded = expandedFixture === fx.id
            const roundPicks = picksMap[fx.id] ?? {}
            const isORound   = OUTCOME_ROUNDS_SET.has(fx.round)
            const rh2 = fx.result ? Number(fx.result.home) : null
            const ra2 = fx.result ? Number(fx.result.away) : null
            const ro2 = rh2 !== null && ra2 !== null ? (rh2 > ra2 ? 'H' : ra2 > rh2 ? 'A' : 'D') : null
            const correctCount = !fx.result ? 0 : Object.values(roundPicks).filter((p: any) => {
              if (isORound) return p.outcome === ro2
              const ph = Number(p.home); const pa = Number(p.away)
              const po = ph > pa ? 'H' : pa > ph ? 'A' : 'D'
              return po === ro2
            }).length
            const exactCount = !fx.result || isORound ? 0 : Object.values(roundPicks).filter((p: any) =>
              Number(p.home) === rh2 && Number(p.away) === ra2
            ).length
            const pickCount  = Object.keys(roundPicks).length
            const pctCorrect = fx.result && pickCount > 0 ? Math.round(correctCount / pickCount * 100) : null

            return (
              <div key={fx.id} className={clsx(
                'rounded-2xl border overflow-hidden transition-all',
                fx.result ? 'border-gray-200 bg-white' : 'border-gray-200 bg-white'
              )}>
                {/* ── Fixture header ── */}
                <button
                  onClick={() => setExpandedFixture(isExpanded ? null : fx.id)}
                  className="w-full text-left px-4 pt-3 pb-3 hover:bg-gray-50/80 transition-colors"
                >
                  {/* Teams row */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xl">{flag(fx.home)}</span>
                    <span className={clsx('text-sm font-bold flex-1', !fx.result ? 'text-gray-800' : ro2 === 'H' ? 'text-gray-900' : 'text-gray-400')}>
                      {fx.home}
                    </span>
                    {fx.result ? (
                      <span className="px-3 py-1 bg-gray-900 text-white text-sm font-bold rounded-lg tabular-nums">
                        {fx.result.home} – {fx.result.away}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300 font-medium px-2">vs</span>
                    )}
                    <span className={clsx('text-sm font-bold flex-1 text-right', !fx.result ? 'text-gray-800' : ro2 === 'A' ? 'text-gray-900' : 'text-gray-400')}>
                      {fx.away}
                    </span>
                    <span className="text-xl">{flag(fx.away)}</span>
                  </div>

                  {/* Meta + stats row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[11px] text-gray-400">
                      <span>{formatKickoff(fx.kickoff_utc, timezone, { date: true, time: false })}</span>
                      {fx.pen_winner && (
                        <span className="text-amber-600 font-medium">🥅 {fx.pen_winner} (pens)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {fx.result && pctCorrect !== null && (
                        <div className="flex items-center gap-1.5">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-green-400 rounded-full transition-all"
                              style={{ width: `${pctCorrect}%` }} />
                          </div>
                          <span className="text-[11px] font-semibold text-green-600">{pctCorrect}%</span>
                        </div>
                      )}
                      <span className="text-[11px] text-gray-400">{pickCount}/{members.length} picked</span>
                      <span className="text-gray-300 text-xs ml-1">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>
                </button>

                {/* ── Member picks grid — expanded ── */}
                {isExpanded && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {members.map((member: any) => {
                      const pick  = roundPicks[member.user_id]
                      const isMe  = member.user_id === myId

                      // Determine pick display and state
                      let pickDisplay: React.ReactNode = (
                        <span className="text-[11px] text-gray-300 italic">No pick</span>
                      )
                      let rowState: 'correct' | 'wrong' | 'pending' | 'none' = 'none'

                      if (pick) {
                        if (!fx.result) {
                          rowState = 'pending'
                          if (isORound) {
                            const teamPicked = pick.outcome === 'H' ? fx.home : pick.outcome === 'A' ? fx.away : null
                            pickDisplay = pick.outcome === 'D'
                              ? <span className="flex items-center gap-1 text-xs font-semibold text-gray-700">
                                  {flag(fx.home)} <span className="text-gray-400 mx-0.5">—</span> {flag(fx.away)}
                                  <span className="ml-1 text-[10px] text-gray-400">Draw</span>
                                </span>
                              : <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-800">
                                  {flag(teamPicked!)} {teamPicked}
                                </span>
                          } else {
                            pickDisplay = <span className="text-xs font-bold text-gray-700 tabular-nums">{pick.home} – {pick.away}</span>
                          }
                        } else {
                          // Result is in — colour by correctness
                          const isCorrect = isORound
                            ? pick.outcome === ro2
                            : (Number(pick.home) > Number(pick.away) ? 'H' : Number(pick.away) > Number(pick.home) ? 'A' : 'D') === ro2
                          const isExact = !isORound && Number(pick.home) === rh2 && Number(pick.away) === ra2
                          rowState = isCorrect ? 'correct' : 'wrong'

                          if (isORound) {
                            const teamPicked = pick.outcome === 'H' ? fx.home : pick.outcome === 'A' ? fx.away : null
                            pickDisplay = pick.outcome === 'D'
                              ? <span className={clsx('flex items-center gap-1 text-xs font-semibold',
                                  isCorrect ? 'text-green-800' : 'text-red-700')}>
                                  {flag(fx.home)} <span className="mx-0.5 opacity-60">—</span> {flag(fx.away)}
                                  <span className="ml-1 text-[10px]">Draw</span>
                                </span>
                              : <span className={clsx('flex items-center gap-1.5 text-xs font-semibold',
                                  isCorrect ? 'text-green-800' : 'text-red-700')}>
                                  {flag(teamPicked!)} {teamPicked}
                                </span>
                          } else {
                            pickDisplay = (
                              <span className={clsx('flex items-center gap-1 text-xs font-bold tabular-nums',
                                isExact ? 'text-green-800' : isCorrect ? 'text-blue-800' : 'text-red-700')}>
                                {pick.home} – {pick.away}
                                {isExact && <span className="text-[10px] ml-0.5">★</span>}
                              </span>
                            )
                          }
                        }
                      }

                      return (
                        <div key={member.user_id}
                          className={clsx(
                            'flex items-center gap-3 px-4 py-2.5 transition-colors',
                            isMe && 'bg-green-50/60',
                            rowState === 'correct' && 'bg-green-50/40',
                            rowState === 'wrong'   && 'bg-red-50/30',
                          )}>
                          {/* Left indicator bar */}
                          <div className={clsx('w-0.5 h-6 rounded-full flex-shrink-0',
                            rowState === 'correct' ? 'bg-green-400' :
                            rowState === 'wrong'   ? 'bg-red-300' :
                            rowState === 'pending' ? 'bg-amber-300' : 'bg-gray-200'
                          )} />

                          <Avatar name={member.display_name} size="xs" />

                          <span className={clsx('text-xs font-medium flex-1 truncate',
                            isMe ? 'text-green-700' : 'text-gray-700')}>
                            {member.display_name}{isMe && ' (you)'}
                          </span>

                          <div className="flex-shrink-0">
                            {pickDisplay}
                          </div>

                          {/* Result icon */}
                          {fx.result && pick && (
                            <span className={clsx('text-sm flex-shrink-0',
                              rowState === 'correct' ? 'text-green-500' : 'text-red-400')}>
                              {rowState === 'correct' ? '✓' : '✗'}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
