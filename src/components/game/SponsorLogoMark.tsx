import { clsx } from 'clsx'

// Sponsor logo, backed per surface so it stays visible regardless of its ink tone:
// a dark-ink logo gets a light chip on dark surfaces; a light-ink logo gets a dark
// chip on light surfaces. Renders the mark only — callers add any link wrapper.
// Shared by the bracket builder header and the leaderboard co-branded header.
export function SponsorLogoMark({ logo, name, logoTone, surface, className }: {
  logo?: string | null
  name?: string | null
  logoTone?: string | null
  surface: 'dark' | 'light'
  className?: string
}) {
  const tone = logoTone === 'light' ? 'light' : 'dark'
  const chip =
    surface === 'dark'  && tone === 'dark'  ? 'bg-white rounded-xl px-3.5 py-2.5 shadow-sm' :
    surface === 'light' && tone === 'light' ? 'bg-green-900 rounded-xl px-3.5 py-2.5' :
    'drop-shadow'
  return logo
    ? <img src={logo} alt={name || 'Sponsor'} className={clsx('object-contain', chip, className)} />
    : <span className={clsx('font-bold', surface === 'dark' ? 'text-white' : 'text-gray-900')}>{name}</span>
}
