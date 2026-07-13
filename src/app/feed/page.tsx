import type { Metadata } from 'next'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { DOGS, feederTier, dollars } from '@/lib/dogs'
import { DogAvatar } from '@/components/game/DogAvatar'
import { FeedPanel } from '@/components/game/FeedPanel'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Feed the doggies 🐾 | TribePicks',
  description: 'Feed the TribePicks pack for good luck — it keeps the game free, funds what’s next, and sends a slice to dog rescues.',
}

export default async function FeedPage() {
  const user = await getSessionUser()

  let totalFed = 0
  const met = new Set<string>()
  if (user) {
    const admin = createAdminClient()
    const { data } = await (admin.from('donations') as any)
      .select('amount_cents, dog_slug').eq('user_id', user.id)
    for (const d of ((data ?? []) as any[])) {
      totalFed += d.amount_cents ?? 0
      if (d.dog_slug) met.add(d.dog_slug)
    }
  }
  const tier = feederTier(totalFed)

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

      {/* Your feeder status */}
      {user && (
        <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-500">Your pack status</p>
            <p className="text-sm font-bold text-amber-900 mt-0.5">
              {tier ? <>{tier.icon} {tier.label}</> : 'Not fed yet — say hello 🐾'}
            </p>
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
            return (
              <div key={d.slug} className={`flex items-center gap-3 rounded-2xl border p-3 ${fed ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-white'}`}>
                <DogAvatar photo={d.photo} name={d.name} className="w-14 h-14 rounded-2xl flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                    {d.name}{fed && <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">✓ fed</span>}
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
