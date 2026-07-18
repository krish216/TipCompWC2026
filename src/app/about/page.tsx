import type { Metadata } from 'next'
import Link from 'next/link'
import { JsonLd } from '@/components/seo/JsonLd'
import { FeedCtaLink } from '@/components/game/FeedCtaLink'
import { SITE_URL, SITE_NAME } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'About TribePicks — the free football prediction game with your mates',
  description:
    'The story behind TribePicks: a free, no-gambling football prediction game a dad and his son built together. Play private comps with your mates and rank globally — from World Cup 2026 to the Premier League.',
  alternates: { canonical: `${SITE_URL}/about` },
  openGraph: {
    title: 'About TribePicks',
    description:
      'A free, no-gambling football prediction game a dad and his son built together. Play private comps with your mates and rank globally — from World Cup 2026 to the Premier League.',
    url: `${SITE_URL}/about`,
  },
}

// AboutPage + a founder Person, both linked by @id to the site-wide Organization node so
// engines resolve one entity graph. Server-rendered into the initial HTML → fully crawlable.
function aboutJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'AboutPage',
        '@id': `${SITE_URL}/about#webpage`,
        url: `${SITE_URL}/about`,
        name: `About ${SITE_NAME}`,
        isPartOf: { '@id': `${SITE_URL}/#website` },
        about: { '@id': `${SITE_URL}/#organization` },
        description:
          'The story behind TribePicks — a free, no-gambling football prediction game built for playing with your mates.',
      },
      {
        '@type': 'Person',
        '@id': `${SITE_URL}/#founder`,
        name: 'Krish Mootoosamy',
        description: 'Founder of TribePicks — built the free, no-gambling football prediction game with his son Sid, sparked by a question about how the World Cup works.',
      },
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        founder: { '@id': `${SITE_URL}/#founder` },
        foundingDate: '2026',
      },
    ],
  }
}

