'use client'

import { clsx } from 'clsx'
import Link from 'next/link'
import { Avatar } from '@/components/ui'

// "🧑‍✈️ Run by [name]" — surfaces the Comp-Chief's identity to members so a comp feels
// run by a real person, not a faceless system. `inline` for cards/headers, `card` for a
// standalone block (e.g. the post-join screen). Pass `href` to link to the Chief profile.
// Shown on the ✔ so members know exactly what it attests to (not a prize guarantee).
export const VERIFIED_TOOLTIP = 'Verified Chief: confirmed email and a real track record (5+ active tipsters). Identity only — not a guarantee of any prize.'

function VerifiedTick() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 flex-shrink-0" aria-label="Verified Chief">
      <title>{VERIFIED_TOOLTIP}</title>
      <path fill="#0F9D6B" d="M12 2l2.4 1.8 3 .1 1 2.8 2.4 1.7-.9 2.9.9 2.9-2.4 1.7-1 2.8-3 .1L12 22l-2.4-1.8-3-.1-1-2.8L3.2 15.5l.9-2.9-.9-2.9 2.4-1.7 1-2.8 3-.1z"/>
      <path fill="#fff" d="M10.6 14.6l-2-2-1.2 1.2 3.2 3.2 5.6-5.6-1.2-1.2z"/>
    </svg>
  )
}

export function CompChiefBadge({
  name, avatarUrl, href, verified = false, variant = 'inline', className,
}: {
  name: string
  avatarUrl?: string | null
  href?: string | null
  verified?: boolean
  variant?: 'inline' | 'card'
  className?: string
}) {
  const inner = variant === 'card' ? (
    <span className="inline-flex items-center gap-2 rounded-full bg-gray-50 border border-gray-200 pl-1.5 pr-3 py-1 max-w-full">
      {avatarUrl
        ? <span className="flex-shrink-0"><Avatar name={name} src={avatarUrl} size="sm" /></span>
        : <span className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-xs flex-shrink-0">🧑‍✈️</span>}
      <span className="text-xs text-gray-600 truncate min-w-0">Run by <span className="font-semibold text-gray-800">{name}</span></span>
      {verified && <span title={VERIFIED_TOOLTIP} className="flex-shrink-0"><VerifiedTick /></span>}
    </span>
  ) : (
    <span className="flex items-center gap-1.5 min-w-0 max-w-full">
      {avatarUrl
        ? <span className="flex-shrink-0"><Avatar name={name} src={avatarUrl} size="xs" /></span>
        : <span className="text-[13px] leading-none flex-shrink-0" aria-hidden>🧑‍✈️</span>}
      <span className="text-[11px] text-gray-500 truncate min-w-0">Run by <span className="font-semibold text-gray-700">{name}</span></span>
      {verified && <span title={VERIFIED_TOOLTIP} className="flex-shrink-0"><VerifiedTick /></span>}
    </span>
  )

  // Root shrinks to fit its container so the name truncates instead of overflowing
  // (e.g. inside the narrow ScoreBoard "Viewing" card). `card` stays a compact pill.
  const rootWidth = variant === 'card' ? 'inline-flex max-w-full min-w-0' : 'flex min-w-0 max-w-full'

  if (href) {
    return (
      <Link href={href} className={clsx(rootWidth, 'hover:opacity-80 transition-opacity', className)}
        onClick={e => e.stopPropagation()}>
        {inner}
      </Link>
    )
  }
  return <span className={clsx(rootWidth, className)}>{inner}</span>
}
