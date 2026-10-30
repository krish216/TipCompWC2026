import type { Metadata } from 'next'
import { JsonLd } from '@/components/seo/JsonLd'
import { faqJsonLd } from '@/lib/seo'
import { DRAW_OPENS_LABEL } from '@/lib/sweep/field'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Melbourne Cup 2026 Sweep — how it works | TribePicks',
  description: 'How a TribePicks Melbourne Cup sweep works: join a pool, buy tickets from your organiser, spin the wheel for your horse once the draw opens, and the pool\'s 1st, 2nd and 3rd place-getters win. TribePicks never handles the money.',
  alternates: { canonical: 'https://tribepicks.com/rules/melbourne-cup-2026' },
}

const FAQS = [
  { q: 'How do I get a ticket?', a: 'Join your organiser\'s sweep from their link or QR code, then request however many tickets you want and say how you\'re paying — cash, bank transfer (attach your receipt), or IOU if your organiser allows it. You pay your organiser directly. Once they approve it, your tickets are yours. You can buy before the draw opens.' },
  { q: 'Can I hold more than one horse?', a: 'Yes. Each ticket is its own spin for its own horse, so hold as many as your pool has room for.' },
  { q: 'When can I spin?', a: `Once the draw opens — ${DRAW_OPENS_LABEL}, after the barrier draw sets the final field. Tickets bought before then wait until it opens; we email you the moment you can spin.` },
  { q: 'Is the draw fair?', a: 'Yes. Every horse on the wheel looks the same, and your horse is drawn at random by TribePicks from the horses still left in your pool. Nobody — not you, not your organiser — chooses a horse.' },
  { q: 'What if I don\'t spin?', a: 'You get 2 hours to spin each ticket, counted from when it can first be spun (when it\'s approved, or when the draw opens if that\'s later). After that your organiser can draw a horse for you. Anything still unspun is drawn automatically 30 minutes before the race. Either way it\'s the same random draw, and we email you your horse.' },
  { q: 'Can I skip the wheel?', a: 'Yes — tick "draw my horse for me" when you request tickets, and your horse is drawn the moment your tickets are approved (or when the draw opens).' },
  { q: 'Why can\'t I see who drew the other horses?', a: 'You always see your own horses. Who holds the rest stays hidden until every horse in your pool is drawn, or the pool locks before the race — then the whole draw is revealed at once.' },
  { q: 'My horse got scratched — now what?', a: 'Bad luck: there\'s no redraw and no replacement, same as a sweep tin in the office.' },
  { q: 'What if the final field is smaller than the tickets sold?', a: 'Pools can sell up to 24 tickets before the field is known. If fewer horses make the final field, the last tickets sold in a full pool have no horse to spin for, and your organiser refunds them.' },
  { q: 'Who wins, and how much?', a: 'Whoever holds the horses that finish 1st, 2nd and 3rd in your pool. Each pool pays its own prizes from its own pot — tickets sold × ticket price — split the way your organiser chose (70/20/10 unless they picked otherwise). The live prize table is on your pool page. If nobody in your pool holds a place-getter, that place has no winner.' },
  { q: 'Does TribePicks take a cut?', a: 'TribePicks never holds or pays out money — entry fees and prizes stay between you and your organiser. Your organiser\'s first pool is free; if they paid TribePicks for extra pools, they can take that cost out of the pot. If they do, the prize table shows the pot after it, so you always see what\'s actually up for grabs.' },
  { q: 'What if a pool sells out?', a: 'Each pool has one ticket per horse. When yours is full, a new pool opens for the next people to join, up to the number of pools your organiser has.' },
  { q: 'When does buying stop?', a: 'When your organiser closes the pool, and automatically 30 minutes before the race — whichever comes first. A locked pool takes no new joins or ticket requests.' },
  { q: 'What happens to horses nobody bought?', a: 'Nothing, unless your organiser has chosen to take them when the pool closes. Ask them if you\'re not sure.' },
  { q: 'When are results in?', a: 'After the race. Every pool member gets an email with the 1st, 2nd and 3rd horses and who held them. Your organiser pays the winners.' },
]

const SECTIONS: { title: string; body: string; tint?: boolean }[] = [
  { title: 'Get your tickets 🎟️', body: 'Join your organiser\'s sweep from their link or QR code, then request tickets and say how you\'re paying. You pay your organiser directly — TribePicks never touches the money. Once they approve your request, the tickets are yours, and we email you to confirm.' },
  { title: 'Spin for your horse 🎡', tint: true, body: `The draw opens ${DRAW_OPENS_LABEL}, once the barrier draw sets the final field. Each ticket is one spin: tap to stop the wheel, and TribePicks draws your horse at random from the horses left in your pool. One horse per ticket, and a horse can only be drawn once per pool.` },
  { title: 'Your 2 hours ⏱', body: 'You get 2 hours to spin each ticket, from when it can first be spun. After that your organiser can draw for you, and anything still unspun is drawn automatically 30 minutes before the race. It\'s always the same random draw — nobody picks a horse for you.' },
  { title: 'Reveal & lock 🔒', body: 'You see your own horses straight away. Everyone else\'s stay hidden until every horse in the pool is drawn, or the pool locks — which happens automatically 30 minutes before the race, if your organiser hasn\'t closed it sooner.' },
  { title: 'Scratchings 😬', body: 'If your horse is scratched after you\'ve drawn it, there\'s no redraw and no replacement — the luck of the draw.' },
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
        A digital sweep — buy tickets from your organiser, <strong>spin the wheel</strong> for your horse, and whoever holds the <strong>1st, 2nd or 3rd</strong> place-getter in your pool wins. TribePicks never touches the money.
      </p>

      {SECTIONS.map(sec => (
        <section key={sec.title} className="mb-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">{sec.title}</h2>
          <div className={`rounded-xl p-4 ${sec.tint ? 'bg-emerald-50 border border-emerald-200' : 'bg-white border border-gray-200'}`}>
            <p className="text-sm text-gray-700">{sec.body}</p>
          </div>
        </section>
      ))}

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
          <p className="text-xs text-gray-400 pt-1">Each pool pays its own prizes from its own pot, split the way your organiser chose — the live prize table is on your pool page. Your organiser pays the winners, not TribePicks.</p>
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
