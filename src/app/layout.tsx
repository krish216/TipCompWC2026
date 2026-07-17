import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import { Suspense } from 'react'
import './globals.css'
import 'flag-icons/css/flag-icons.min.css'   // image-based flags (emoji flags don't render on Windows)
import { Toaster } from 'react-hot-toast'
import { Analytics } from '@vercel/analytics/next'
import { SupabaseProvider } from '@/components/layout/SupabaseProvider'
import { UserPrefsProvider } from '@/components/layout/UserPrefsContext'
import { Navbar } from '@/components/layout/Navbar'
import { EmailVerificationBanner } from '@/components/layout/EmailVerificationBanner'
import { EplPollBanner } from '@/components/layout/EplPollBanner'
import { FeedCtaLink } from '@/components/game/FeedCtaLink'
import { FeedbackButton } from '@/components/layout/FeedbackButton'
import { NpsPulse } from '@/components/game/NpsPulse'
import { RefCapture } from '@/components/layout/RefCapture'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { JsonLd } from '@/components/seo/JsonLd'
import { siteJsonLd, SITE_URL, SITE_NAME, SITE_TITLE, SITE_DESCRIPTION } from '@/lib/seo'

const inter = Inter({ subsets: ['latin'] })

// viewportFit=cover lets env(safe-area-inset-bottom) work on iPhone notch/home bar
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Product-level default title, inherited by pages that set none (e.g. the homepage).
  // NB: kept a plain string (not a { default, template }) on purpose — most pages already
  // hardcode "… | TribePicks" in their own title, so a suffixing template would double it.
  // Normalising those onto a template is a Phase 2 change.
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    // og:image is supplied site-wide by ./opengraph-image.tsx (pages can override).
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  // AdSense site verification: <meta name="google-adsense-account" ...>. Present
  // only once NEXT_PUBLIC_ADSENSE_CLIENT is set, so it's inert until configured.
  ...(process.env.NEXT_PUBLIC_ADSENSE_CLIENT
    ? { other: { 'google-adsense-account': process.env.NEXT_PUBLIC_ADSENSE_CLIENT } }
    : {}),
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()

  // The session handed to the client provider must NOT carry credentials. The browser
  // client rehydrates the full session (access + refresh tokens) from cookies via the
  // INITIAL_SESSION event right after mount, so embedding tokens in the server-rendered
  // HTML is needless exposure — markup can be cached by proxies/CDNs/browser history, and
  // a refresh token is long-lived. Strip the tokens but keep the user for a flicker-free
  // first paint; consumers that send Authorization headers only run post-hydration, by
  // which point the real session has repopulated from cookies.
  const clientSession = session && {
    ...session,
    access_token: '',
    refresh_token: '',
    provider_token: null,
    provider_refresh_token: null,
  }

  // Donations now flow through the gamified /feed page ("Feed the doggies") → the donation
  // Checkout Session (kind:'donation') → the Stripe webhook → the donations table.

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

  // Google AdSense loader — only injected once both env vars are set, so ads stay
  // fully dormant until configured (NEXT_PUBLIC_ADS_ENABLED + NEXT_PUBLIC_ADSENSE_CLIENT).
  const adsEnabled = process.env.NEXT_PUBLIC_ADS_ENABLED === 'true'
  const adsClient  = process.env.NEXT_PUBLIC_ADSENSE_CLIENT   // e.g. ca-pub-XXXXXXXXXXXXXXXX

  return (
    <html lang="en">
      <body className={inter.className}>
        {/* Site-wide structured data (Organization + WebSite + WebApplication) for search
            engines and AI answer engines. Server-rendered so it's in the initial HTML. */}
        <JsonLd data={siteJsonLd()} />
        {adsEnabled && adsClient && (
          <Script
            id="adsbygoogle-loader"
            strategy="afterInteractive"
            async
            crossOrigin="anonymous"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsClient}`}
          />
        )}
        <SupabaseProvider initialSession={clientSession || null}>
          <UserPrefsProvider>
            <Suspense fallback={<div className="h-12 bg-white border-b border-gray-200" />}>
              <Navbar isAdmin={isAdmin} />
            </Suspense>
            <EmailVerificationBanner />
            <EplPollBanner />
            {/* pb-20 sm:pb-0: clears the fixed 56px bottom nav on mobile */}
            <main className="min-h-screen bg-gray-50 pb-20 sm:pb-0">
              {children}
            </main>
            <Suspense fallback={null}><FeedbackButton /></Suspense>
            <Suspense fallback={null}><NpsPulse /></Suspense>
            <Suspense fallback={null}><RefCapture /></Suspense>
            <Toaster
              position="top-right"
              toastOptions={{ duration: 3000, style: { fontSize: '13px' } }}
            />
            {/* Bottom padding clears the fixed mobile bottom-nav (≈56px + safe area);
                reset to normal on sm+ where that nav is hidden. */}
            <footer className="border-t border-gray-200 bg-white mt-8 px-4 pt-4 pb-[calc(5rem_+_env(safe-area-inset-bottom))] sm:pb-4">
              <div className="max-w-4xl mx-auto space-y-3">
                {/* Nav links — single centred wrapping row */}
                <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] text-gray-400">
                  <a href="/teams" className="hover:text-gray-600 transition-colors">Teams</a>
                  <a href="/groups" className="hover:text-gray-600 transition-colors">Groups</a>
                  <a href="/recaps" className="hover:text-gray-600 transition-colors">Recaps</a>
                  <a href="/faq" className="hover:text-gray-600 transition-colors">FAQ</a>
                  <a href="/rules/wc2026" className="hover:text-gray-600 transition-colors">Rules</a>
                  <a href="/privacy" className="hover:text-gray-600 underline transition-colors">Privacy</a>
                  <a href="mailto:tribepicks@gmail.com" className="hover:text-gray-600 transition-colors">Contact</a>
                </nav>
                {/* Disclaimer — states clearly this is a free-to-play prediction game with
                    no real-money betting/gambling (for reviewers, sponsors, and users). */}
                <p className="text-center text-[11px] text-gray-400">
                  TribePicks is a <strong className="font-semibold">free-to-play</strong> football prediction game — <strong className="font-semibold">no real-money betting or gambling</strong>. Unofficial fan competition, not affiliated with FIFA.
                </p>
                {/* Support button */}
                <div className="flex justify-center">
                  <FeedCtaLink source="footer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors">
                    🐾 Feed the doggies
                  </FeedCtaLink>
                </div>
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
        <Analytics />
      </body>
    </html>
  )
}
