'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Spinner } from '@/components/ui'

// Tap a name/avatar (in chat, member lists…) → a lightweight identity + trophy card, instead
// of a full-page nav that could 404 for members with no record / opted out. "View full cabinet"
// only appears when a public page actually exists, so social surfaces never dead-end.

type Summary = {
  ok: boolean; exists: boolean; id?: string; name: string | null; avatar?: string | null; flag?: string
  title?: { label: string; emoji: string }
  bestRank?: { rank: number; total: number; top: number | null } | null
  nuggets?: { icon: string; label: string }[]
  highlights?: { icon: string; label: string }[]
}

// Module-level cache — a tribe re-shows the same handful of authors constantly; fetch each once.
const cache = new Map<string, Summary>()

export function TipsterPopover({ userId, children, className }: { userId: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Summary | null>(cache.get(userId) ?? null)
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open || data || loading) return
    setLoading(true)
    fetch(`/api/tipster/summary?u=${encodeURIComponent(userId)}`)
      .then(r => r.json())
      .then((d: Summary) => { cache.set(userId, d); setData(d) })
      .catch(() => setData({ ok: false, exists: false, name: null }))
      .finally(() => setLoading(false))
  }, [open, data, loading, userId])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
    const onKey  = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const toggle = (e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); setOpen(o => !o) }

  return (
    <span ref={wrapRef} className="relative inline-flex">
      <button type="button" onClick={toggle} className={className}>{children}</button>
      {open && (
        <div className="absolute bottom-full left-0 mb-1.5 z-30 w-60 rounded-2xl border border-gray-200 bg-white shadow-xl p-3 text-left cursor-default"
          onClick={e => e.stopPropagation()}>
          {loading || !data ? (
            <div className="flex items-center justify-center py-4"><Spinner className="w-5 h-5" /></div>
          ) : (
            <>
              <div className="flex items-center gap-2.5">
                {data.avatar
                  ? <img src={data.avatar} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0 border border-gray-100" />
                  : <span className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-base flex-shrink-0">{(data.name ?? '?').slice(0, 1).toUpperCase()}</span>}
                <div className="min-w-0">
                  <p className="text-sm font-black text-gray-900 truncate flex items-center gap-1">
                    {data.name ?? 'Tipster'}{data.flag && <span className="text-xs">{data.flag}</span>}
                  </p>
                  {data.exists && data.title && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full mt-0.5"
                      style={{ background: 'linear-gradient(180deg,#DFF3E7,#BFE6CE)', color: '#0F5132' }}>
                      {data.title.emoji} {data.title.label}
                    </span>
                  )}
                </div>
              </div>

              {data.exists ? (
                <>
                  {(data.bestRank || (data.nuggets && data.nuggets.length > 0)) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {data.bestRank && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: 'linear-gradient(180deg,#EBD59A,#D9B25A)', color: '#3a2c0d' }}>
                          🏅 #{data.bestRank.rank}{data.bestRank.top != null && ` · Top ${data.bestRank.top}%`}
                        </span>
                      )}
                      {(data.nuggets ?? []).map(n => (
                        <span key={n.label} className="inline-flex items-center gap-1 text-[10px] font-semibold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{n.icon} {n.label}</span>
                      ))}
                    </div>
                  )}
                  {data.highlights && data.highlights.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {data.highlights.map(h => (
                        <span key={h.label} title={h.label} className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded-full">{h.icon} {h.label}</span>
                      ))}
                    </div>
                  )}
                  <Link href={`/tipster/${data.id}`}
                    className="mt-2.5 block text-center text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg py-1.5 transition-colors">
                    View full cabinet →
                  </Link>
                </>
              ) : (
                <p className="mt-2 text-[11px] text-gray-400">No trophy cabinet yet — hasn’t built a record.</p>
              )}
            </>
          )}
        </div>
      )}
    </span>
  )
}
