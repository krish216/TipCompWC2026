'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { Avatar, Medal, Spinner, EmptyState, Card } from '@/components/ui'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import toast from 'react-hot-toast'
import type { RoundId } from '@/types'
import { formatKickoff } from '@/lib/timezone'
import { useTimezone } from '@/hooks/useTimezone'
import { SCORING } from '@/types'

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

type MainTab   = 'leaderboard' | 'chat'
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
function NoTribePanel({ onJoined }: { onJoined: () => void }) {
  const { session, supabase } = useSupabase()
  const [mode,       setMode]       = useState<'join' | 'create'>('join')
  const [value,      setValue]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [isOrgAdmin, setIsOrgAdmin] = useState(false)
  const [orgName,    setOrgName]    = useState<string | null>(null)
  const [orgTribes,  setOrgTribes]  = useState<{id:string;name:string;invite_code:string}[]>([])

  useEffect(() => {
    if (!session) return
    // Check if org admin
    fetch('/api/org-admins')
      .then(r => r.json())
      .then(d => {
        setIsOrgAdmin(d.is_org_admin === true)
        setOrgName(d.org?.name ?? null)
      })
    // Load org tribes
    supabase.from('users').select('org_id').eq('id', session.user.id).single()
      .then(({ data: me }) => {
        if (!(me as any)?.org_id) return
        supabase.from('tribes').select('id, name, invite_code')
          .eq('org_id', (me as any).org_id).order('name')
          .then(({ data }) => setOrgTribes((data ?? []) as any[]))
      })
  }, [session, supabase])

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(null); setLoading(true)
    try {
      const res = await fetch('/api/tribes', {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'create' ? { name: value } : { invite_code: value.toUpperCase() }),
      })
      const { data, error: apiErr } = await res.json()
      if (!res.ok) throw new Error(apiErr ?? 'Something went wrong')
      toast.success(mode === 'create' ? `Tribe "${data.name}" created!` : `Joined "${data.name}"!`)
      onJoined()
    } catch (err: any) { setError(err.message) }
    finally { setLoading(false) }
  }

  const joinTribe = async (inviteCode: string) => {
    setLoading(true)
    try {
      const res = await fetch('/api/tribes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_code: inviteCode }),
      })
      const { data, error: apiErr } = await res.json()
      if (!res.ok) throw new Error(apiErr ?? 'Something went wrong')
      toast.success(`Joined "${data.name}"!`)
      onJoined()
    } catch (err: any) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="max-w-md mx-auto py-8 px-4">
      <div className="text-center mb-6">
        <div className="text-4xl mb-3">🏆</div>
        <h2 className="text-base font-semibold text-gray-900">Join a tribe</h2>
        <p className="text-xs text-gray-500 mt-1">
          {orgName ? `Compete within ${orgName}` : 'Compete with friends and chat about every match'}
        </p>
      </div>

      {/* Org tribes list */}
      {orgTribes.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {orgName ? `${orgName} tribes` : 'Available tribes'}
          </p>
          <div className="space-y-2">
            {orgTribes.map(t => (
              <div key={t.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{t.name}</p>
                  <p className="text-[11px] text-gray-400 font-mono">{t.invite_code}</p>
                </div>
                <button
                  onClick={() => joinTribe(t.invite_code)}
                  disabled={loading}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg"
                >
                  Join
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 my-4">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">or enter a code</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
        </div>
      )}

      {/* Tab bar — only show Create if org admin */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-5">
        <button onClick={() => { setMode('join'); setValue(''); setError(null) }}
          className={clsx('flex-1 py-1.5 text-xs font-medium rounded-md transition-colors', mode==='join'?'bg-white text-gray-900 shadow-sm':'text-gray-500 hover:text-gray-700')}>
          Join with code
        </button>
        {isOrgAdmin && (
          <button onClick={() => { setMode('create'); setValue(''); setError(null) }}
            className={clsx('flex-1 py-1.5 text-xs font-medium rounded-md transition-colors', mode==='create'?'bg-white text-gray-900 shadow-sm':'text-gray-500 hover:text-gray-700')}>
            Create tribe
          </button>
        )}
      </div>

      <form onSubmit={submit} className="bg-white rounded-xl border border-gray-200 p-4">
        <label className="block text-xs font-medium text-gray-700 mb-1.5">
          {mode === 'join' ? 'Invite code (8 characters)' : 'Tribe name'}
        </label>
        <input type="text" value={value} onChange={e => setValue(e.target.value)}
          placeholder={mode === 'join' ? 'e.g. XJAB4K89' : 'e.g. The Offside Trap'}
          required className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
        {error && <p className="text-xs text-red-600 mb-3 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        <button type="submit" disabled={loading || !value.trim()}
          className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2">
          {loading && <Spinner className="w-4 h-4 text-white" />}
          {mode === 'join' ? 'Join tribe' : 'Create tribe'}
        </button>
      </form>
    </div>
  )
}

// ── Main tribe page ───────────────────────────────────────────────────────────
export default function TribePage() {
  const { session, supabase } = useSupabase()
  const { timezone } = useTimezone()
  const [tribe,       setTribe]       = useState<TribeData | null>(null)
  const [fixtures,    setFixtures]    = useState<Fixture[]>([])
  const [loading,     setLoading]     = useState(true)
  const [tab,         setTab]         = useState<MainTab>('leaderboard')
  const [chatTopic,   setChatTopic]   = useState<ChatTopic>('general')
  const [copied,      setCopied]      = useState(false)
  const myId = session?.user.id ?? ''

  const loadTribe = async () => {
    setLoading(true)
    const [tribeRes, fxRes] = await Promise.all([
      fetch('/api/tribes'),
      fetch('/api/fixtures'),
    ])
    const [tribeData, fxData] = await Promise.all([tribeRes.json(), fxRes.json()])

    if (tribeData.data) {
      const raw = tribeData.data
      const members: Member[] = (raw.tribe_members ?? []).map((tm: any) => {
        const u = tm.users ?? tm.user ?? {}
        return {
          user_id:      u.id ?? '',
          display_name: u.display_name ?? 'Unknown',
          avatar_url:   u.avatar_url ?? null,
          total_points: u.total_points ?? 0,
          exact_count:  u.exact_count  ?? 0,
          correct_count:u.correct_count ?? 0,
          joined_at:    tm.joined_at ?? '',
        }
      })
      setTribe({ ...raw, members })
    } else {
      setTribe(null)
    }

    // Build fixture list with results
    const fixtureList: Fixture[] = (fxData.data ?? []).map((f: any) => ({
      id:          f.id,
      round:       f.round,
      group:       f.group,
      home:        f.home,
      away:        f.away,
      kickoff_utc: f.kickoff_utc,
      venue:       f.venue,
      result:      f.result ?? null,
    }))
    setFixtures(fixtureList)
    setLoading(false)
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

  if (loading) return <div className="flex justify-center py-24"><Spinner className="w-8 h-8" /></div>
  if (!tribe)  return <NoTribePanel onJoined={loadTribe} />

  return (
    <div className="max-w-4xl mx-auto px-4 py-4">
      {/* Tribe header */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{tribe.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <button onClick={copyCode}
              className={clsx('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                copied ? 'bg-green-100 text-green-700 border-green-300' : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200')}>
              <span className="font-mono">{tribe.invite_code}</span>
              <span>{copied ? '✓ Copied' : 'Copy'}</span>
            </button>
            <span className="text-xs text-gray-400">{tribe.members.length} member{tribe.members.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <button onClick={leaveTribe} className="px-3 py-1.5 border border-red-300 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium rounded-lg">
          Leave tribe
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-4 w-fit">
        {(['leaderboard','chat'] as MainTab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={clsx('px-4 py-1.5 text-xs font-medium rounded-md transition-colors',
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
            {t === 'chat' ? '💬 Match chat' : '🏆 Leaderboard'}
          </button>
        ))}
      </div>

      {/* ── Leaderboard tab ── */}
      {tab === 'leaderboard' && (
        <Card className="p-0 overflow-hidden">
          <div className="grid grid-cols-[32px_1fr_70px_50px_50px] gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 text-[11px] font-medium text-gray-500 uppercase tracking-wide">
            <span>#</span><span>Member</span>
            <span className="text-right">Points</span>
            <span className="text-right">Exact</span>
            <span className="text-right">✓</span>
          </div>
          {sortedMembers.length === 0
            ? <EmptyState title="No members yet" description="Share the invite code to get started." />
            : sortedMembers.map((member, i) => {
              const isMe = member.user_id === myId
              return (
                <div key={member.user_id}
                  className={clsx('grid grid-cols-[32px_1fr_70px_50px_50px] gap-2 px-3 py-3 border-b border-gray-100 last:border-0', isMe && 'bg-green-50')}>
                  <div className="flex items-center justify-center"><Medal rank={i + 1} /></div>
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar name={member.display_name} src={member.avatar_url} size="xs" />
                    <span className={clsx('text-xs font-medium truncate', isMe && 'text-green-700')}>
                      {member.display_name}{isMe && ' (you)'}
                    </span>
                  </div>
                  <div className="flex items-center justify-end">
                    <span className={clsx('text-sm font-semibold', isMe ? 'text-green-700' : 'text-gray-900')}>{member.total_points}</span>
                  </div>
                  <div className="flex items-center justify-end">
                    <span className="text-xs text-purple-700 font-medium">{member.exact_count}</span>
                  </div>
                  <div className="flex items-center justify-end">
                    <span className="text-xs text-blue-700 font-medium">{member.correct_count}</span>
                  </div>
                </div>
              )
            })
          }
        </Card>
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
