import Link from 'next/link'
import type { Metadata } from 'next'
import { JsonLd } from '@/components/seo/JsonLd'
import { faqJsonLd } from '@/lib/seo'
import { CUP_OG_IMAGES } from '../cup'

// What each state and territory's regulator says about running a small Melbourne Cup sweep,
// summarised from the regulator's own pages (and statutes where the page is silent). General
// information only — every entry links its source, and the weaker ones say "check". Re-check
// before each Cup: CHECKED is shown on the page.
export const revalidate = 86400

const URL = 'https://tribepicks.com/melbourne-cup/sweep-rules-by-state'
const CHECKED = '1 November 2026'
const DESC = 'Is your office Melbourne Cup sweep legal? What the regulator in each Australian state and territory says about prize limits, permits and where the money goes.'

export const metadata: Metadata = {
  title: 'Melbourne Cup sweep rules by state — is your office sweep legal? | TribePicks',
  description: DESC,
  alternates: { canonical: URL },
  openGraph: { title: 'Melbourne Cup sweep rules by state', description: DESC, url: URL, siteName: 'TribePicks', type: 'website', images: CUP_OG_IMAGES },
}

type State = { code: string; name: string; regulator: string; points: string[]; note?: string; sources: { label: string; href: string }[] }

const STATES: State[] = [
  {
    code: 'VIC', name: 'Victoria', regulator: 'Victorian Gambling and Casino Control Commission (VGCCC)',
    points: [
      'All of the money collected must be returned as prizes — the organiser can’t keep anything for costs.',
      'Total prizes can’t be more than $5,000.',
      'There’s no minimum or maximum entry fee, and a sweep can be run anywhere.',
      'A Calcutta sweep is different and needs a permit from the Minister for Racing.',
    ],
    sources: [{ label: 'VGCCC — Melbourne Cup sweeps', href: 'https://www.vgccc.vic.gov.au/for-community/community-and-charitable-fundraising/melbourne-cup-sweeps' }],
  },
  {
    code: 'NSW', name: 'New South Wales', regulator: 'NSW Fair Trading',
    points: [
      'Anyone can run a sweep for social entertainment.',
      'An authority is only needed if total prizes are more than $30,000.',
      'For a social sweep, the proceeds go to the holders of the placed horses. The organiser can’t be paid, though reasonable expenses can be deducted.',
    ],
    sources: [{ label: 'NSW Government — Sweeps and calcuttas', href: 'https://www.nsw.gov.au/money-and-taxes/community-gaming/sweeps-and-calcuttas' }],
  },
  {
    code: 'QLD', name: 'Queensland', regulator: 'Office of Liquor and Gaming Regulation (OLGR)',
    points: [
      'Sweeps are a “category 1” game. No licence is needed while total ticket sales are $2,000 or less.',
      'An individual can run one only if they make no personal gain and all proceeds go back to players as prizes.',
      'Above $2,000 in ticket sales, only eligible non-profit associations can run it.',
    ],
    sources: [
      { label: 'Business Queensland — Competitions, raffles and bingo', href: 'https://www.business.qld.gov.au/industries/hospitality-tourism-sport/liquor-gaming/gaming/not-profit-charitable/competitions-raffles-bingo' },
      { label: 'OLGR — Your guide to category 1 games (PDF)', href: 'https://publications.qld.gov.au/dataset/fc2f9cdd-8799-45bf-977b-0f157ee75024/resource/6d34128b-22ed-47b1-be76-d16c739d10e3/download/category1games.pdf' },
    ],
  },
  {
    code: 'WA', name: 'Western Australia', regulator: 'Racing, Gaming and Liquor / Gaming and Wagering Commission',
    points: [
      'A “small private lottery” needs no permit when tickets are only sold to people who work or live on the same premises (or members of the same non-gaming club).',
      'Every ticket costs the same, the sale and result happen within 8 days, and no single prize is more than $1,000.',
      'All proceeds go to prizes, after only printing and stationery costs. Advertising is limited to a notice on the premises.',
    ],
    note: 'WA’s rules cover small private lotteries generally — they don’t name sweeps or the Melbourne Cup.',
    sources: [{ label: 'WA Government — Gaming types', href: 'https://www.wa.gov.au/organisation/racing-gaming-and-liquor/gaming-types' }],
  },
  {
    code: 'SA', name: 'South Australia', regulator: 'Consumer and Business Services',
    points: [
      'No licence is needed for a sweepstake run by an organisation on its own behalf, where gross proceeds are $2,000 or less and all money collected is used for prizes.',
      'You must be 18 or older to take part.',
    ],
    note: 'The guidance doesn’t clearly cover a sweep run privately among colleagues or friends, and part of it refers to a share of proceeds going to an approved purpose. Check with Consumer and Business Services.',
    sources: [{ label: 'SA Government — Sweepstakes', href: 'https://www.sa.gov.au/topics/family-and-community/community-organisations/fundraising-for-organisations/sweepstakes' }],
  },
  {
    code: 'TAS', name: 'Tasmania', regulator: 'Tasmanian Liquor and Gaming Commission',
    points: [
      'A sweepstake on a sporting event is an “exempt game”, so no permit is needed.',
      'Total contributions can’t be more than $10,000, and no one person can put in more than $260.',
      'All contributions, with nothing deducted, go back to participants as prizes. Explain the rules up front and keep records.',
    ],
    sources: [
      { label: 'Tasmanian Treasury — Changes to minor gaming', href: 'https://www.treasury.tas.gov.au/liquor-and-gaming/gambling/permits/changes-to-minor-gaming' },
      { label: 'Sweepstakes — conditions for an exempt game (PDF)', href: 'https://www.treasury.tas.gov.au/Documents/Sweepstakes%20-%20Conditions%20-%20Exempt%20game.pdf' },
    ],
  },
  {
    code: 'ACT', name: 'Australian Capital Territory', regulator: 'ACT Gambling and Racing Commission',
    points: [
      'A “private lottery” is exempt when it’s limited to people who work or live on the same premises, or belong to the same association, and is run by one of them.',
      'Every entry costs the same and has an equal chance. Proceeds go wholly to prizes, after only ticket-printing costs, and winners are recorded.',
    ],
    note: 'The Commission doesn’t mention sweeps by name, and the exemption doesn’t cover friends who don’t share a workplace, home or association. Check with the Commission.',
    sources: [{ label: 'ACT Gambling and Racing Commission — Exempt lotteries', href: 'https://www.gamblingandracing.act.gov.au/industry/lotteries/exempt-lotteries' }],
  },
  {
    code: 'NT', name: 'Northern Territory', regulator: 'Licensing NT',
    points: [
      'An approved association can run a sweepstake without a permit while total ticket sales are $5,000 or less.',
      'The old $500 Melbourne Cup sweep limit you may see quoted was repealed in 2006.',
    ],
    note: 'We couldn’t find NT guidance on a sweep run informally by an individual or a workplace. Check with Licensing NT.',
    sources: [{ label: 'NT Government — About community gaming', href: 'https://nt.gov.au/industry/gambling/lotteries-community-gambling/about-community-gaming-in-the-nt' }],
  },
]

