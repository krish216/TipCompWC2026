'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { clsx } from 'clsx'
import { useOwnerView } from '@/components/game/OwnerViewContext'

// The owner-only view layer on /chief/[id] — rendered ONLY to the Chief viewing their own
// profile (the page itself is a cached public page, so this is client-side). Consolidates:
//   • Edit profile → Settings
//   • Preview as Tipster → hides all owner chrome so they see exactly the public view
//   • a collapsible "your private comps" fold with per-comp "Show on profile" toggles
//     (flips comps.featured; the public list picks it up on refresh)
type PrivComp = { id: string; name: string; featured: boolean; private: boolean }

export function ChiefOwnerBar() {
  const { isOwner, preview, setPreview } = useOwnerView()
  const router = useRouter()

  const [comps,   setComps]   = useState<PrivComp[]>([])
  const [open,    setOpen]    = useState(false)
  const [busy,    setBusy]    = useState<string | null>(null)

  useEffect(() => {
    if (!isOwner) return
    fetch('/api/chiefs/my-private-comps').then(r => r.json()).then(d => setComps(d.comps ?? [])).catch(() => {})
  }, [isOwner])

  if (!isOwner) return null

  // Previewing → show only a slim bar so the rest of the page reads exactly as the public view.
  if (preview) {
    return (
      <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
        <span className="text-xs font-semibold text-amber-800">👁 Previewing the public view — this is what tipsters see</span>
        <button onClick={() => setPreview(false)}
          className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors">
          Back to my view
        </button>
      </div>
    )
  }

  const toggle = async (c: PrivComp) => {
    const next = !c.featured
    setBusy(c.id)
    const res = await fetch('/api/comps/create', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comp_id: c.id, featured: next }),
    })
    setBusy(null)
    if (res.ok) {
      setComps(cs => cs.map(x => (x.id === c.id ? { ...x, featured: next } : x)))
      router.refresh()   // re-render the server page so the public "Open comps" list updates
    }
  }

  return (
    <div className="mb-5 space-y-2.5">
      {/* Owner banner */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5">
        <span className="text-xs font-semibold text-gray-700">👁 This is your profile</span>
        <div className="flex items-center gap-2">
          <Link href="/settings"
            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
            ✏️ Edit profile
          </Link>
          <button onClick={() => setPreview(true)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
            Preview as Tipster
          </button>
        </div>
      </div>

      {/* Private comps fold — owner-only management of what's featured on the profile */}
      {comps.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <button onClick={() => setOpen(o => !o)}
            className="w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-gray-50 transition-colors">
            <span className="text-xs font-semibold text-gray-700">🔒 Your private comps ({comps.length}) — only you can see this</span>
            <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
          </button>
          {open && (
            <div className="border-t border-gray-100 divide-y divide-gray-100">
              {comps.map(c => (
                <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-sm text-gray-800 truncate min-w-0">
                    {c.name}{!c.private && <span className="text-[10px] text-gray-400 ml-1.5">unlisted</span>}
                  </span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[11px] text-gray-500">Show on profile</span>
                    <button role="switch" aria-checked={c.featured} disabled={busy === c.id} onClick={() => toggle(c)}
                      className={clsx('relative w-10 h-5.5 rounded-full transition-colors', c.featured ? 'bg-emerald-600' : 'bg-gray-300', busy === c.id && 'opacity-50')}
                      style={{ width: 40, height: 22 }}>
                      <span className={clsx('absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-all', c.featured ? 'left-[20px]' : 'left-0.5')} />
                    </button>
                  </div>
                </div>
              ))}
              <p className="px-4 py-2 text-[11px] text-gray-400">Turning one on adds it to your public “Open comps” list. Anyone can then see and join it.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
