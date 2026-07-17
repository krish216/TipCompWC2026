'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { clsx } from 'clsx'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'

const EPL_SLUG = 'epl-2026-27'

// The EPL Co-Design comp (join code FXAZQXWW) — its members are the co-design crew.
const CODESIGN_COMP_ID = 'de1fa2da-26c7-4709-baaa-7916701a74f7'
const DISMISS_KEY = 'tp:codesign-onboarding-dismissed'

// A short "here's what to do" pathway shown ONLY to EPL Co-Design members: answer the 3
// comp-scoped polls (which render just below on the homepage), then try the EPL warm-up so
// they actually experience the game. Dismissible. Keeps the crew from landing and stalling.
export function CodesignOnboardingCard({ className }: { className?: string }) {
  const { session, supabase } = useSupabase()
  const { selectedTourn } = useUserPrefs()
  const isEpl = (selectedTourn as { slug?: string } | null)?.slug === EPL_SLUG
  const [member, setMember] = useState(false)
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    try { setHidden(localStorage.getItem(DISMISS_KEY) === '1') } catch { setHidden(false) }
  }, [])

  useEffect(() => {
    if (!session) { setMember(false); return }
    ;(supabase.from('user_comps') as any)
      .select('comp_id').eq('user_id', session.user.id).eq('comp_id', CODESIGN_COMP_ID).maybeSingle()
      .then(({ data }: any) => setMember(!!data))
      .catch(() => setMember(false))
  }, [session, supabase])

  // Only for EPL Co-Design members, and only while the EPL tournament is selected — an EPL
  // onboarding card would be incongruous on the World Cup home screen.
  if (!member || !isEpl || hidden) return null

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
    setHidden(true)
  }

  return (
    <div className={clsx('rounded-2xl border border-purple-200 bg-purple-50 p-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg flex-shrink-0" aria-hidden>⚽</span>
          <p className="text-sm font-extrabold text-purple-900">You're on the EPL co-design crew 🙌</p>
        </div>
        <button onClick={dismiss} aria-label="Dismiss" className="text-purple-300 hover:text-purple-500 text-lg leading-none flex-shrink-0 px-1">×</button>
      </div>
      <p className="mt-1 text-xs text-purple-700">Here's how to help shape it — takes about 2 minutes:</p>

      <ol className="mt-3 space-y-2.5">
        <li className="flex items-start gap-2.5">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-600 text-white text-[11px] font-bold flex items-center justify-center mt-0.5">1</span>
          <p className="text-sm text-purple-900 leading-snug">Answer the <strong>3 quick questions</strong> below ↓ — how you'd play, what excites you, and whether you'd help lead.</p>
        </li>
        <li className="flex items-start gap-2.5">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-600 text-white text-[11px] font-bold flex items-center justify-center mt-0.5">2</span>
          <div className="min-w-0">
            <p className="text-sm text-purple-900 leading-snug"><strong>Try the warm-up</strong> — make your first EPL predictions and watch live scoring (practice mode is on).</p>
            <Link href="/predict" className="inline-block mt-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-700">
              Try the warm-up →
            </Link>
          </div>
        </li>
        <li className="flex items-start gap-2.5">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-600 text-white text-[11px] font-bold flex items-center justify-center mt-0.5">3</span>
          <p className="text-sm text-purple-900 leading-snug">You're a <strong>founding member</strong> — your input directly steers what we build before launch. 🙌</p>
        </li>
      </ol>
    </div>
  )
}
