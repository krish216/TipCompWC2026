'use client'

import { useState } from 'react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'

// Public showcase / landing for the CompChief Pro tier ($9.95, comp-organiser
// features). Features already ship — this is the marketing page + a CTA wired to the
// existing Pro checkout (/api/stripe/create-checkout, kind defaults to 'pro').
const FEATURES = [
  { icon: '⏰', title: 'Auto-reminders',           body: 'Never chase your members again — automatically email anyone who hasn’t tipped, before each round locks. Set it once and we handle it.' },
  { icon: '📊', title: 'Full Insights',            body: 'See exactly where your comp is leaking — drop-off analysis, round-by-round summaries, and who needs a nudge to stay in it.' },
  { icon: '📣', title: 'Email campaigns',          body: 'Reach members in their inbox — send to everyone or just those who haven’t tipped this round, with ready-made templates.' },
  { icon: '⚡', title: 'Challenges & bonus comps', body: 'Spice things up with match challenges and bonus competitions — extra prizes and extra reasons for your players to keep coming back.' },
  { icon: '💰', title: 'Full payment tracking',    body: 'Track entry fees for every member — mark who’s paid, chase who hasn’t, and export the lot to CSV.' },
  { icon: '🎨', title: 'Custom comp branding',     body: 'Upload your logo and make the comp unmistakably yours — on the leaderboard and on every invite you send.' },
  { icon: '🎁', title: 'Tipster Pro — included',   body: 'You also get the entire player stats suite: your Tipster persona, fixture-by-fixture tip review, head-to-head vs your rivals, your shareable card — and ad-free. The complete TribePicks experience in one.' },
]

const FAQS = [
  { q: 'Is it a subscription?', a: 'No — it’s a one-time payment that covers the whole tournament. No recurring charges.' },
  { q: 'Where do the features show up?', a: 'In your comp’s Manage screen. The moment you upgrade, Insights, email campaigns, challenges, payment tracking and branding unlock for that comp.' },
  { q: 'Does it cover all my comps?', a: 'Pro is per tournament for your account, so the Pro tools apply to the comps you run this tournament.' },
  { q: 'Do my members pay anything?', a: 'No. Pro is just for you, the Comp Chief. Playing is always free for your members.' },
  { q: 'Do I get the player stats too?', a: 'Yes — CompChief Pro is the all-in-one tier. It includes the full Tipster Pro stats suite (your persona, tip review, head-to-head and shareable card) plus ad-free, on top of the organiser tools. No need to buy Tipster Pro separately.' },
]

export default function CompChiefProPage() {
  const { session } = useSupabase()
  const { selectedTournId, isProPaid } = useUserPrefs()
  const [loading, setLoading] = useState(false)

  const upgrade = async () => {
    if (!session) { window.location.href = '/login?next=' + encodeURIComponent('/pro/comp-chief'); return }
    if (!selectedTournId) { toast.error('No active tournament found — try again from your comp.'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournament_id: selectedTournId }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error ?? 'Something went wrong'); setLoading(false); return }
      window.location.href = d.url
    } catch { toast.error('Network error — please try again'); setLoading(false) }
  }

  const Cta = ({ large }: { large?: boolean }) => {
    if (isProPaid) return (
      <div className={clsx('inline-flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold',
        large ? 'px-6 py-3 text-base' : 'px-4 py-2 text-sm')}>
        👑 You’re Pro for this tournament — thank you!
      </div>
    )
    return (
      <button onClick={upgrade} disabled={loading}
        className={clsx('inline-flex items-center justify-center rounded-xl bg-amber-400 text-amber-950 font-bold hover:bg-amber-300 disabled:opacity-60 transition-colors',
          large ? 'px-7 py-3.5 text-base' : 'px-6 py-3 text-sm')}>
        {loading ? 'Redirecting to checkout…' : session ? 'Upgrade to Pro · $9.95 →' : 'Sign in to upgrade →'}
      </button>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <section className="bg-gradient-to-b from-amber-500 to-amber-600 text-white">
        <div className="max-w-3xl mx-auto px-5 py-14 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-100 mb-3">👑 TribePicks Pro · for Comp Chiefs</p>
          <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight">Run a bigger, slicker comp</h1>
          <p className="mt-4 text-amber-50 text-base sm:text-lg leading-relaxed max-w-2xl mx-auto">
            The organiser toolkit for serious Comp Chiefs — insights to spot drop-off, email to bring players back,
            challenges to keep it lively, payment tracking, and your own branding. <strong>Plus the full Tipster Pro
            stats suite, included.</strong> One price, the whole tournament.
          </p>
          <div className="mt-7"><Cta large /></div>
          <p className="mt-3 text-[12px] text-amber-100">$9.95 AUD · one-time · covers the full tournament · GST included</p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-5 py-12 space-y-12">
        {/* Features */}
        <section>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-4 text-center">What you unlock</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {FEATURES.map(f => (
              <div key={f.title} className="bg-white rounded-2xl border border-gray-200 p-4">
                <div className="text-2xl mb-1.5">{f.icon}</div>
                <p className="text-sm font-bold text-gray-900">{f.title}</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Price */}
        <section>
          <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
            <div className="bg-amber-50 px-6 py-5 text-center border-b border-amber-100">
              <p className="text-3xl font-black text-amber-700">$9.95 <span className="text-base font-semibold text-amber-600">AUD</span></p>
              <p className="text-[12px] text-amber-600 mt-1">One-time · covers the full tournament · GST included</p>
            </div>
            <div className="px-6 py-5 text-center space-y-3">
              <p className="text-sm text-gray-600">Everything above, unlocked for the comps you run this World Cup.</p>
              <Cta />
              <p className="text-[10px] text-gray-400">Secure payment via Stripe · no subscription</p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3 text-center">Questions</p>
          <div className="space-y-2">
            {FAQS.map(f => (
              <details key={f.q} className="group bg-white rounded-xl border border-gray-200 px-4 py-3">
                <summary className="text-sm font-semibold text-gray-900 cursor-pointer list-none flex items-center justify-between gap-2">
                  {f.q}
                  <span className="text-gray-400 group-open:rotate-180 transition-transform">▾</span>
                </summary>
                <p className="text-sm text-gray-600 mt-2">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
