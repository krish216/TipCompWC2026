'use client'

import { useState } from 'react'
import { clsx } from 'clsx'

const sizes = { xs: 'w-6 h-6 text-[10px]', sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-12 h-12 text-base' }

export function Avatar({
  name,
  src,
  size = 'sm',
  className,
}: {
  name: string
  src?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}) {
  // Track load failures so a broken image (e.g. a Google/Firebase avatar blocked
  // by an ad-blocker, privacy setting, or a transient 429) degrades gracefully to
  // the initials bubble instead of the browser's broken-image placeholder.
  const [failed, setFailed] = useState(false)

  const initials = name
    .split(/\s+/)
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        // Google/Firebase avatar CDNs (lh3.googleusercontent.com) can reject
        // requests that carry a Referer; sending none is the standard hardening.
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={clsx('rounded-full object-cover flex-shrink-0', sizes[size], className)}
      />
    )
  }

  return (
    <div className={clsx(
      'rounded-full flex items-center justify-center font-medium flex-shrink-0',
      'bg-blue-100 text-blue-700',
      sizes[size],
      className
    )}>
      {initials}
    </div>
  )
}
