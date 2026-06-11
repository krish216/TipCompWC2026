import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Suspense } from 'react'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import { SupabaseProvider } from '@/components/layout/SupabaseProvider'
import { UserPrefsProvider } from '@/components/layout/UserPrefsContext'
import { Navbar } from '@/components/layout/Navbar'
import { EmailVerificationBanner } from '@/components/layout/EmailVerificationBanner'
import { FeedbackButton } from '@/components/layout/FeedbackButton'
import { RefCapture } from '@/components/layout/RefCapture'
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
  openGraph: {
    title: 'TribePicks',
    description: 'Predict every match. Beat your tribe. Win bragging rights.',
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()

  // Donation link (Stripe Payment Link, "customers choose what to pay"). Defaults to the
  // live link; DONATE_URL env overrides it without a code change. When a user is signed in
  // we pass client_reference_id (their id) and prefilled_email so the webhook can attribute
  // the donation back to them.
  const donateBase = process.env.DONATE_URL || 'https://buy.stripe.com/4gM3cubaUccifOg0igebu00'
  let donateHref: string | null = null
  if (donateBase) {
    const params = new URLSearchParams()
    if (session?.user?.id)    params.set('client_reference_id', session.user.id)
    if (session?.user?.email) params.set('prefilled_email', session.user.email)
    const qs = params.toString()
    donateHref = qs ? `${donateBase}?${qs}` : donateBase
  }

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
            <Suspense fallback={<div className="h-12 bg-white border-b border-gray-200" />}>
              <Navbar isAdmin={isAdmin} />
            </Suspense>
            <EmailVerificationBanner />
            {/* pb-20 sm:pb-0: clears the fixed 56px bottom nav on mobile */}
            <main className="min-h-screen bg-gray-50 pb-20 sm:pb-0">
              {children}
            </main>
            <FeedbackButton />
            <Suspense fallback={null}><RefCapture /></Suspense>
            <Toaster
              position="top-right"
              toastOptions={{ duration: 3000, style: { fontSize: '13px' } }}
            />
            {/* Bottom padding clears the fixed mobile bottom-nav (≈56px + safe area);
                reset to normal on sm+ where that nav is hidden. */}
            <footer className="border-t border-gray-200 bg-white mt-8 px-4 pt-4 pb-[calc(5rem_+_env(safe-area-inset-bottom))] sm:pb-4">
              <div className="max-w-4xl mx-auto space-y-3">
                {/* Top row — disclaimer + nav links */}
                <div className="flex items-center justify-between flex-wrap gap-2 text-[11px] text-gray-400">
                  <span>TribePicks — unofficial fan competition, not affiliated with FIFA</span>
                  <div className="flex items-center gap-4">
                    <a href="/faq" className="hover:text-gray-600 transition-colors">FAQ</a>
                    <a href="mailto:tribepicks@gmail.com" className="hover:text-gray-600 transition-colors">Contact</a>
                    {donateHref && (
                      <a href={donateHref} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-emerald-600 hover:text-emerald-700 transition-colors">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </svg>
                        Support us
                      </a>
                    )}
                    <a href="/privacy" className="hover:text-gray-600 underline transition-colors">Privacy Policy</a>
                    <a href="/rules/wc2026" className="hover:text-gray-600 transition-colors">Rules</a>
                  </div>
                </div>
                {/* Support button */}
                {donateHref && (
                  <div className="flex justify-center">
                    <a href={donateHref} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                      </svg>
                      Support TribePicks
                    </a>
                  </div>
                )}
                {/* Bottom row — social icons */}
                <div className="flex items-center justify-center gap-4">
                  {/* Facebook */}
                  <a href="https://www.facebook.com/TribePicks" target="_blank" rel="noopener noreferrer" aria-label="Facebook"
                    className="text-gray-300 hover:text-gray-500 transition-colors">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
                    </svg>
                  </a>
                  {/* Instagram */}
                  <a href="https://www.instagram.com/tribepicks.app/" target="_blank" rel="noopener noreferrer" aria-label="Instagram"
                    className="text-gray-300 hover:text-gray-500 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                      <circle cx="12" cy="12" r="4"/>
                      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none"/>
                    </svg>
                  </a>
                  {/* X / Twitter */}
                  <a href="https://x.com/TribePicks" target="_blank" rel="noopener noreferrer" aria-label="X"
                    className="text-gray-300 hover:text-gray-500 transition-colors">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                  </a>
                  {/* Reddit */}
                  <a href="https://www.reddit.com/user/TribePicks/" target="_blank" rel="noopener noreferrer" aria-label="Reddit"
                    className="text-gray-300 hover:text-gray-500 transition-colors">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
                    </svg>
                  </a>
                  {/* LinkedIn */}
                  <a href="https://www.linkedin.com/company/Tribepicks" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn"
                    className="text-gray-300 hover:text-gray-500 transition-colors">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2z"/>
                      <circle cx="4" cy="4" r="2"/>
                    </svg>
                  </a>
                  {/* TikTok */}
                  <a href="https://www.tiktok.com/@tribepicks" target="_blank" rel="noopener noreferrer" aria-label="TikTok"
                    className="text-gray-300 hover:text-gray-500 transition-colors">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z"/>
                    </svg>
                  </a>
                </div>
              </div>
            </footer>
          </UserPrefsProvider>
        </SupabaseProvider>
      </body>
    </html>
  )
}
