'use client'

import { useState } from 'react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'

// Public showcase / landing for the Tipster Pro tier ($6.95, player features:
// advanced stats + Tip Review + bonus insights + head-to-head + ad-free). CTA wires
// to the existing ad-free checkout (/api/stripe/create-checkout, kind: 'ad_free').
const FEATURES = [
  { icon: '🔍', title: 'Tip Review',          body: 'Every pick, round by round — see how you tipped each game against the field, your comp and your tribe, and exactly where you won or lost points.' },
  { icon: '📊', title: 'Advanced stats',       body: 'Your percentile, hit-rate, streaks, form curve and your one-of-a-kind tipster persona. Know your game.' },
  { icon: '⚔️', title: 'Head-to-head',         body: 'Go toe-to-toe with your tribe rivals — who’s really on top, round by round. Settle it.' },
  { icon: '⭐', title: 'Bonus-team insights',  body: 'How popular your bonus team is, who else backed it, the points it’s banked, and how that ranks against everyone.' },
  { icon: '🦄', title: 'Contrarian calls',     body: 'The upsets you nailed that the crowd missed — your boldest, smartest calls, surfaced and celebrated.' },
  { icon: '🚫', title: 'Ad-free',              body: 'No ads for the rest of the tournament. Cleaner, faster, all killer no filler.' },
]

const PREVIEW_STATS = [
  { label: 'Ranked', value: 'Top 8%' },
  { label: 'Hit-rate', value: '61%' },
  { label: 'Bonus ROI', value: 'beats 78%' },
]
const PREVIEW_BARS = [
  { label: '🌍 Field', pct: 90 },
  { label: '🏢 Comp', pct: 82 },
  { label: '👥 Tribe', pct: 55 },
]

const FAQS = [
  { q: 'Is it a subscription?', a: 'No — it’s a one-time payment that covers the whole tournament. No recurring charges.' },
  { q: 'What do I actually get?', a: 'The full stats dashboard, the fixture-by-fixture Tip Review, bonus-team insights, head-to-head vs your tribe, and an ad-free experience.' },
  { q: 'Where does it show up?', a: 'Under “📊 My Stats”. The moment you upgrade, the deep analysis unlocks and the ads disappear.' },
  { q: 'Do I lose anything if I don’t?', a: 'No — playing and your basic standings are always free. Pro just unlocks the analysis and removes ads.' },
]

// Demo video: set your YouTube video ID here (or via NEXT_PUBLIC_TIPSTER_VIDEO_ID).
// Leave empty to hide the video section.
const VIDEO_ID = process.env.NEXT_PUBLIC_TIPSTER_VIDEO_ID ?? ''

