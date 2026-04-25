'use client'

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

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const navItems = [
    { href: '/',            label: 'My Comps'  },
    ...(selectedCompId ? [{ href: '/predict', label: 'My Tips' }] : []),
    { href: '/leaderboard', label: 'ScoreBoard' },
    { href: '/tribe',       label: 'My Tribe'  },
  ]

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="max-w-3xl mx-auto px-4">
        <div className="flex items-center justify-between h-12">
          {/* Logo — links to home */}
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="TribePicks" className="h-7 w-auto" onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
            <span className="hidden sm:inline font-black text-emerald-800 text-sm tracking-tight">TribePicks</span>
          </Link>

          {/* Nav links — only shown when logged in */}
          {session && (
            <div className="flex items-center gap-0.5 overflow-x-auto">
              {navItems.map(item => (
                <Link key={item.href} href={item.href}
                  className={clsx('px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                    (item.href === '/' ? pathname === '/' : pathname.startsWith(item.href))
                      ? 'bg-green-50 text-green-700'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  )}>
                  {item.label}
                </Link>
              ))}
              {isCompAdmin && selectedCompId && (
                <Link href="/comp-admin"
                  className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                    pathname.startsWith('/comp-admin') ? 'bg-blue-50 text-blue-700' : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50'
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
                  className={clsx('px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                    pathname.startsWith('/admin') && !pathname.startsWith('/comp-admin') ? 'bg-red-50 text-red-700' : 'text-red-400 hover:text-red-600 hover:bg-red-50')}>
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
              <button onClick={signOut} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login?tab=login" className="text-xs text-gray-500 hover:text-gray-700">Sign in</Link>
              <Link href="/login?tab=register" className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors">
                Register
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
