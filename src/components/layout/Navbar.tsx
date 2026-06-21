'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { clsx } from 'clsx'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { Avatar, RemoveAdsButton } from '@/components/ui'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'

const CHAT_SEEN_KEY = (tribeId: string) => `tc_chat_seen_${tribeId}`

interface AppNotification {
  id:         string
  type:       string
  title:      string
  body?:      string | null
  data?:      Record<string, unknown> | null
  read_at:    string | null
  created_at: string
}

const NOTIF_ICONS: Record<string, string> = {
  round_deadline:    '⏰',
  score_update:      '⚽',
  leaderboard_move:  '📈',
  comp_announcement: '📢',
  member_joined:     '🙋',
  member_milestone:  '🎉',
  low_tipping_alert: '⚠️',
  round_complete:    '🏁',
  weekly_report:     '📋',
  feedback_reply:    '💬',
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function Navbar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname      = usePathname()
  const router        = useRouter()
  const searchParams  = useSearchParams()
  const { supabase, session } = useSupabase()
  const { isCompAdmin, selectedCompId, selectedTribeId } = useUserPrefs()
  const [mounted,      setMounted]      = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [hasUnread,    setHasUnread]    = useState(false)
  const lastSeenRef = useRef<string | null>(null)
  useEffect(() => setMounted(true), [])

  const [notifOpen,    setNotifOpen]    = useState(false)
  const [notifs,       setNotifs]       = useState<AppNotification[]>([])
  const [unreadCount,  setUnreadCount]  = useState(0)
  const [notifLoading, setNotifLoading] = useState(false)

  // Mark chat as seen when on /tribe
  useEffect(() => {
    if (pathname === '/tribe' && selectedTribeId) {
      const now = new Date().toISOString()
      localStorage.setItem(CHAT_SEEN_KEY(selectedTribeId), now)
      lastSeenRef.current = now
      setHasUnread(false)
    }
  }, [pathname, selectedTribeId])

  // Subscribe to tribe chat for unread indicator
  useEffect(() => {
    if (!selectedTribeId || !session) return
    const stored = localStorage.getItem(CHAT_SEEN_KEY(selectedTribeId))
    lastSeenRef.current = stored

    const channel = supabase
      .channel(`navbar-chat-${selectedTribeId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages',
        filter: `tribe_id=eq.${selectedTribeId}`,
      }, payload => {
        if (pathname === '/tribe') {
          const now = new Date().toISOString()
          localStorage.setItem(CHAT_SEEN_KEY(selectedTribeId), now)
          lastSeenRef.current = now
          return
        }
        const msgTime = (payload.new as any).created_at
        if (!lastSeenRef.current || msgTime > lastSeenRef.current) {
          setHasUnread(true)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase, session, selectedTribeId, pathname])

  // Fetch notification count on session start
  useEffect(() => {
    if (!session) return
    fetch('/api/notifications')
      .then(r => r.json())
      .then(({ data, unread_count }) => {
        if (Array.isArray(data))               setNotifs(data)
        if (typeof unread_count === 'number')  setUnreadCount(unread_count)
      })
      .catch(() => {})
  }, [session])

  // Realtime: increment badge when a new notification is inserted for this user
  useEffect(() => {
    if (!session) return
    const channel = supabase
      .channel(`notifs-${session.user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${session.user.id}`,
      }, payload => {
        const n = payload.new as AppNotification
        setNotifs(prev => [n, ...prev].slice(0, 30))
        setUnreadCount(c => c + 1)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, session])

  const openNotifPanel = async () => {
    setNotifOpen(true)
    setNotifLoading(true)
    try {
      const { data, unread_count } = await fetch('/api/notifications').then(r => r.json())
      if (Array.isArray(data))              setNotifs(data)
      if (typeof unread_count === 'number') setUnreadCount(unread_count)
    } catch {}
    setNotifLoading(false)
  }

  const handleMarkAllRead = async () => {
    setNotifs(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
    setUnreadCount(0)
    await fetch('/api/notifications', { method: 'POST' }).catch(() => {})
  }

  const signOut = async () => {
    setUserMenuOpen(false)
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const isActive = (href: string) => {
    const [hPath, hQuery] = href.split('?')
    if (hPath === '/') return pathname === '/'
    if (!pathname.startsWith(hPath)) return false
    if (hQuery) {
      const tabParam  = new URLSearchParams(hQuery).get('tab')
      const currentTab = searchParams.get('tab')
      return tabParam === (currentTab ?? 'tipsters')
    }
    return true
  }

  const isCompAdminPage = pathname.startsWith('/comp-admin')

  // Desktop nav items (shown in top bar on sm+)
  const desktopItems = isCompAdminPage
    ? [
        { href: '/',                           label: 'My Comps'  },
        { href: '/comp-admin?tab=tipsters',    label: 'Tipsters'  },
        { href: '/comp-admin?tab=tribes',      label: 'Tribes'    },
        { href: '/comp-admin?tab=insights',    label: 'Insights'  },
      ]
    : [
        { href: '/',            label: 'My Comps'   },
        ...(selectedCompId ? [{ href: '/predict', label: 'My Tips' }] : []),
        { href: '/leaderboard', label: 'ScoreBoard' },
        { href: '/tribe',       label: 'My Tribe'   },
        // Bracket Challenge — live for all players.
        { href: '/bracket', label: 'Bracket' },
      ]

  // Mobile bottom tab items
  const bottomTabs = isCompAdminPage
    ? [
        { href: '/',                        icon: '🏠', label: 'Home',      disabled: false },
        { href: '/comp-admin?tab=tipsters', icon: '🙋', label: 'Tipsters',  disabled: false },
        { href: '/comp-admin?tab=tribes',   icon: '👥', label: 'Tribes',    disabled: false },
        { href: '/comp-admin?tab=insights', icon: '📊', label: 'Insights',  disabled: false },
      ]
    : [
        { href: '/',            icon: '🏠', label: 'Home',    disabled: false           },
        { href: '/predict',     icon: '🎯', label: 'My Tips', disabled: !selectedCompId },
        { href: '/leaderboard', icon: '🏆', label: 'Scores',  disabled: false           },
        { href: '/tribe',       icon: '👥', label: 'Tribe',   disabled: false           },
        // Bracket Challenge — live for all players.
        { href: '/bracket', icon: '🥊', label: 'Bracket', disabled: false },
        ...(isCompAdmin && selectedCompId
          ? [{ href: '/comp-admin', icon: '⚙️', label: 'Manage', disabled: false }]
          : []),
      ]

  return (
    <>
      {/* ── Top bar ────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex items-center justify-between h-12">

            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity flex-shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="TribePicks" className="h-7 w-auto"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              <span className="font-black text-emerald-800 text-sm tracking-tight">TribePicks</span>
            </Link>

            {/* Desktop nav links — hidden below sm breakpoint */}
            {session && (
              <div className="hidden sm:flex items-center gap-0.5 overflow-x-auto">
                {desktopItems.map(item => (
                  <Link key={item.href} href={item.href}
                    className={clsx(
                      'relative px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                      isActive(item.href)
                        // Match the comp-admin blue theme when inside comp-admin.
                        ? (isCompAdminPage ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700')
                        : isCompAdminPage
                          ? 'text-gray-500 hover:text-blue-700 hover:bg-blue-50'
                          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    )}>
                    {item.label}
                    {item.href === '/tribe' && hasUnread && (
                      <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-green-500 rounded-full" />
                    )}
                  </Link>
                ))}
                {isCompAdmin && selectedCompId && !isCompAdminPage && (
                  <Link href="/comp-admin"
                    className={clsx(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                      isActive('/comp-admin')
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50'
                    )}>
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <path d="M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" fill="currentColor"/>
                      <path fillRule="evenodd" clipRule="evenodd" d="M5.612 1.223a.75.75 0 0 1 .734-.596h1.308a.75.75 0 0 1 .734.596l.17.859a4.02 4.02 0 0 1 .748.435l.824-.29a.75.75 0 0 1 .905.317l.654 1.133a.75.75 0 0 1-.15.937l-.642.568a4.08 4.08 0 0 1 0 .836l.642.568a.75.75 0 0 1 .15.937l-.654 1.133a.75.75 0 0 1-.905.318l-.824-.29a4.02 4.02 0 0 1-.748.434l-.17.86a.75.75 0 0 1-.734.596H6.346a.75.75 0 0 1-.734-.596l-.17-.86a4.02 4.02 0 0 1-.748-.434l-.824.29a.75.75 0 0 1-.905-.318L2.311 8.323a.75.75 0 0 1 .15-.937l.642-.568a4.08 4.08 0 0 1 0-.836l-.642-.568a.75.75 0 0 1-.15-.937l.654-1.133a.75.75 0 0 1 .905-.318l.824.29a4.02 4.02 0 0 1 .748-.434l.17-.86ZM7 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" fill="currentColor"/>
                    </svg>
                    Manage
                  </Link>
                )}
                {isAdmin && (
                  <Link href="/admin"
                    className={clsx(
                      'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                      isActive('/admin') && !pathname.startsWith('/comp-admin')
                        ? 'bg-red-50 text-red-700'
                        : 'text-red-400 hover:text-red-600 hover:bg-red-50'
                    )}>
                    Tournament
                  </Link>
                )}
              </div>
            )}

            {/* User section */}
            {session ? (
              <div className="relative flex items-center gap-2 flex-shrink-0">
                {/* Notification bell — visible on all screen sizes */}
                <button
                  onClick={() => notifOpen ? setNotifOpen(false) : openNotifPanel()}
                  className="relative w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 transition-colors"
                  aria-label="Notifications">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                  </svg>
                  {unreadCount > 0 && (
                    <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white leading-none">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {/* Notification dropdown panel */}
                {notifOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                      {/* Header */}
                      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                        <p className="text-sm font-bold text-gray-900">Notifications</p>
                        {unreadCount > 0 && (
                          <button
                            onClick={handleMarkAllRead}
                            className="text-xs text-green-600 hover:text-green-700 font-medium">
                            Mark all read
                          </button>
                        )}
                      </div>

                      {/* List */}
                      <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                        {notifLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <svg className="w-5 h-5 animate-spin text-gray-300" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                            </svg>
                          </div>
                        ) : notifs.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-10 gap-2">
                            <span className="text-3xl">🔔</span>
                            <p className="text-sm text-gray-400">No notifications yet</p>
                          </div>
                        ) : (
                          notifs.map(n => {
                            const href = (n.data as any)?.href as string | undefined
                            return (
                            <div key={n.id}
                              onClick={href ? () => { handleMarkAllRead(); setNotifOpen(false); router.push(href) } : undefined}
                              className={clsx(
                                'flex items-start gap-3 px-4 py-3 transition-colors',
                                href && 'cursor-pointer',
                                !n.read_at ? 'bg-green-50 hover:bg-green-100' : 'hover:bg-gray-50'
                              )}>
                              <span className="text-lg leading-none mt-0.5 flex-shrink-0">
                                {NOTIF_ICONS[n.type] ?? '🔔'}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className={clsx('text-xs leading-snug', !n.read_at ? 'font-semibold text-gray-900' : 'font-medium text-gray-700')}>
                                  {n.title}
                                </p>
                                {n.body && (
                                  <p className="text-[11px] text-gray-500 mt-0.5 leading-snug line-clamp-2">{n.body}</p>
                                )}
                                <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                              </div>
                              {!n.read_at && (
                                <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0 mt-1.5" />
                              )}
                            </div>
                            )
                          })
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Chat icon with unread badge — mobile only, hidden on comp-admin */}
                <Link href="/tribe"
                  className={clsx('sm:hidden relative w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 transition-colors', isCompAdminPage && 'hidden')}
                  aria-label="Tribe chat">
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v7a2 2 0 01-2 2H7l-4 3V5z" fill="currentColor" fillOpacity=".15" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  </svg>
                  {hasUnread && (
                    <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white" />
                  )}
                </Link>

                {/* Avatar button — toggles dropdown on mobile, links to /settings on desktop */}
                <button
                  onClick={() => setUserMenuOpen(o => !o)}
                  className="sm:hidden focus:outline-none"
                  aria-label="Account menu">
                  <Avatar
                    name={session.user.user_metadata?.display_name ?? session.user.email ?? '?'}
                    src={session.user.user_metadata?.avatar_url}
                    size="xs"
                    className="hover:ring-2 hover:ring-green-400 transition-all cursor-pointer"
                  />
                </button>
                <Link href="/settings" className="hidden sm:block">
                  <Avatar
                    name={session.user.user_metadata?.display_name ?? session.user.email ?? '?'}
                    src={session.user.user_metadata?.avatar_url}
                    size="xs"
                    className="hover:ring-2 hover:ring-green-400 transition-all cursor-pointer"
                  />
                </Link>
                <button onClick={signOut}
                  className="hidden sm:block text-xs text-gray-400 hover:text-gray-600 transition-colors">
                  Sign out
                </button>

                {/* Mobile dropdown menu */}
                {userMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 w-44 bg-white rounded-xl shadow-lg border border-gray-100 z-50 py-1 overflow-hidden">
                      <Link href="/settings"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                        <span>⚙️</span> Settings
                      </Link>
                      {/* Self-hides unless ads are on and the user isn't already ad-free */}
                      <RemoveAdsButton variant="menu" />
                      <button onClick={signOut}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
                        <span>🚪</span> Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login?tab=login" className="text-xs text-gray-500 hover:text-gray-700">Sign in</Link>
                <Link href="/login?tab=register"
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors">
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* ── Bottom tab bar — mobile only (hidden on sm+) ─────────── */}
      {mounted && session && (
        <nav className="sm:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-gray-100 shadow-[0_-1px_8px_rgba(0,0,0,0.06)] pb-safe">
          <div className="flex">
            {bottomTabs.map(tab => {
              const active = isActive(tab.href)
              return (
                <Link
                  key={tab.href}
                  href={tab.disabled ? '#' : tab.href}
                  onClick={tab.disabled ? e => e.preventDefault() : undefined}
                  className={clsx(
                    'relative flex-1 flex flex-col items-center justify-center pt-2 pb-1.5 gap-0.5 min-h-[56px] transition-colors select-none',
                    active         ? (isCompAdminPage ? 'text-blue-700' : 'text-green-700')
                    : tab.disabled ? 'text-gray-300 cursor-not-allowed'
                    :                'text-gray-400 active:text-gray-600'
                  )}>
                  {/* Active indicator — pill at top of tab (blue inside comp-admin) */}
                  <span className={clsx(
                    'absolute top-0 left-1/2 -translate-x-1/2 h-[3px] rounded-full transition-all duration-200',
                    active ? (isCompAdminPage ? 'w-8 bg-blue-500' : 'w-8 bg-green-500') : 'w-0'
                  )} />
                  <span className="text-[22px] leading-none">{tab.icon}</span>
                  <span className={clsx(
                    'text-[10px] leading-none tracking-wide',
                    active ? 'font-bold' : 'font-medium'
                  )}>
                    {tab.label}
                  </span>
                </Link>
              )
            })}
          </div>
        </nav>
      )}
    </>
  )
}