export default function TipsterProPage() {
  const { session } = useSupabase()
  const { selectedTournId, isAdFree } = useUserPrefs()
  const [loading, setLoading] = useState(false)

  const upgrade = async () => {
    if (!session) { window.location.href = '/login?next=' + encodeURIComponent('/pro/tipster'); return }
    if (!selectedTournId) { toast.error('No active tournament found — try again from your comp.'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournament_id: selectedTournId, kind: 'ad_free' }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error ?? 'Something went wrong'); setLoading(false); return }
      window.location.href = d.url
    } catch { toast.error('Network error — please try again'); setLoading(false) }
  }

  const Cta = ({ large }: { large?: boolean }) => {
    if (isAdFree) return (
      <div className={clsx('inline-flex items-center gap-2 rounded-xl bg-white/15 text-white font-bold',
        large ? 'px-6 py-3 text-base' : 'px-4 py-2 text-sm')}>
        🎉 You’re Tipster Pro — enjoy the stats!
      </div>
    )
    return (
      <button onClick={upgrade} disabled={loading}
        className={clsx('inline-flex items-center justify-center rounded-xl bg-white text-emerald-700 font-bold hover:bg-emerald-50 disabled:opacity-60 transition-colors',
          large ? 'px-7 py-3.5 text-base' : 'px-6 py-3 text-sm')}>
        {loading ? 'Redirecting to checkout…' : session ? 'Unlock Tipster Pro · $6.95 →' : 'Sign in to unlock →'}
      </button>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <section className="bg-gradient-to-b from-emerald-600 to-emerald-700 text-white">
        <div className="max-w-3xl mx-auto px-5 py-14 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-100 mb-3">📊 TribePicks Pro · for Tipsters</p>
          <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight">Know your game</h1>
          <p className="mt-4 text-emerald-50 text-base sm:text-lg leading-relaxed max-w-2xl mx-auto">
            Go beyond the scoreboard. See how you really tip — vs the field, your comp and your tribe —
            your tipster persona, your boldest calls, and head-to-head bragging rights. Plus ad-free, all tournament.
          </p>
          <div className="mt-7"><Cta large /></div>
          <p className="mt-3 text-[12px] text-emerald-100">$6.95 AUD · one-time · covers the full tournament · GST included</p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-5 py-12 space-y-12">
        {/* Demo video */}
        {VIDEO_ID && (
          <section>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-4 text-center">See it in action</p>
            <VideoEmbed id={VIDEO_ID} />
          </section>
        )}

        {/* Stats preview — sample of what you unlock */}
        <section>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-4 text-center">A peek at your stats</p>
          <div className="space-y-3">
            {/* The real shareable card (demo) */}
            <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/api/tipster/card?demo=1" alt="Sample tipster share card" className="w-full bg-emerald-700" />
            </div>
            <p className="text-[11px] text-gray-400 text-center -mt-1">☝️ Your shareable card — persona, stats & a QR to challenge your mates.</p>
            <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white rounded-2xl p-5 text-center">
              <div className="text-5xl mb-1">🔮</div>
              <p className="text-lg font-extrabold">The Oracle</p>
              <p className="text-xs text-emerald-50 mt-1">Top of the pile and rarely wrong — you see what others miss.</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {PREVIEW_STATS.map(s => (
                <div key={s.label} className="bg-white rounded-2xl border border-gray-200 p-3 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{s.label}</p>
                  <p className="text-xl font-black text-gray-900 mt-0.5">{s.value}</p>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <p className="text-sm font-bold text-gray-900 mb-2">🇲🇽 Mexico <span className="text-gray-400 font-semibold">2–0</span> South Africa 🇿🇦</p>
              <div className="space-y-1.5">
                {PREVIEW_BARS.map(bar => (
                  <div key={bar.label} className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500 w-12 shrink-0">{bar.label}</span>
                    <div className="flex-1 h-4 bg-gray-100 rounded-md overflow-hidden">
                      <div className={clsx('h-full text-[9px] font-bold text-gray-800 flex items-center justify-center', bar.pct >= 60 ? 'bg-blue-300' : 'bg-yellow-300')} style={{ width: `${bar.pct}%` }}>{bar.pct}%</div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-2">See who in your comp & tribe backed each result — and who got it right.</p>
            </div>
          </div>
        </section>

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
          <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm overflow-hidden">
            <div className="bg-emerald-50 px-6 py-5 text-center border-b border-emerald-100">
              <p className="text-3xl font-black text-emerald-700">$6.95 <span className="text-base font-semibold text-emerald-600">AUD</span></p>
              <p className="text-[12px] text-emerald-600 mt-1">One-time · covers the full tournament · GST included</p>
            </div>
            <div className="px-6 py-5 text-center space-y-3">
              <p className="text-sm text-gray-600">Every stat, every comparison, head-to-head and ad-free — unlocked for the rest of this World Cup.</p>
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

// Click-to-play YouTube embed — loads the (heavy) iframe only when the user taps play.
function VideoEmbed({ id }: { id: string }) {
  const [play, setPlay] = useState(false)
  return (
    <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-md">
      {play ? (
        <iframe className="absolute inset-0 w-full h-full"
          src={`https://www.youtube.com/embed/${id}?autoplay=1&rel=0`}
          title="TribePicks — Tipster Pro" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
      ) : (
        <button onClick={() => setPlay(true)} className="absolute inset-0 w-full h-full group" aria-label="Play demo video">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://img.youtube.com/vi/${id}/hqdefault.jpg`} alt="Watch the Tipster Pro demo" className="w-full h-full object-cover" />
          <span className="absolute inset-0 bg-black/25 flex items-center justify-center">
            <span className="w-[68px] h-[68px] rounded-full bg-red-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="white" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
            </span>
          </span>
        </button>
      )}
    </div>
  )
}
