import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import { SupabaseProvider } from '@/components/layout/SupabaseProvider'
import { UserPrefsProvider } from '@/components/layout/UserPrefsContext'
import { Navbar } from '@/components/layout/Navbar'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'TipComp 2026',
  description: 'Predict every match of the 2026 FIFA World Cup. Compete with your tribe.',
  openGraph: {
    title: 'TipComp 2026',
    description: 'Predict every match. Beat your tribe. Win bragging rights.',
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()

  // Check both admin roles using service-role client (bypasses RLS)
  let isAdmin    = false
  let isCompAdmin = false
  if (session?.user?.id) {
    const adminClient = createAdminClient()

    try {
      const { data: adminRow } = await adminClient
        .from('admin_users').select('user_id').eq('user_id', session.user.id).maybeSingle()
      isAdmin = !!adminRow
    } catch { isAdmin = false }

    try {
      const { data: compAdminRows } = await (adminClient.from('comp_admins') as any)
        .select('user_id').eq('user_id', session.user.id).limit(1)
      isCompAdmin = !!(compAdminRows && compAdminRows.length > 0)
    } catch { isCompAdmin = false }
  }

  return (
    <html lang="en">
      <body className={inter.className}>
        <SupabaseProvider initialSession={session}>
          <UserPrefsProvider>
            <Navbar isAdmin={isAdmin} isCompAdmin={isCompAdmin} />
            <main className="min-h-screen bg-gray-50">
              {children}
            </main>
            <Toaster
              position="top-right"
              toastOptions={{ duration: 3000, style: { fontSize: '13px' } }}
            />
            <footer className="border-t border-gray-200 bg-white mt-8 py-4 px-4">
              <div className="max-w-4xl mx-auto flex items-center justify-between flex-wrap gap-2 text-[11px] text-gray-400">
                <span>TipComp 2026 — unofficial fan competition, not affiliated with FIFA</span>
                <div className="flex items-center gap-4">
                  <a href="/privacy" className="hover:text-gray-600 underline transition-colors">Privacy Policy</a>
                  <a href="/rules"   className="hover:text-gray-600 transition-colors">Rules</a>
                </div>
              </div>
            </footer>
          </UserPrefsProvider>
        </SupabaseProvider>
      </body>
    </html>
  )
}