const FAQS = [
  { q: 'Is an office Melbourne Cup sweep legal?', a: 'Generally yes, within your state or territory’s limits — usually that all the money goes back as prizes and the sweep stays under a size limit. The limits differ by state: see the summary for yours on this page, and check with your regulator if you’re unsure.' },
  { q: 'Can the organiser keep some of the money?', a: 'In most states, no — the money goes back as prizes, and at most limited costs such as printing can be deducted. In Victoria, the organiser can’t keep anything.' },
]

export default function SweepRulesByStatePage() {
  return (
    <main className="max-w-xl mx-auto px-4 py-10">
      <JsonLd data={faqJsonLd(FAQS)} />
      <h1 className="text-2xl sm:text-3xl font-black text-gray-900">Melbourne Cup sweep rules by state</h1>
      <p className="text-sm text-gray-500 mt-2">
        A small office or club sweep is usually fine — but each state and territory sets its own limits. Here&apos;s what each
        regulator says, in plain English, with a link to the source.
      </p>
      <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-4">
        General information, not legal advice. Checked {CHECKED} — rules change, so confirm with your regulator, especially
        for a large sweep.
      </p>

      <nav className="flex flex-wrap gap-1.5 mt-5" aria-label="Jump to a state">
        {STATES.map(s => (
          <a key={s.code} href={`#${s.code.toLowerCase()}`} className="text-xs font-bold px-2.5 py-1 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50">{s.code}</a>
        ))}
      </nav>

      <div className="mt-6 space-y-4">
        {STATES.map(s => (
          <section key={s.code} id={s.code.toLowerCase()} className="scroll-mt-20 border border-gray-200 bg-white rounded-2xl p-4">
            <h2 className="text-base font-black text-gray-900">{s.name} <span className="text-gray-400 font-bold">· {s.code}</span></h2>
            <p className="text-xs text-gray-500 mt-0.5">{s.regulator}</p>
            <ul className="mt-3 space-y-1.5 text-sm text-gray-700 list-disc pl-5">
              {s.points.map(p => <li key={p}>{p}</li>)}
            </ul>
            {s.note && <p className="text-xs text-amber-800 mt-3">⚠️ {s.note}</p>}
            <p className="text-xs mt-3">
              {s.sources.map((src, i) => (
                <span key={src.href}>{i > 0 && ' · '}
                  <a href={src.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-700 underline">{src.label}</a>
                </span>
              ))}
            </p>
          </section>
        ))}
      </div>

      <div className="mt-8 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-4">
        <p className="text-sm text-emerald-900">
          <span className="font-bold">TribePicks sweeps return every dollar as prizes</span> — nothing comes out of the pot — and
          each sweep is capped so its prizes can&apos;t pass Victoria&apos;s $5,000 limit. Check your own state&apos;s limits above.
        </p>
        <div className="flex flex-wrap gap-3 mt-3">
          <Link href="/melbourne-cup?src=rules_by_state" className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4 py-2 rounded-lg">
            Start your sweep →
          </Link>
          <Link href="/melbourne-cup/sweep-sheet" className="text-sm font-bold text-emerald-700 hover:underline self-center">Or print a sweep sheet</Link>
        </div>
      </div>
    </main>
  )
}
