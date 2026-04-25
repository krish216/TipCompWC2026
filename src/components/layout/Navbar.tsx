'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { clsx } from 'clsx'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { Avatar } from '@/components/ui'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'

export function Navbar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname()
  const router   = useRouter()
  const { supabase, session } = useSupabase()
  const { isCompAdmin, selectedCompId } = useUserPrefs()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  // Desktop nav items (shown in top bar on sm+)
  const desktopItems = [
    { href: '/',            label: 'My Comps'   },
    ...(selectedCompId ? [{ href: '/predict', label: 'My Tips' }] : []),
    { href: '/leaderboard', label: 'ScoreBoard'  },
    { href: '/tribe',       label: 'My Tribe'   },
  ]

  // Mobile bottom tab items (4 always + optional Manage)
  const bottomTabs = [
    { href: '/',            icon: '🏠', label: 'Home',   disabled: false           },
    { href: '/predict',     icon: '🎯', label: 'My Tip', disabled: !selectedCompId },
    { href: '/leaderboard', icon: '🏆', label: 'Scores', disabled: false           },
    { href: '/tribe',       icon: '👥', label: 'Tribe',  disabled: false           },
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
                      'px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                      isActive(item.href)
                        ? 'bg-green-50 text-green-700'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    )}>
                    {item.label}
                  </Link>
                ))}
                {isCompAdmin && selectedCompId && (
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
              <div className="flex items-center gap-2 flex-shrink-0">
                <Link href="/settings">
                  <Avatar
                    name={session.user.user_metadata?.display_name ?? session.user.email ?? '?'}
                    src={session.user.user_metadata?.avatar_url}
                    size="xs"
                    className="hover:ring-2 hover:ring-green-400 transition-all cursor-pointer"
                  />
                </Link>
                {/* Sign out only visible on desktop — mobile users sign out via Settings */}
                <button onClick={signOut}
                  className="hidden sm:block text-xs text-gray-400 hover:text-gray-600 transition-colors">
                  Sign out
                </button>
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
                    active         ? 'text-green-700'
                    : tab.disabled ? 'text-gray-300 cursor-not-allowed'
                    :                'text-gray-400 active:text-gray-600'
                  )}>
                  {/* Active indicator — green pill at top of tab */}
                  <span className={clsx(
                    'absolute top-0 left-1/2 -translate-x-1/2 h-[3px] rounded-full transition-all duration-200',
                    active ? 'w-8 bg-green-500' : 'w-0'
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
