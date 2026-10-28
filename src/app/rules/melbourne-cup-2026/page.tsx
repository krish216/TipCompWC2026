import type { Metadata } from 'next'
import { JsonLd } from '@/components/seo/JsonLd'
import { faqJsonLd } from '@/lib/seo'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Melbourne Cup 2026 Sweep — how it works | TribePicks',
  description: 'How the TribePicks Melbourne Cup sweep works: join a pool, your organiser grants you picks once you\'ve paid, spin the wheel to claim your horse, and the pool\'s top 3 place-getters win. Free to run — no money handled by TribePicks.',
  alternates: { canonical: 'https://tribepicks.com/rules/melbourne-cup-2026' },
}

const FAQS = [
  { q: 'How do I get a pick?', a: 'Join your organiser\'s comp, then request however many tickets you want and how you\'re paying (cash, bank transfer, or IOU if allowed). TribePicks never handles the money — cash and IOU are settled with your organiser directly, and a bank-transfer request is approved once your organiser (or an automatic check) confirms your receipt.' },
  { q: 'Can I hold more than one horse?', a: 'Yes — request as many tickets as you like (or your organiser can grant you some directly), each one a separate spin of the wheel for its own horse. Nothing stops you holding two, three or more.' },
  { q: 'How does the draw work?', a: 'Once you have a pick, spin the wheel — it starts slow so you can see the field, speeds up, then prompts you to tap. Wherever you tap locks in whichever horse is under that spot at that instant. No favourites, no rigging — it\'s a genuine random draw.' },
  { q: 'Why can\'t I see what horse I got?', a: 'Some organisers hide every pick — including yours — until the whole field is claimed, then reveal the pool at once. If that\'s how your organiser set theirs up, your spin still happened for real; you just won\'t see the name until the reveal.' },
  { q: 'My horse got scratched — now what?', a: 'You simply have no chance of winning with that pick. There\'s no redraw and no replacement horse — the same way it goes in a physical sweep, bad luck is part of the game.' },
  { q: 'Who wins?', a: 'Whoever holds the horse that finishes 1st, 2nd or 3rd in your pool. If nobody in your specific pool happens to hold a placegetter, your pool simply has no winner for that place — can happen in smaller pools that haven\'t claimed the whole field.' },
  { q: 'Does TribePicks take a cut, or hold the prize money?', a: 'No. TribePicks only runs the draw and shows who holds what. All money — entry fees and payouts — stays entirely between you and your organiser, same as a sweep tin in the office kitchen.' },
  { q: 'What if my organiser\'s pool fills up?', a: 'A new pool opens automatically for the next person who joins (up to a limit your organiser sets), or your organiser can close new pools entirely — ask them if you\'re not sure which applies.' },
  { q: 'When does the pool stop taking new joins or picks?', a: 'Whenever your organiser manually closes it, and automatically 30 minutes before the race starts regardless — whichever comes first.' },
  { q: 'Is it free to play?', a: 'Yes — TribePicks itself is free. Whatever entry fee applies is set and collected by your organiser, not by TribePicks.' },
]

export default function MelbourneCupRulesPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <JsonLd data={faqJsonLd(FAQS)} />
      <div className="flex items-center gap-2 mb-1">
        <h1 className="text-lg font-semibold text-gray-900">How it works</h1>
        <span className="text-[11px] font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">Melbourne Cup 2026</span>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        A digital sweepstake — join a pool, get your picks once you've paid your organiser, <strong>spin the wheel</strong> to claim your horse, and whoever holds the <strong>1st, 2nd or 3rd</strong> place-getter wins. Free to run — TribePicks never touches the money.
      </p>

      {/* Joining a pool */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Join a pool 🎟️</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-700">
            Your organiser shares a comp invite link — join it to get into their pool. Being a member doesn't hand you a horse automatically: <strong>request</strong> however many tickets you want and how you're paying — cash, bank transfer (attach a receipt), or IOU if your organiser allows it. Cash and IOU are settled with your organiser directly; a bank-transfer request is approved either by your organiser reviewing your receipt, or automatically the instant you attach it, depending on how they've set up their sweep.
          </p>
        </div>
      </section>

      {/* Reveal & lock */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Reveal & lock 🔒</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-700">
            Some organisers reveal every pick immediately as it's spun; others keep every pick hidden — even from the person who just spun it — until the very last horse in the field is claimed, then reveal the whole pool at once. Either way, every pool also locks automatically 30 minutes before the race (on top of your organiser's own "stop new joins" switch), so no new joins, picks, or ticket requests can sneak in right on race time.
          </p>
        </div>
      </section>

      {/* The wheel */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Spin for your horse 🎡</h2>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <p className="text-sm text-gray-700 mb-3">
            Every pick is one spin. The wheel starts slow — you can see the whole field — then speeds up until it's too fast to track, and prompts you to tap. Whichever horse is under your tap at that exact instant is yours. Hold multiple picks? Spin again for each one.
          </p>
          <p className="text-xs text-gray-500">A horse can only ever be claimed once per pool — once it's taken, it's off the wheel for everyone else in that pool.</p>
        </div>
      </section>

      {/* Scratchings */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Scratchings 😬</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-700">
            If your horse is scratched before the race, you simply have no chance of winning with that pick — <strong>no redraw, no replacement</strong>. Exactly how a physical sweep works: it's the luck of the draw.
          </p>
        </div>
      </section>

      {/* Winning */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Winning 🏆</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
          {[
            ['🥇', '1st place — the holder of the winning horse'],
            ['🥈', '2nd place — the holder of the runner-up'],
            ['🥉', '3rd place — the holder of 3rd across the line'],
          ].map(([medal, text]) => (
            <div key={text} className="flex items-start gap-3">
              <span className="text-base flex-shrink-0">{medal}</span>
              <p className="text-sm text-gray-600">{text}</p>
            </div>
          ))}
          <p className="text-xs text-gray-400 pt-1">Smaller pools don't always claim the whole field — if nobody in your pool holds a place-getter, that pool has no winner for that place. Payouts are arranged by your organiser, not TribePicks.</p>
        </div>
      </section>

      {/* FAQ */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">FAQ</h2>
        <div className="space-y-3">
          {FAQS.map(faq => (
            <div key={faq.q} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm font-medium text-gray-800 mb-1">{faq.q}</p>
              <p className="text-sm text-gray-500">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
