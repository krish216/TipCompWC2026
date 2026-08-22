'use client'

import { usePathname } from 'next/navigation'

// Routes that render WITHOUT the TribePicks nav/banners/footer — standalone, co-branded
// pages that should not wear TribePicks' chrome (e.g. the PetzBFF quiz, the founder's
// second business). A bare route matches exactly or as a path prefix ("/petzbff/…").
const BARE_ROUTES = ['/petzbff']

function isBare(pathname: string): boolean {
  return BARE_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))
}

// Wraps the page body with the site chrome — except on bare routes, where only the page
// itself renders. usePathname resolves during SSR too, so bare pages never flash the
// navbar before hydration. `header` and `footer` are server-rendered nodes passed through
// from the root layout (nav + banners above, floating buttons + footer below).
export function SiteChrome({ header, footer, children }: {
  header: React.ReactNode
  footer: React.ReactNode
  children: React.ReactNode
}) {
  const pathname = usePathname()

  if (isBare(pathname)) {
    return <main className="min-h-screen bg-[#fdf8f2]">{children}</main>
  }

  return (
    <>
      {header}
      {/* pb-20 sm:pb-0: clears the fixed 56px bottom nav on mobile */}
      <main className="min-h-screen bg-gray-50 pb-20 sm:pb-0">{children}</main>
      {footer}
    </>
  )
}
