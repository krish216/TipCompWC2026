'use client'

import Link from 'next/link'
import { useOwnerView } from '@/components/game/OwnerViewContext'

// Owner-only view layer on /tipster/[id] — rendered ONLY to the tipster viewing their own
// cabinet (the page is a cached public page, so this is client-side). Simpler than the Chief
// bar: no private-comps fold — just Edit profile and Preview-as-visitor, plus a pointer to
// the Settings toggle that hides the page. "Preview" hides all owner chrome (via the shared
// OwnerView context) so they see exactly the public view.
export function TipsterOwnerBar() {
  const { isOwner, preview, setPreview } = useOwnerView()
  if (!isOwner) return null

  if (preview) {
    return (
      <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
        <span className="text-xs font-semibold text-amber-800">👁 Previewing the public view — this is what visitors see</span>
        <button onClick={() => setPreview(false)}
          className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors">
          Back to my view
        </button>
      </div>
    )
  }

  return (
    <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5">
      <span className="text-xs font-semibold text-gray-700">🏆 This is your trophy cabinet</span>
      <div className="flex items-center gap-2">
        <Link href="/settings"
          className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
          ✏️ Edit profile
        </Link>
        <button onClick={() => setPreview(true)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
          Preview
        </button>
      </div>
    </div>
  )
}
