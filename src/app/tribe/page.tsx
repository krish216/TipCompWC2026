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
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">📢 Organisation announcements</p>
      <div className="space-y-2">
        {announcements.map((a: any) => {
          const orgRaw = a.organisations
          const org    = Array.isArray(orgRaw) ? orgRaw[0] : orgRaw
          return (
            <div key={a.id} className="bg-white border border-blue-200 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                {org?.logo_url && <img src={org.logo_url} alt={org.name} className="w-5 h-5 rounded object-cover" />}
                <p className="text-[11px] font-medium text-blue-700">{org?.name ?? 'Organisation'}</p>
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

// ── Tribe dropdown with description ──────────────────────────────────────────
function TribeDropdown({ tribes, onJoin, loading }: {
  tribes: {id:string;name:string;description?:string|null;invite_code:string;member_count?:number}[]
  onJoin: (code: string) => void
  loading: boolean
}) {
  const [selected, setSelected] = useState('')
  const selectedTribe = tribes.find(t => t.invite_code === selected)

  return (
    <div className="space-y-3">
      <select
        value={selected}
        onChange={e => setSelected(e.target.value)}
        className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
      >
        <option value="">Select a tribe…</option>
        {tribes.map(t => (
          <option key={t.id} value={t.invite_code}>
            {t.name}{t.member_count !== undefined ? ` (${t.member_count} member${t.member_count !== 1 ? 's' : ''})` : ''}
          </option>
        ))}
      </select>

      {selectedTribe && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="flex items-start justify-between mb-2">
            <p className="text-sm font-semibold text-gray-900">{selectedTribe.name}</p>
            <span className="text-xs text-gray-400 bg-white border border-gray-200 rounded-full px-2 py-0.5 flex-shrink-0 ml-2">
              👥 {selectedTribe.member_count ?? 0} member{(selectedTribe.member_count ?? 0) !== 1 ? 's' : ''}
            </span>
          </div>
          {selectedTribe.description ? (
            <p className="text-xs text-gray-500 mb-3">{selectedTribe.description}</p>
          ) : (
            <p className="text-xs text-gray-400 italic mb-3">No description</p>
          )}
          <button
            onClick={() => onJoin(selectedTribe.invite_code)}
            disabled={loading}
            className="w-full py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2"
          >
            {loading ? <Spinner className="w-4 h-4 text-white" /> : null}
            Join {selectedTribe.name}
          </button>
        </div>
      )}
    </div>
  )
}

function NoTribePanel({ onJoined, activeTournamentId }: { onJoined: () => void; activeTournamentId: string | null }) {
  const { session, supabase } = useSupabase()

  type Step = 'loading' | 'no-org' | 'has-org' | 'join-org' | 'create-org'
  const [step,         setStep]         = useState<Step>('loading')
  const [userOrg,      setUserOrg]      = useState<{id:string;name:string;slug:string}|null>(null)
  const [isOrgAdmin,   setIsOrgAdmin]   = useState(false)
  const [orgTribes,    setOrgTribes]    = useState<any[]>([])
  const [tournOrgs,    setTournOrgs]    = useState<any[]>([])   // orgs for current tournament
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string|null>(null)
  const [tribeCode,    setTribeCode]    = useState('')

  // Join org by code
  const [orgCode,      setOrgCode]      = useState('')
  const [orgLookup,    setOrgLookup]    = useState<{id:string;name:string}|null>(null)
  const [orgCodeErr,   setOrgCodeErr]   = useState<string|null>(null)
  const [lookingUp,    setLookingUp]    = useState(false)

  // Create org fields
  const [newOrgName,   setNewOrgName]   = useState('')
  const [ownerPhone,   setOwnerPhone]   = useState('')
  const [ownerEmail,   setOwnerEmail]   = useState('')
  const [logoFile,     setLogoFile]     = useState<File|null>(null)
  const [logoPreview,  setLogoPreview]  = useState<string|null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const isPublicOrg = !userOrg || userOrg.slug === 'public'

  useEffect(() => {
    if (!session) return
    ;(async () => {
      const { data: me } = await supabase
        .from('users').select('org_id').eq('id', session.user.id).single()
      const orgId = (me as any)?.org_id ?? null

      let org = null
      if (orgId) {
        const { data: orgRow } = await supabase
          .from('organisations').select('id, name, slug, tournament_id').eq('id', orgId).single()
        org = orgRow ?? null
      }
      setUserOrg(org as any)

      // Check if user's org belongs to the active tournament
      const orgMatchesTournament = org && org.slug !== 'public' &&
        (activeTournamentId ? (org as any).tournament_id === activeTournamentId : true)

      if (org && org.slug !== 'public' && orgMatchesTournament) {
        // User has an org for this tournament — load its tribes
        const [adminRes, tribesData] = await Promise.all([
          fetch('/api/org-admins').then(r => r.json()),
          fetch(`/api/tribes/list?org_id=${org.id}`).then(r => r.json()),
        ])
        setIsOrgAdmin(adminRes.is_org_admin === true)
        setOrgTribes((tribesData.data ?? []) as any[])
        setStep('has-org')
      } else {
        // User has no org, or org is for a different tournament — show tournament orgs
        if (activeTournamentId) {
          const res  = await fetch(`/api/organisations?tournament_id=${activeTournamentId}`)
          const data = await res.json()
          setTournOrgs(data.data ?? [])
        }
        setStep('no-org')
      }
    })()
  }, [session, supabase, activeTournamentId])

  const lookupOrgCode = async () => {
    setLookingUp(true); setOrgCodeErr(null); setOrgLookup(null)
    const res = await fetch(`/api/organisations?code=${orgCode}`)
    const { data, error } = await res.json()
    setLookingUp(false)
    if (error || !data) setOrgCodeErr('Code not found — check with your organisation admin')
    else {
      // Verify org is for the active tournament
      if (activeTournamentId && data.tournament_id && data.tournament_id !== activeTournamentId) {
        setOrgCodeErr('This organisation is not linked to your current tournament')
      } else {
        setOrgLookup(data)
      }
    }
  }

  const joinOrg = async () => {
    if (!orgLookup) return
    setLoading(true); setError(null)
    const res = await fetch('/api/org-admins/self-register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: orgLookup.id, invite_code: orgCode.toUpperCase() }),
    })
    const { success, error } = await res.json()
    setLoading(false)
    if (!success) { setError(error ?? 'Failed to join organisation'); return }
    // Reload tribes for new org
    const tribesData = await fetch(`/api/tribes/list?org_id=${orgLookup.id}`).then(r => r.json())
    setUserOrg(orgLookup as any)
    setOrgTribes(tribesData.data ?? [])
    setStep('has-org')
  }

  const createOrg = async () => {
    if (!newOrgName.trim()) return
    setLoading(true); setError(null)
    const res = await fetch('/api/organisations/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newOrgName.trim(), owner_phone: ownerPhone.trim(),
        owner_email: ownerEmail.trim(), owner_name: '',
        user_id: session!.user.id, email: session!.user.email,
        tournament_id: activeTournamentId,
      }),
    })
    const { data: org, error: orgErr } = await res.json()
    if (orgErr || !org) { setError(orgErr ?? 'Failed to create organisation'); setLoading(false); return }

    if (logoFile && session?.user.id) {
      const ext  = logoFile.name.split('.').pop()
      const path = `${session.user.id}/logo.${ext}`
      const { data: uploaded } = await supabase.storage
        .from('org-logos').upload(path, logoFile, { upsert: true })
      if (uploaded) {
        const { data: urlData } = supabase.storage.from('org-logos').getPublicUrl(path)
        await fetch('/api/organisations/create', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ org_id: org.id, logo_url: urlData.publicUrl, user_id: session!.user.id }),
        })
      }
    }
    setUserOrg(org)
    setStep('has-org')
    setLoading(false)
  }

  const joinTribeByCode = async (code: string) => {
    setLoading(true); setError(null)
    const res = await fetch('/api/tribes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invite_code: code }),
    })
    const { error } = await res.json()
    setLoading(false)
    if (error) { setError(error); return }
    onJoined()
  }

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setError('Logo must be under 2MB'); return }
    setLogoFile(file)
    const reader = new FileReader()
    reader.onloadend = () => setLogoPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  if (step === 'loading') return <div className="flex justify-center py-16"><Spinner className="w-7 h-7" /></div>

  // ── Step: User has org for this tournament — show tribe picker ────────────
  if (step === 'has-org') return (
    <div className="space-y-4">
      {userOrg && userOrg.slug !== 'public' && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <p className="text-[11px] text-blue-600 font-semibold uppercase tracking-wide mb-0.5">Your Organisation</p>
          <p className="text-sm font-bold text-blue-900">🏢 {userOrg.name}</p>
          <p className="text-[11px] text-blue-500 mt-0.5">All tribes shown below belong to your organisation.</p>
        </div>
      )}

      {orgTribes.length > 0 && (
        <TribeDropdown tribes={orgTribes} onJoin={joinTribeByCode} loading={loading} />
      )}

      {/* Manual invite code */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-600 mb-2">Or enter a tribe invite code</p>
        <div className="flex gap-2">
          <input type="text" value={tribeCode} onChange={e => setTribeCode(e.target.value.toUpperCase())}
            placeholder="E.G. XJAB4K89" maxLength={8}
            className="flex-1 px-3 py-2 text-sm font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white uppercase" />
          <button onClick={() => joinTribeByCode(tribeCode)} disabled={loading || tribeCode.length < 6}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
            Join
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
    </div>
  )

  // ── Step: No org for this tournament ────────────────────────────────────────
  if (step === 'no-org') return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <p className="text-sm font-semibold text-amber-800">No organisation linked to this tournament</p>
        <p className="text-[11px] text-amber-600 mt-0.5">
          Join an existing organisation for this tournament, or create a new one.
        </p>
      </div>

      {/* Existing orgs for this tournament */}
      {tournOrgs.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Available organisations</p>
          <div className="space-y-2">
            {tournOrgs.map((org: any) => (
              <div key={org.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                {org.logo_url
                  ? <img src={org.logo_url} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" alt={org.name} />
                  : <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center text-sm flex-shrink-0">🏢</div>
                }
                <span className="flex-1 text-sm font-semibold text-gray-800">{org.app_name || org.name}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-2">Enter the invite code from your organisation admin to join one of these.</p>
        </div>
      )}

      {/* Join by code */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">🔑 Join with invite code</p>
        <div className="flex gap-2 mb-2">
          <input type="text" value={orgCode} onChange={e => { setOrgCode(e.target.value.toUpperCase()); setOrgLookup(null); setOrgCodeErr(null) }}
            placeholder="8-digit org code"
            className="flex-1 px-3 py-2 text-sm font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white uppercase" />
          <button onClick={lookupOrgCode} disabled={lookingUp || orgCode.length < 4}
            className="px-3 py-2 border border-gray-300 hover:bg-gray-50 text-sm rounded-lg flex items-center gap-1.5">
            {lookingUp ? <Spinner className="w-4 h-4" /> : 'Look up'}
          </button>
        </div>
        {orgCodeErr && <p className="text-xs text-red-600 mb-2">{orgCodeErr}</p>}
        {orgLookup && (
          <div className="mb-2 p-3 bg-green-50 border border-green-200 rounded-xl">
            <p className="text-sm font-semibold text-green-800">🏢 {orgLookup.name}</p>
            <button onClick={joinOrg} disabled={loading}
              className="mt-2 w-full py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2">
              {loading && <Spinner className="w-4 h-4 text-white" />}
              Join {orgLookup.name}
            </button>
          </div>
        )}
      </div>

      {/* Create new org */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <button onClick={() => setStep('create-org')}
          className="w-full py-2.5 border-2 border-dashed border-gray-300 hover:border-green-400 text-gray-500 hover:text-green-700 text-sm font-medium rounded-xl transition-colors">
          + Create a new organisation for this tournament
        </button>
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
    </div>
  )

  // ── Step: Create org ──────────────────────────────────────────────────────
  if (step === 'create-org') return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <button onClick={() => setStep('no-org')} className="text-gray-400 hover:text-gray-600 text-lg">←</button>
        <p className="text-sm font-semibold text-gray-800">Create a new organisation</p>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">Organisation name *</label>
        <input type="text" value={newOrgName} onChange={e => setNewOrgName(e.target.value)}
          placeholder="e.g. Acme Corp"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">Contact phone</label>
        <input type="tel" value={ownerPhone} onChange={e => setOwnerPhone(e.target.value)}
          placeholder="+61 4XX XXX XXX"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">Contact email</label>
        <input type="email" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)}
          placeholder="admin@yourcompany.com"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">Logo <span className="text-gray-400 font-normal">(optional, max 2MB)</span></label>
        <div className="flex items-center gap-3">
          {logoPreview
            ? <img src={logoPreview} alt="Preview" className="w-12 h-12 rounded-lg object-cover border border-gray-200 flex-shrink-0" />
            : <div className="w-12 h-12 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-2xl flex-shrink-0">🏢</div>
          }
          <button type="button" onClick={() => fileRef.current?.click()}
            className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50">
            {logoFile ? 'Change logo' : 'Upload logo'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
        </div>
      </div>
      {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
      <button onClick={createOrg} disabled={loading || !newOrgName.trim()}
        className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2">
        {loading && <Spinner className="w-4 h-4 text-white" />}
        Create organisation →
      </button>
    </div>
  )

  return null
}


function PrizesDisplay({ orgId }: { orgId: string }) {
  const [prizes, setPrizes] = useState<any[]>([])
  useEffect(() => {
    fetch(`/api/org-prizes?org_id=${orgId}`).then(r => r.json()).then(d => setPrizes(d.data ?? []))
  }, [orgId])
  if (prizes.length === 0) return null
  const MEDALS = ['🥇','🥈','🥉','4️⃣','5️⃣']
  return (
    <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
      <p className="text-xs font-semibold text-amber-800 mb-2">🏆 Prizes</p>
      <div className="space-y-1">
        {prizes.map((p: any) => (
          <div key={p.place} className="flex items-center gap-2">
            <span className="text-sm">{MEDALS[p.place - 1] ?? `${p.place}th`}</span>
            <span className="text-xs text-gray-700">{p.description}</span>
            {p.sponsor && <span className="text-[10px] text-gray-400">· {p.sponsor}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main tribe page ───────────────────────────────────────────────────────────
export default function TribePage() {
  const { session, supabase } = useSupabase()
  const { timezone } = useTimezone()
  const [tribe,       setTribe]       = useState<TribeData | null>(null)
  const [tribePicksData,     setTribePicksData]     = useState<any | null>(null)
  const [activeTournamentId, setActiveTournamentId] = useState<string | null>(null)
  const [picksLoading,   setPicksLoading]   = useState(false)
  const [fixtures,    setFixtures]    = useState<Fixture[]>([])
  const [loading,     setLoading]     = useState(true)
  const [tab,         setTab]         = useState<MainTab>('leaderboard')

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
  const [chatTopic,   setChatTopic]   = useState<ChatTopic>('general')
  const [copied,      setCopied]      = useState(false)
  const myId = session?.user.id ?? ''

  const loadTribe = async () => {
    setLoading(true)
    // Resolve active tournament for the current user
    const { data: userRow } = await supabase
      .from('users').select('active_tournament_id').eq('id', session!.user.id).single()
    const tid = (userRow as any)?.active_tournament_id ?? null
    setActiveTournamentId(tid)

    const [tribeRes, fxRes] = await Promise.all([
      fetch('/api/tribes'),
      fetch(`/api/fixtures${tid ? `?tournament_id=${tid}` : ''}`),
    ])
    const [tribeData, fxData] = await Promise.all([tribeRes.json(), fxRes.json()])

    if (tribeData.data) {
      const raw = tribeData.data
      // Check tribe belongs to the active tournament
      if (tid && raw.tournament_id && raw.tournament_id !== tid) {
        // Tribe is for a different tournament — show NoTribePanel
        setTribe(null)
        setFixtures((fxData.data ?? []).map((f: any) => ({
          id: f.id, round: f.round, group: f.group, home: f.home, away: f.away,
          kickoff_utc: f.kickoff_utc, venue: f.venue, result: f.result ?? null,
        })))
        setLoading(false)
        return
      }
      // Fetch org name for display
      if (raw.org_id) {
        const { data: orgRow } = await supabase
          .from('organisations').select('name, logo_url').eq('id', raw.org_id).single()
        if (orgRow) raw._org = orgRow
      }
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
  if (!tribe)  return <NoTribePanel onJoined={loadTribe} activeTournamentId={activeTournamentId} />

  return (
    <div className="max-w-4xl mx-auto px-4 py-4">
      {/* Tribe header */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          {/* Org badge */}
          {(tribe as any)._org && (tribe as any)._org.name !== 'PUBLIC' && (
            <div className="flex items-center gap-1.5 mb-1.5">
              {(tribe as any)._org.logo_url && (
                <img src={(tribe as any)._org.logo_url} alt={(tribe as any)._org.name}
                  className="w-5 h-5 rounded object-cover" />
              )}
              <span className="text-xs font-medium text-blue-600">🏢 {(tribe as any)._org.name}</span>
            </div>
          )}
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

      {/* Prizes */}
      {(tribe as any).org_id && <PrizesDisplay orgId={(tribe as any).org_id} />}

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-4 w-fit">
        {(['leaderboard','picks','chat'] as MainTab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={clsx('px-4 py-1.5 text-xs font-medium rounded-md transition-colors',
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
            {t === 'leaderboard' ? '🏆 Standings' : t === 'picks' ? '📊 Picks' : '💬 Chat'}
          </button>
        ))}
      </div>

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
