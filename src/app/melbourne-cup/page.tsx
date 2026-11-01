import Link from 'next/link'
import type { Metadata } from 'next'
import QRCode from 'qrcode'
import { getCup, getField, raceDayLabel } from './cup'
import { EoiForm } from './EoiForm'
import { DRAW_OPENS_LABEL } from '@/lib/sweep/field'
import { JsonLd } from '@/components/seo/JsonLd'
import { faqJsonLd } from '@/lib/seo'

export const revalidate = 900

// ?src=qr tags scans in sweep_eoi.source, same as the admin "EOI QR" button.
const QR_URL = 'https://tribepicks.com/melbourne-cup?src=qr'

// Organiser questions — the buyer's side (spins, scratchings, roll-down) is on the rules page,
// which carries its own FAQ markup. Also emitted as FAQPage JSON-LD for search results.
const FAQS = [
  { q: 'How does a Melbourne Cup sweep work?', a: 'Everyone buys a ticket, each ticket is drawn a random horse in the Melbourne Cup, and the people holding the best-finishing horses win the pot. On TribePicks you share one link, people request tickets and pay you, and each ticket spins a wheel for its horse.' },
  { q: 'Is it legal to run an office Melbourne Cup sweep in Victoria?', a: 'Yes, within the Victorian Gambling and Casino Control Commission’s rules for Melbourne Cup sweeps: all of the money collected must be returned as prizes, and total prizes can’t be more than $5,000. TribePicks is built to those rules — no cut comes out of the pot, and the ticket price is capped so a sweep can’t pay out more than $5,000. Rules differ in other states — see the sweep rules by state, and check with your regulator if you’re outside Victoria.' },
  { q: 'How are the prizes split?', a: 'You choose when you set up the sweep: 70 / 20 / 10 for 1st, 2nd and 3rd, 60 / 25 / 15, or winner takes all. Every dollar goes back as prizes. If a placed horse went unsold, its prize rolls down to the next horse home that someone holds, so the whole pot is always paid out.' },
  { q: 'Can people pay in cash?', a: 'Yes. Buyers pay you directly — cash, bank transfer or PayID — and you approve each ticket request once the money is with you. TribePicks never holds or handles sweep money.' },
  { q: 'What if we have more people than horses?', a: 'Run more than one pool. Each pool has its own full field of horses and pays its own prizes from its own pot.' },
  { q: 'Does it cost anything?', a: 'Your sweep’s first pool is free, and so is a practice sweep. If extra pools ever cost anything, you see the price before you pay, and it’s paid by you — never taken from the pot.' },
]

export const metadata: Metadata = {
  title: 'Melbourne Cup 2026 sweep — run or join one online | TribePicks',
  description: 'Run your office or group Melbourne Cup sweep online: share a link, buyers pay you directly, everyone spins the wheel for their horse. Or register to join a sweep if you don\'t have one.',
  alternates: { canonical: 'https://tribepicks.com/melbourne-cup' },
  openGraph: {
    title: 'Melbourne Cup 2026 sweep on TribePicks',
    description: 'Run your group\'s sweep online, or register to join one.',
    url: 'https://tribepicks.com/melbourne-cup',
    type: 'website',
  },
}

const STEPS = [
  { icon: '🔗', title: 'Share one link', body: 'Create your sweep and send the link to your office, club or group chat.' },
  { icon: '💸', title: 'They pay you', body: 'Cash, bank transfer or PayID — straight to you. You approve each ticket.' },
  { icon: '🎡', title: 'Spin for a horse', body: 'Each ticket spins the wheel for a random horse. The full draw shows once the pool fills.' },
]

