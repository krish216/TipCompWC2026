'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { clsx } from 'clsx'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { Avatar } from '@/components/ui'

const NAV = [
  { href: '/predict',     label: 'Predict' },
  { href: '/leaderboard', label: 'ScoreBoard' },
  { href: '/tribe',       label: 'Join tribe' },
  { href: '/rules',       label: 'Rules' },
]

export function Navbar({ isAdmin = false, isCompAdmin = false }: { isAdmin?: boolean; isCompAdmin?: boolean }) {
  const pathname = usePathname()
  const router   = useRouter()
  const { supabase, session } = useSupabase()

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="max-w-3xl mx-auto px-4">
        <div className="flex items-center justify-between h-12">
          {/* Logo — links to home */}
          <Link href="/" className="flex items-center gap-2 font-semibold text-sm text-gray-900 hover:text-green-700 transition-colors">
            <span className="text-lg">⚽</span>
            <span className="hidden sm:inline">TipComp</span>
          </Link>

          {/* Nav links — only shown when logged in */}
          {session && (
            <div className="flex items-center gap-0.5 overflow-x-auto">
              {NAV.map(item => (
                <Link key={item.href} href={item.href}
                  className={clsx('px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                    pathname.startsWith(item.href) ? 'bg-green-50 text-green-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50')}>
                  {item.label}
                </Link>
              ))}
              {isAdmin && (
                <Link href="/admin"
                  className={clsx('px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                    pathname.startsWith('/admin') && !pathname.startsWith('/org-admin') ? 'bg-red-50 text-red-700' : 'text-red-400 hover:text-red-600 hover:bg-red-50')}>
                  Tournament
                </Link>
              )}
              {isCompAdmin && (
                <Link href="/org-admin"
                  className={clsx('px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                    pathname.startsWith('/org-admin') ? 'bg-blue-50 text-blue-700' : 'text-blue-400 hover:text-blue-600 hover:bg-blue-50')}>
                  Org Admin
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
              <Link href="/login" className="text-xs text-gray-500 hover:text-gray-700">Sign in</Link>
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
