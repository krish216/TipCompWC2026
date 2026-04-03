import { type ReactNode } from 'react'
import { clsx } from 'clsx'

// ── Avatar ────────────────────────────────────────────────────────────────────
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
  const initials = name
    .split(/\s+/)
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const sizes = { xs: 'w-6 h-6 text-[10px]', sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-12 h-12 text-base' }

  if (src) {
    return (
      <img
        src={src}
        alt={name}
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

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={clsx('animate-spin text-green-600', className ?? 'w-5 h-5')}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

// ── StatCard ──────────────────────────────────────────────────────────────────
export function StatCard({
  label,
  value,
  accent,
}: {
  label: string
  value: string | number
  accent?: 'green' | 'amber' | 'blue' | 'red'
}) {
  const colors = {
    green: 'text-green-700',
    amber: 'text-amber-700',
    blue:  'text-blue-700',
    red:   'text-red-600',
  }
  return (
    <div className="bg-gray-50 rounded-lg p-3 text-center">
      <p className={clsx('text-xl font-semibold', accent ? colors[accent] : 'text-gray-900')}>
        {value}
      </p>
      <p className="text-[11px] text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}

// ── EmptyState ────────────────────────────────────────────────────────────────
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {icon && <div className="mb-3 text-gray-300 text-4xl">{icon}</div>}
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {description && <p className="text-xs text-gray-500 mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────────
export function Card({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={clsx('bg-white rounded-xl border border-gray-200 p-4', className)}>
      {children}
    </div>
  )
}

// ── Section heading ───────────────────────────────────────────────────────────
export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-base font-semibold text-gray-900 mb-3">{children}</h2>
  )
}

// ── PointsBadge ───────────────────────────────────────────────────────────────
export function PointsBadge({ pts, maxExact }: { pts: number | null; maxExact: number }) {
  if (pts === null) return null
  if (pts === maxExact) return <span className="badge-exact">★ {pts}pts</span>
  if (pts > 0)         return <span className="badge-correct">✓ {pts}pts</span>
  return                      <span className="badge-wrong">✗ 0pts</span>
}

// ── RoundScorePills ───────────────────────────────────────────────────────────
export function RoundScorePills({ exact, result }: { exact: number; result: number }) {
  return (
    <div className="flex gap-1.5">
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-100 text-purple-800">
        ★ {exact} exact
      </span>
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-800">
        ✓ {result} result
      </span>
    </div>
  )
}

// ── Medal ─────────────────────────────────────────────────────────────────────
export function Medal({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-base">🥇</span>
  if (rank === 2) return <span className="text-base">🥈</span>
  if (rank === 3) return <span className="text-base">🥉</span>
  return <span className="text-xs text-gray-500 w-5 text-center">{rank}</span>
}
