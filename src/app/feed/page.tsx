import type { Metadata } from 'next'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { DOGS, feederTier, dollars, dogBySlug, FEED_CAMPAIGN, FEED_CHARITY } from '@/lib/dogs'
import { DogAvatar } from '@/components/game/DogAvatar'
import { FeedPanel } from '@/components/game/FeedPanel'
import { WhatsAppShareButton } from '@/components/game/WhatsAppShareButton'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Feed the doggies 🐾 | TribePicks',
  description: 'Feed the TribePicks pack for good luck — it keeps the game free, funds what’s next, and sends a slice to dog rescues.',
}

export default async function FeedPage({ searchParams }: { searchParams: { fed?: string } }) {
  const user = await getSessionUser()
  const admin = createAdminClient()

  // Community total — powers the campaign progress bar (all donations, everyone).
  let communityCents = 0
  try {
    const { data: all } = await (admin.from('donations') as any).select('amount_cents')
    for (const d of ((all ?? []) as any[])) communityCents += d.amount_cents ?? 0
  } catch { /* donations table absent → 0 */ }

  let totalFed = 0, luckyDog: string | null = null
  const met = new Set<string>()
  if (user) {
    const { data } = await (admin.from('donations') as any)
      .select('amount_cents, dog_slug, created_at').eq('user_id', user.id)
      .order('created_at', { ascending: false })
    for (const d of ((data ?? []) as any[])) {
      totalFed += d.amount_cents ?? 0
      if (d.dog_slug) { if (!luckyDog) luckyDog = d.dog_slug; met.add(d.dog_slug) }   // newest-first → lucky
    }
  }
  const tier = feederTier(totalFed)
  const lucky = dogBySlug(luckyDog)
  const justFed = searchParams?.fed === '1' && !!lucky
  const goalPct = Math.min(100, Math.round((communityCents / FEED_CAMPAIGN.goalCents) * 100))

  return (
    <main className="max-w-xl mx-auto px-4 py-8">
      {/* Hero */}
      <div className="text-center">
        <div className="text-5xl mb-2">🐾</div>
        <h1 className="text-2xl font-black text-gray-900">Feed the doggies</h1>
        <p className="text-sm text-gray-500 mt-2 leading-relaxed">
          Drop a treat for good luck. It keeps TribePicks <strong>free &amp; ad-light</strong>, funds
          what’s next (<strong>EPL · NBA · Champions League</strong>), and a slice goes to <strong>dog rescues</strong>.
        </p>
      </div>

      {/* Keepsake — celebrate a fresh feed (after Stripe returns to /feed?fed=1) */}
      {justFed && lucky && (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
          <DogAvatar photo={lucky.photo} name={lucky.name} className="w-16 h-16 rounded-full mx-auto border-2 border-emerald-200" />
          <p className="text-base font-black text-emerald-900 mt-2">🎉 You fed {lucky.name}!</p>
          <p className="text-sm text-emerald-700">{lucky.name}’s got your back this round — good luck! 🐾</p>
          <div className="mt-3 flex justify-center">
            <WhatsAppShareButton label="Share the love 🐾"
              message={`I just fed ${lucky.name} on TribePicks for good luck 🐾 Predict the football, feed the pack → https://tribepicks.com/feed`} />
          </div>
        </div>
      )}

      {/* Community goal */}
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="font-bold text-gray-900">🐾 {FEED_CAMPAIGN.label}</span>
          <span className="text-gray-500 tabular-nums">{dollars(communityCents)} / {dollars(FEED_CAMPAIGN.goalCents)}</span>
        </div>
        <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-amber-400 to-emerald-500 rounded-full transition-all" style={{ width: `${goalPct}%` }} />
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5">
          The pack has been fed {dollars(communityCents)} so far — every treat keeps TribePicks free and funds what’s next
          {FEED_CHARITY ? <>, with {FEED_CHARITY.splitPct}% to <strong>{FEED_CHARITY.name}</strong></> : <> (a slice goes to dog rescues)</>}.
        </p>
      </div>

      {/* Your feeder status */}
      {user && (
        <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-500">Your pack status</p>
            <p className="text-sm font-bold text-amber-900 mt-0.5">
              {tier ? <>{tier.icon} {tier.label}</> : 'Not fed yet — say hello 🐾'}
            </p>
            {lucky && <p className="text-[12px] text-amber-700 mt-1">🍀 Lucky doggie: <strong>{lucky.name}</strong> — rooting for you this round</p>}
          </div>
          <div className="text-right">
            <p className="text-lg font-black text-amber-900 tabular-nums leading-none">{dollars(totalFed)}</p>
            <p className="text-[11px] text-amber-600 mt-1">{met.size}/{DOGS.length} dogs met</p>
          </div>
        </div>
      )}

      {/* Feed panel */}
      <div className="mt-6">
        <FeedPanel signedIn={!!user} />
      </div>

      {/* Meet the pack */}
      <section className="mt-8">
        <h2 className="text-lg font-bold text-gray-900 mb-3">Meet the pack</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {DOGS.map(d => {
            const fed = met.has(d.slug)
            const isLucky = d.slug === luckyDog
            return (
              <div key={d.slug} className={`flex items-center gap-3 rounded-2xl border p-3 ${isLucky ? 'border-amber-300 bg-amber-50 ring-1 ring-amber-200' : fed ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-white'}`}>
                <DogAvatar photo={d.photo} name={d.name} className="w-14 h-14 rounded-2xl flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5 flex-wrap">
                    {d.name}
                    {isLucky && <span className="text-[10px] font-semibold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded-full">🍀 lucky</span>}
                    {fed && !isLucky && <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">✓ fed</span>}
                  </p>
                  <p className="text-[12px] text-gray-500 leading-snug">{d.blurb}</p>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <p className="mt-8 text-center text-[11px] text-gray-400">
        TribePicks is free to play. Feeding is a voluntary donation and never affects scoring, standings or prizes.
      </p>
    </main>
  )
}
