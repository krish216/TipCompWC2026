import type { RoundDebriefData } from '@/lib/round-debrief'
import { FeedCtaLink } from '@/components/game/FeedCtaLink'
import { FEED_CHARITY } from '@/lib/dogs'

// Presentation for the satirical Round Debrief — same "Office of Competitive
// Integrity" dossier styling as the Weekly Intelligence Report.
function Stamp() {
  return (
    <span className="inline-block border-2 border-red-500/70 text-red-500/80 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm -rotate-6 select-none">
      Classified
    </span>
  )
}

// Rounds whose debrief carries the "Feed the Doggies" fundraiser appeal. The semi-finals
// are the emotional peak with the tournament nearly done — the natural moment to ask.
// Extendable (e.g. add 'f' for the final) without touching render logic.
const FUNDRAISER_ROUNDS = new Set(['sf'])

// Fundraiser appeal appended to the debrief on qualifying rounds. In-universe "HQ directive"
// voice, but a genuine ask: why donating matters (keeps TribePicks free, funds what's next,
// and sends a slice to charity). Click-through is tracked via FeedCtaLink (source-tagged).
function FundingDirective() {
  const charityLine = FEED_CHARITY ? ` and ${FEED_CHARITY.splitPct}% goes to ${FEED_CHARITY.name}` : ''
  return (
    <div className="border-2 border-dashed border-amber-500/70 bg-amber-50 rounded-md px-3.5 py-3 space-y-2">
      <p className="text-[11px] uppercase tracking-widest text-amber-700 flex items-center gap-1.5">
        <span className="text-sm">🐾</span> Directive from HQ — keep the operation fed
      </p>
      <p className="text-gray-700 leading-relaxed">
        The tournament is in its final act — and TribePicks has run <strong>100% free</strong> the
        whole way. Keeping it free, and building <strong>what&rsquo;s next (the Premier League)</strong>,
        runs entirely on goodwill. A quick <strong>Feed the Doggies</strong> is how you chip in: it
        keeps TribePicks free for everyone, funds the next competition{charityLine} — real bowls for
        real rescue dogs. Our mascots insist it&rsquo;s worth a point of good luck for the final. 🍀
      </p>
      <FeedCtaLink
        source="round_debrief_sf"
        className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold px-3 py-1.5 rounded-md transition-colors no-underline"
      >
        🦴 Feed the doggies →
      </FeedCtaLink>
    </div>
  )
}

export function RoundDebrief({ data }: { data: RoundDebriefData }) {
  const today   = new Date()
  const dateStr = today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const ref     = `TP/${data.round_code.toUpperCase()}/${today.getFullYear()}`

  return (
    <div className="font-mono text-[12px] leading-relaxed text-gray-800 bg-[#fbfaf6] border-2 border-gray-800 rounded-lg overflow-hidden shadow-sm">
      {/* Letterhead */}
      <div className="border-b-2 border-gray-800 px-4 py-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="TribePicks" className="h-7 w-auto flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Office of Competitive Integrity</p>
            <p className="text-sm font-bold tracking-wide uppercase">{data.round_name} — Post-Match Debrief</p>
            <p className="text-[11px] text-gray-600">Re: {data.tribe_name} · {data.member_count} registered operatives</p>
          </div>
        </div>
        <div className="text-right flex-shrink-0 space-y-1">
          <Stamp />
          <p className="text-[10px] text-gray-500">FILE {ref}</p>
          <p className="text-[10px] text-gray-500">{dateStr}</p>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-4 space-y-4">
        {!data.played ? (
          <p className="text-gray-600">⏳ Results pending. This dossier unlocks once {data.round_name} is fully scored.</p>
        ) : data.awards.length === 0 ? (
          <p className="text-gray-600">No tips on file for {data.round_name}. The tribe has gone dark. 👻</p>
        ) : (
          <>
            <p className="text-[11px] uppercase tracking-widest text-gray-500 border-b border-dashed border-gray-300 pb-1">— Findings —</p>
            <ul className="space-y-3">
              {data.awards.map((a, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="text-lg leading-none flex-shrink-0">{a.emoji}</span>
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900">
                      {a.title}{a.winner ? <>: <span className="text-emerald-700">{a.winner}</span></> : null}
                    </p>
                    <p className="text-gray-600">{a.detail}</p>
                  </div>
                </li>
              ))}
            </ul>

            {/* Tribe summary */}
            <div className="border-t border-dashed border-gray-300 pt-3 space-y-1">
              <p className="text-[11px] uppercase tracking-widest text-gray-500">— Tribe summary —</p>
              <ul className="space-y-0.5">
                <li>👥 On the board: <strong>{data.stats.tippers}/{data.stats.total_members}</strong></li>
                <li>🎯 Tribe accuracy: <strong>{data.stats.accuracy_pct}%</strong></li>
                <li>📊 Tribe points: <strong>{data.stats.total_points}</strong></li>
              </ul>
              <p className="italic text-gray-700 pt-1">Verdict: {data.stats.verdict}</p>
            </div>
          </>
        )}

        {/* Semis-only: Feed the Doggies fundraiser appeal (see FUNDRAISER_ROUNDS). */}
        {FUNDRAISER_ROUNDS.has(data.round_code) && data.played && <FundingDirective />}
      </div>

      <div className="border-t-2 border-gray-800 px-4 py-2 text-[10px] text-gray-500 flex items-center justify-between">
        <span>Distribution: tribe members only.</span>
        <span>— OCI</span>
      </div>
    </div>
  )
}