// Static content page — editorial treatment on the brand green palette, but built with the
// app's own tokens (green-*/gray-*, Inter, rounded cards) so it feels native. No client JS.
export default function AboutPage() {
  return (
    <>
      <JsonLd data={aboutJsonLd()} />
      <main className="bg-gray-50">
        {/* ── Hero ────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-green-800 text-white">
          {/* Stadium-crowd banner (cropped from the brand art) as the base layer, with a green
              gradient laid over it so the brand colour dominates and white text stays legible —
              floodlights and confetti still bleed through for atmosphere. */}
          <img
            src="/hero-stadium.jpg"
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-green-900/92 via-green-800/85 to-green-700/75"
          />
          <div className="relative mx-auto max-w-3xl px-5 py-16 sm:py-20">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-green-100/90">Our story</p>
            <h1 className="mt-3 text-4xl sm:text-5xl font-extrabold leading-[1.05] tracking-tight text-balance">
              Football is better with your&nbsp;tribe.
            </h1>
            <p className="mt-5 max-w-xl text-base sm:text-lg leading-relaxed text-green-50/95">
              TribePicks is a free football prediction game — tip every match, build brackets, and run private
              comps with your mates. No stakes, no bookies, no catch. Just bragging rights, settled on the pitch.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/"
                className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-green-700 shadow-sm hover:bg-green-50 transition-colors"
              >
                Play free →
              </Link>
              <Link
                href="/join"
                className="rounded-full border border-white/40 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/10 transition-colors"
              >
                Join a tribe
              </Link>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-3xl px-5 py-14 space-y-16">
          {/* ── The story ─────────────────────────────────────────── */}
          <section>
            <SectionEyebrow>How it started</SectionEyebrow>
            <h2 className="mt-2 text-2xl font-bold text-gray-900">A question I regretted answering</h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-gray-700">
              <p>
                My son Sid asked me to explain how FIFA decides which third-placed teams progress to the round of 32
                at the World Cup. My answer — <em>&ldquo;let&apos;s build a tool to work it out&rdquo;</em> — was a
                sentence I regretted the moment it left my mouth. It started everything.
              </p>
              <p>
                Four months later, that throwaway line is this app, built side by side with Sid. Everyone loves
                making predictions when the World Cup comes around once every four years — it&apos;s the conversation
                with colleagues at work, mates from uni, and family spread around the globe over the five weeks it
                runs. We wanted one place to share all of that, without it being a betting app in disguise.
              </p>
            </div>
          </section>

          {/* ── Pull quote ────────────────────────────────────────── */}
          <blockquote className="border-l-4 border-green-500 pl-5">
            <p className="text-xl sm:text-2xl font-semibold leading-snug text-gray-900 text-balance">
              &ldquo;It started with a question I immediately regretted answering.&rdquo;
            </p>
          </blockquote>

          {/* ── What makes it different ────────────────────────────── */}
          <section>
            <SectionEyebrow>What makes it different</SectionEyebrow>
            <h2 className="mt-2 text-2xl font-bold text-gray-900">Built to fix what we hated about tipping apps</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <ValueCard emoji="👪" title="Family-friendly, not a bookie">
                No betting, no odds, no gambling ads. A comp you can run at work or in the family group chat without
                anyone flinching.
              </ValueCard>
              <ValueCard emoji="🌍" title="Your comp and the world">
                Play a private comp with your mates <em>and</em> see how you rank globally — at the same time. Most
                apps make you pick one.
              </ValueCard>
              <ValueCard emoji="💬" title="A group, not a scoreboard">
                Tribes, chat and banter are built in. The game is the people you play it with — not just the points.
              </ValueCard>
              <ValueCard emoji="🏅" title="Nobody's out by the round of 16">
                Points scale up as the tournament unfolds, so a slow start never puts the win out of reach. Fall
                behind in the groups and you can still storm back by the final.
              </ValueCard>
            </div>
          </section>

          {/* ── Shaped by the crowd ───────────────────────────────── */}
          <section>
            <SectionEyebrow>What&apos;s next</SectionEyebrow>
            <h2 className="mt-2 text-2xl font-bold text-gray-900">You asked for the Premier League</h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-gray-700">
              <p>
                When the World Cup wrapped, one message came back louder than any other: <strong>keep it going with
                the Premier League.</strong> So that&apos;s exactly what we&apos;re building next — and we&apos;re building
                it in the open, with a founding co-design crew of players shaping it before launch.
              </p>
              <p>
                That&apos;s the whole idea. TribePicks isn&apos;t built <em>for</em> a crowd; it&apos;s built <em>by</em> one.
              </p>
            </div>
          </section>

          {/* ── Founder note ──────────────────────────────────────── */}
          <section className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8">
            <SectionEyebrow>From the founder</SectionEyebrow>
            <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-start">
              <figure className="mx-auto w-44 flex-shrink-0 sm:mx-0">
                {/* Real father-and-son build shot — the authenticity signal an About page wants.
                    Plain <img> (matches the app's Avatar usage); width/height set to the intrinsic
                    3:4 ratio so it reserves space and never shifts layout. */}
                <img
                  src="/about-founder.jpeg"
                  alt="Krish and his son Sid at the kitchen table, building TribePicks on a laptop"
                  width={1368}
                  height={1824}
                  loading="lazy"
                  className="w-full rounded-xl object-cover shadow-sm ring-1 ring-gray-100"
                />
                <figcaption className="mt-2 text-center text-[11px] leading-snug text-gray-400 sm:text-left">
                  Building TribePicks at the kitchen table — Krish &amp; Sid
                </figcaption>
              </figure>

              <div className="space-y-4 text-[15px] leading-relaxed text-gray-700">
                <p>
                  Hi — I&apos;m Krish. TribePicks is a father-and-son project: my son Sid and I built it together, and
                  it grew out of that one question about the World Cup I wish I&apos;d never tried to answer out loud.
                </p>
                <p>
                  I wanted a way for us — and for the families, mates and colleagues scattered across time zones — to
                  share a tournament without handing anyone&apos;s money to a bookmaker. Every feature here started as
                  something we wished existed while watching a match.
                </p>
                <p>
                  It&apos;s still early, and it&apos;s still a small crew who genuinely care. If you&apos;ve got an idea,
                  a gripe, or just want to tell me your bracket got robbed — I read everything.
                </p>
                <div className="pt-1">
                  <p className="text-sm font-bold text-gray-900">Krish Mootoosamy</p>
                  <p className="text-xs text-gray-500">
                    Founder, TribePicks ·{' '}
                    <a href="mailto:tribepicks@gmail.com" className="text-green-700 underline">tribepicks@gmail.com</a>
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ── Giving back / QueenNeve ───────────────────────────── */}
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 sm:p-8">
            <SectionEyebrowAmber>Giving back</SectionEyebrowAmber>
            <h2 className="mt-2 text-2xl font-bold text-amber-950">Meet QueenNeve 🐾</h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-amber-900/90">
              <p>
                That&apos;s <Link href="/neve" className="font-semibold text-amber-800 underline">QueenNeve</Link> wandering
                through the kitchen in the photo above — the unofficial fourth member of the TribePicks team, and the
                reason we&apos;ve got a soft spot for rescue dogs.
              </p>
              <p>
                Players can chip in a &ldquo;treat&rdquo; on our <Link href="/feed" className="font-semibold text-amber-800 underline">Feed
                the doggies</Link> page. Every treat keeps TribePicks free and funds what&apos;s next — and{' '}
                <strong>15% goes to the RSPCA (Pet Adoption Centre)</strong> to help rescue dogs find a home.
              </p>
            </div>
            <FeedCtaLink
              source="about_neve"
              className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-amber-600 transition-colors"
            >
              🦴 Feed the doggies →
            </FeedCtaLink>
          </section>

          {/* ── CTA band ──────────────────────────────────────────── */}
          <section className="rounded-2xl bg-gradient-to-br from-green-700 to-green-500 p-8 text-center text-white">
            <h2 className="text-2xl font-bold text-balance">Ready to pick?</h2>
            <p className="mx-auto mt-2 max-w-md text-[15px] text-green-50/95">
              Start a tribe, invite your mates, and settle it on the pitch. Free, forever.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href="/" className="rounded-full bg-white px-6 py-2.5 text-sm font-bold text-green-700 hover:bg-green-50 transition-colors">
                Play TribePicks →
              </Link>
              <Link href="/join" className="rounded-full border border-white/40 px-6 py-2.5 text-sm font-bold text-white hover:bg-white/10 transition-colors">
                Join a tribe
              </Link>
            </div>
          </section>
        </div>
      </main>
    </>
  )
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-green-600">{children}</p>
}

function SectionEyebrowAmber({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-600">{children}</p>
}

function ValueCard({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="text-2xl" aria-hidden>{emoji}</div>
      <h3 className="mt-2 text-base font-bold text-gray-900">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-gray-600">{children}</p>
    </div>
  )
}
