import { clsx } from 'clsx'
import { isoFor } from '@/lib/team-flags'

// Image-based team flag (flag-icons). Emoji flags don't render on Windows / some
// Android+Linux builds (they fall back to the 2-letter country code), so every
// flag in the app should go through this component, not an emoji string.
//
// flag-icons renders a 4:3 flag sized by font-size, so set the size with a
// Tailwind text-* class (e.g. text-2xl) or a font-size via className.
export function Flag({ team, code, className, title }: {
  team?: string | null
  code?: string | null          // explicit flag-icons code, bypasses the name lookup
  className?: string
  title?: string
}) {
  const iso = (code ?? isoFor(team))?.toLowerCase() ?? null
  const base = 'inline-block rounded-[2px] align-middle leading-none'
  if (!iso) {
    // Unknown team → neutral placeholder that still occupies a flag-sized box.
    return <span className={clsx('fi', base, 'bg-gray-200', className)} role="img" aria-label={team ?? 'flag'} title={title ?? team ?? undefined} />
  }
  return <span className={clsx('fi', `fi-${iso}`, base, className)} role="img" aria-label={team ?? iso} title={title ?? team ?? undefined} />
}