export default async function MelbourneCupPage({ searchParams }: { searchParams: { src?: string; intent?: string } }) {
  const cup = await getCup()
  const qrSvg = await QRCode.toString(QR_URL, { type: 'svg', margin: 1 }).catch(() => '')
  // Admin → Tournament → "New sweeps" / "Draw" (migrations 196, 201): sweeps can sell before
  // the field is declared; only the spin waits for it.
  const sweepsOpen = cup?.enrollment_open !== false
  const drawOpen = cup?.sweep_draw_open !== false
  const field = cup && drawOpen ? await getField(cup.id) : []

  return (
    <main className="max-w-xl mx-auto px-4 py-10">
      <JsonLd data={faqJsonLd(FAQS)} />
      <p className="text-xs font-bold uppercase tracking-wide text-amber-700">🐎 {raceDayLabel(cup)}</p>
      <h1 className="text-2xl sm:text-3xl font-black text-gray-900 mt-1">Melbourne Cup 2026 sweeps</h1>
      <p className="text-sm text-gray-500 mt-2">
        The race that stops a nation — without the spreadsheet, the hat and the chasing. Run your group's
        sweep on TribePicks, or tell us you'd like one to join.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
        {STEPS.map(s => (
          <div key={s.title} className="border border-gray-200 rounded-2xl p-4">
            <div className="text-2xl">{s.icon}</div>
            <p className="text-sm font-bold text-gray-900 mt-1">{s.title}</p>
            <p className="text-xs text-gray-500 mt-1">{s.body}</p>
          </div>
        ))}
      </div>

      {sweepsOpen ? (
        <div className="mt-6 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-4">
          <p className="text-sm text-emerald-900">
            <span className="font-bold">Sweeps are open — start selling now.</span>{' '}
            {drawOpen
              ? 'The final field is in, so everyone can spin for their horse straight away.'
              : `Tickets sell today; the draw opens ${DRAW_OPENS_LABEL}, once the final field is declared — we'll remind everyone to spin.`}
          </p>
          <Link href="/sweep" className="inline-block mt-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4 py-2 rounded-lg">
            Start your sweep →
          </Link>
        </div>
      ) : (
        // No "start a sweep" shortcut while new sweeps are paused — this page collects interest.
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
          <p className="text-sm text-amber-900">
            <span className="font-bold">Sweeps open on {DRAW_OPENS_LABEL}</span>, once the final field is declared.
            Register below and we'll let you know the moment you can start yours.
          </p>
        </div>
      )}

      {/* Practice sweeps (migration 200) run on their own tournament, so they're on offer
          whether or not Cup sweeps are open. The card lives on /sweep (after log in). */}
      <div className="mt-4 bg-violet-50 border border-violet-200 rounded-2xl px-4 py-4">
        <p className="text-sm text-violet-900">
          <span className="font-bold">🧪 Try a practice sweep first.</span>{' '}
          See how it runs for your team, start to finish — buy a ticket, approve it, spin for a horse, then
          run a pretend race. No real money, set up in under a minute.
        </p>
        <Link href="/sweep" className="inline-block mt-3 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold px-4 py-2 rounded-lg">
          Start a practice sweep →
        </Link>
        <Link href="/melbourne-cup/race" className="inline-block mt-3 ml-3 text-sm font-bold text-violet-700 hover:underline">
          🏇 Or watch a practice race now — no sign-up
        </Link>
      </div>

      {field.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-black text-gray-900">The Melbourne Cup 2026 field</h2>
          <p className="text-xs text-gray-500 mt-1 mb-3">
            {field.filter(h => !h.scratched).length} runners — the horses on every TribePicks sweep wheel.
          </p>
          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
            {field.map(h => (
              <li key={h.number} className={h.scratched ? 'text-gray-400 line-through' : 'text-gray-800'}>
                <span className="inline-block w-7 font-bold text-gray-500">{h.number}</span>{h.name}
                {h.scratched && <span className="ml-1 text-[11px] no-underline">(scratched)</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-black text-gray-900">Melbourne Cup sweep questions</h2>
        <div className="mt-3 divide-y divide-gray-100 border-y border-gray-100">
          {FAQS.map(f => (
            <details key={f.q} className="group py-3">
              <summary className="cursor-pointer list-none flex items-start justify-between gap-3 text-sm font-bold text-gray-900">
                {f.q}<span className="text-gray-400 group-open:rotate-45 transition-transform">+</span>
              </summary>
              <p className="text-sm text-gray-600 mt-2">{f.a}</p>
            </details>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Scratchings, dead heats and unsold horses:{' '}
          <Link href="/rules/melbourne-cup-2026" className="font-semibold text-emerald-700 underline">how the sweep works</Link>.
        </p>
        <div className="flex flex-wrap gap-2 mt-3 text-xs font-semibold">
          <Link href="/melbourne-cup/sweep-sheet" className="px-3 py-1.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50">🖨️ Printable sweep sheet</Link>
          <Link href="/melbourne-cup/2026-results" className="px-3 py-1.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50">🏁 2026 results</Link>
          <Link href="/melbourne-cup/sweep-rules-by-state" className="px-3 py-1.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50">⚖️ Sweep rules by state</Link>
        </div>
      </section>

      <div id="register" className="mt-8 scroll-mt-20">
        <h2 className="text-lg font-black text-gray-900">{sweepsOpen ? "Don't have a sweep to join?" : 'Register your interest'}</h2>
        <p className="text-xs text-gray-500 mt-1 mb-4">
          {sweepsOpen
            ? "Leave your details and we'll be in touch — whether you'd like help running one, or a sweep to join."
            : "Want to run a sweep, or join one? Leave your details and we'll be in touch when the field is final."}
        </p>
        {cup
          ? <EoiForm tournamentId={cup.id} source={searchParams.src ?? null} initialIntent={searchParams.intent === 'join' || sweepsOpen ? 'join' : 'organise'} sweepsOpen={sweepsOpen} />
          : <p className="text-sm text-gray-400">Registrations aren't open yet — check back soon.</p>}
      </div>

      {qrSvg && (
        <div className="mt-8 border border-gray-200 rounded-2xl p-5 flex flex-col sm:flex-row items-center gap-4">
          <div role="img" aria-label="QR code for tribepicks.com/melbourne-cup"
            className="w-36 h-36 shrink-0 [&>svg]:w-full [&>svg]:h-full"
            dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <div className="text-center sm:text-left">
            <p className="text-sm font-bold text-gray-900">Share this page</p>
            <p className="text-xs text-gray-500 mt-1">
              Scan to open it on a phone — or show it in the office, on a poster or at the club.
            </p>
            <p className="text-[11px] text-gray-400 mt-2">tribepicks.com/melbourne-cup</p>
          </div>
        </div>
      )}

      <p className="text-[11px] text-gray-400 mt-8">
        TribePicks never holds sweep money — buyers pay the organiser directly. Your details are only used to
        contact you about Melbourne Cup sweeps. See our <Link href="/privacy" className="underline">privacy policy</Link>.
      </p>
    </main>
  )
}
