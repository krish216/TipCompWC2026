import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import { SupabaseProvider } from '@/components/layout/SupabaseProvider'
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

  // Use service-role client for admin check — bypasses RLS so the query
  // always succeeds regardless of what policies are on admin_users
  let isAdmin = false
  if (session?.user?.id) {
    try {
      const adminClient = createAdminClient()
      const { data } = await adminClient
        .from('admin_users')
        .select('user_id')
        .eq('user_id', session.user.id)
        .single()
      isAdmin = !!data
    } catch {
      // If admin_users table doesn't exist yet, default to false
      isAdmin = false
    }
  }

  return (
    <html lang="en">
      <body className={inter.className}>
        <SupabaseProvider initialSession={session}>
          <Navbar isAdmin={isAdmin} />
          <main className="min-h-screen bg-gray-50">
            {children}
          </main>
          <Toaster
            position="top-right"
            toastOptions={{ duration: 3000, style: { fontSize: '13px' } }}
          />
        </SupabaseProvider>
      </body>
    </html>
  )
}
