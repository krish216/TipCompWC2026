'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type SweepTourn = { id: string; name: string; race_date: string | null; race_start_at: string | null; enrollment_open?: boolean }

// Seasonal "🐎 Melbourne Cup sweeps" prompt for My Comps. Sweeps are deliberately kept out
// of the football tournament rotation (migration 188), so otherwise the only way to find one
// is its row inside the tournament switcher — easy to miss for something people don't know
// exists. This surfaces it directly, but only while it's relevant: before race
// day, and only to someone who isn't already in a pool for it. A pending sweep invite
// (comp_invitations) turns it into an "You've been invited" prompt instead.
export function SweepPromoCard({ invite }: { invite?: { comp_name: string } | null }) {
  const [tourn, setTourn] = useState<SweepTourn | null>(null)

  useEffect(() => {
    fetch('/api/sweep/context')
      .then(r => r.json())
      .then(ctx => {
        const t = ctx.tournament as SweepTourn | null
        if (!t || ctx.my_tribe) return   // no sweep set up, or already in a pool for it
        // Race over? race_start_at is the actual jump time; fall back to the end of race day.
        const endsAt = t.race_start_at
          ? new Date(t.race_start_at).getTime()
          : t.race_date ? new Date(`${t.race_date}T23:59:59Z`).getTime() : null
        if (endsAt != null && endsAt < Date.now()) return
        setTourn(t)
      })
      .catch(() => {})
  }, [])

  if (!tourn) return null

  const raceDay = tourn.race_date
    ? new Date(`${tourn.race_date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    : null

  return (
    <Link href={!invite && tourn.enrollment_open === false ? '/melbourne-cup' : '/sweep'}
      className="mb-4 flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors">
      <div className="min-w-0">
        <p className="text-sm font-bold text-gray-900 truncate">
          🐎 {tourn.name.replace(/\s*\d{4}$/, '')} sweeps{raceDay ? ` · ${raceDay}` : ''}
        </p>
        <p className="text-xs text-amber-800 truncate">
          {invite ? `You've been invited to ${invite.comp_name}`
            : tourn.enrollment_open === false ? 'Sweeps open when the field is announced — register interest'
            : "Join your group's sweep or start one"}
        </p>
      </div>
      <span className="text-xs font-bold text-amber-700 whitespace-nowrap flex-shrink-0">{invite ? 'View invite →' : 'Go →'}</span>
    </Link>
  )
}
