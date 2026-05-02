import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import { SupabaseProvider } from '@/components/layout/SupabaseProvider'
import { UserPrefsProvider } from '@/components/layout/UserPrefsContext'
import { Navbar } from '@/components/layout/Navbar'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

const inter = Inter({ subsets: ['latin'] })

// viewportFit=cover lets env(safe-area-inset-bottom) work on iPhone notch/home bar
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: 'TribePicks',
  description: 'Predict every match of the 2026 FIFA World Cup. Compete with your tribe.',
  icons: {
    icon: [{ url: '/favicon.ico', type: 'image/x-icon' }],
    shortcut: '/favicon.ico',
  },
  openGraph: {
    title: 'TribePicks',
    description: 'Predict every match. Beat your tribe. Win bragging rights.',
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()

  // Check both admin roles using service-role client (bypasses RLS)
  let isAdmin    = false
  if (session?.user?.id) {
    const adminClient = createAdminClient()

    try {
      const { data: adminRow } = await adminClient
        .from('admin_users').select('user_id').eq('user_id', session.user.id).maybeSingle()
      isAdmin = !!adminRow
    } catch { isAdmin = false }


  }

  return (
    <html lang="en">
      <body className={inter.className}>
        <SupabaseProvider initialSession={session}>
          <UserPrefsProvider>
            <Navbar isAdmin={isAdmin} />
            {/* pb-20 sm:pb-0: clears the fixed 56px bottom nav on mobile */}
            <main className="min-h-screen bg-gray-50 pb-20 sm:pb-0">
              {children}
            </main>
            <Toaster
              position="top-right"
              toastOptions={{ duration: 3000, style: { fontSize: '13px' } }}
            />
            <footer className="border-t border-gray-200 bg-white mt-8 py-4 px-4">
              <div className="max-w-4xl mx-auto flex items-center justify-between flex-wrap gap-2 text-[11px] text-gray-400">
                <span>TribePicks — unofficial fan competition, not affiliated with FIFA</span>
                <div className="flex items-center gap-4">
                  <a href="/privacy" className="hover:text-gray-600 underline transition-colors">Privacy Policy</a>
                  <a href="/rules/wc2026" className="hover:text-gray-600 transition-colors">Rules</a>
                </div>
              </div>
            </footer>
          </UserPrefsProvider>
        </SupabaseProvider>
      </body>
    </html>
  )
}
