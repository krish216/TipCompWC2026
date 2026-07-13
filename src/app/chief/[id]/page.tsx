import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'
import { socialLinks } from '@/lib/socials'
import { SocialIcon } from '@/components/game/SocialIcon'
import { getChiefStats, type ChiefStats } from '@/lib/chief-stats'
import { VERIFIED_MIN_ACTIVE } from '@/lib/comp-chief'
import { VERIFIED_TOOLTIP } from '@/components/game/CompChiefBadge'
import { ChiefOwnerBar } from '@/components/game/ChiefOwnerBar'
import { OwnerViewProvider } from '@/components/game/OwnerViewContext'
import { InlineEditableText } from '@/components/game/InlineEditableText'

export const revalidate = 600

// ISO-3166 alpha-2 code → flag emoji (no dependency). 'AU' → 🇦🇺.
function flagEmoji(cc: string | null): string {
  if (!cc || cc.length !== 2) return ''
  return String.fromCodePoint(...[...cc.toUpperCase()].map(c => 127397 + c.charCodeAt(0)))
}

interface ChiefComp { id: string; name: string; slug: string; logo_url: string | null; prize_type: string; member_count: number; tournament: string | null; tournament_logo: string | null; joinable: boolean }
type SocialLink = { key: string; url: string; label: string; short: string; color: string }
type ChiefRank = { rankCountry: number | null; topPctCountry: number | null; rankGlobal: number | null; topPctGlobal: number | null }
interface ChiefData {
  id: string; name: string; avatar_url: string | null; country: string | null; bio: string | null; member_since: string | null
  comps: ChiefComp[]; total_tipsters: number; socials: SocialLink[]; stats: ChiefStats; rank: ChiefRank | null; verified: boolean; tagline: string | null
}

async function load(id: string): Promise<ChiefData | null> {
  const admin = createAdminClient()
  // select('*') so `bio` (migration 160) flows through without erroring on DBs where the
  // column isn't applied yet (PostgREST 42703 on an explicit missing column).
  const { data: u } = await (admin.from('users') as any)
    .select('*').eq('id', id).maybeSingle()
  if (!u || !u.display_name) return null

  // Public list = open + discoverable comps, plus any the Chief explicitly featured.
  const sel = 'id, name, slug, logo_url, prize_type, visibility, is_discoverable, tournament:tournaments(name, logo_url), user_comps(count)'
  const { data: openComps } = await (admin.from('comps') as any)
    .select(sel).eq('created_by', id).eq('visibility', 'open').eq('is_discoverable', true)
    .order('created_at', { ascending: false })
  // Featured (migration 164) — tolerant: skipped if the column isn't applied yet.
  const { data: featComps, error: featErr } = await (admin.from('comps') as any)
    .select(sel).eq('created_by', id).eq('featured', true)

  const rows = [...((openComps ?? []) as any[])]
  if (!featErr && featComps) for (const f of featComps as any[]) if (!rows.some(r => r.id === f.id)) rows.push(f)
  const list: ChiefComp[] = rows.map(c => ({
    id: c.id, name: c.name, slug: c.slug, logo_url: c.logo_url ?? null,
    prize_type: c.prize_type ?? 'none', member_count: c.user_comps?.[0]?.count ?? 0,
    tournament: c.tournament?.name ?? null, tournament_logo: c.tournament?.logo_url ?? null,
    // Only open + discoverable comps have a public join page; a featured PRIVATE comp is
    // shown for context but must NOT be clickable (its /c/[slug] would 404 / can't be joined).
    joinable: c.visibility === 'open' && c.is_discoverable,
  }))
  const stats = await getChiefStats(admin, u.id)

  // Relative rank from the nightly chief_scores view — tolerant: null when the view isn't
  // applied/refreshed yet, or the Chief is below the eligibility floor (<5 active tipsters).
  let rank: ChiefRank | null = null
  const { data: cs, error: csErr } = await (admin.from('chief_scores') as any)
    .select('rank_country, top_pct_country, rank_global, top_pct_global, active_tipsters').eq('chief_id', id).maybeSingle()
  if (!csErr && cs && (cs.rank_country || cs.rank_global)) {
    rank = { rankCountry: cs.rank_country ?? null, topPctCountry: cs.top_pct_country ?? null, rankGlobal: cs.rank_global ?? null, topPctGlobal: cs.top_pct_global ?? null }
  }
  const verified = !!u.email_verified && ((!csErr && cs?.active_tipsters) ?? 0) >= VERIFIED_MIN_ACTIVE

  return {
    id: u.id, name: u.display_name, avatar_url: u.avatar_url ?? null, country: u.country ?? null,
    bio: u.bio ?? null, member_since: u.created_at ?? null,
    comps: list, total_tipsters: list.reduce((s, c) => s + c.member_count, 0),
    socials: socialLinks(u.socials), stats, rank, verified, tagline: u.tagline ?? null,
  }
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const d = await load(params.id)
  if (!d) return { title: 'Comp Chief | TribePicks' }
  return {
    title: `${d.name} — Comp Chief | TribePicks`,
    description: `${d.name} runs ${d.comps.length} open comp${d.comps.length === 1 ? '' : 's'} on TribePicks${d.total_tipsters ? ` with ${d.total_tipsters} tipsters` : ''}.${d.bio ? ` ${d.bio}` : ''}`,
    alternates: { canonical: `https://tribepicks.com/chief/${d.id}` },
  }
}

const PrizeTag = ({ type }: { type: string }) =>
  type === 'pool' ? <span className="text-[10px] font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">💰 Pool</span>
  : type === 'chief_offers' ? <span className="text-[10px] font-semibold bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded-full">🎁 Prize</span>
  : null

export default async function ChiefProfilePage({ params }: { params: { id: string } }) {
  const d = await load(params.id)
  if (!d) notFound()

  const since = d.member_since
    ? new Date(d.member_since).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
    : null

  return (
    <OwnerViewProvider profileId={d.id}>
    <main className="max-w-xl mx-auto px-4 py-8">
      {/* Owner-only view layer (edit · preview-as-tipster · private-comps fold) */}
      <ChiefOwnerBar />

      {/* Identity */}
      <div className="flex items-center gap-4">
        {d.avatar_url
          ? <img src={d.avatar_url} alt={d.name} className="w-[72px] h-[72px] rounded-full object-cover flex-shrink-0 border-2 border-gray-100" />
          : <span className="w-[72px] h-[72px] rounded-full bg-emerald-100 flex items-center justify-center text-3xl flex-shrink-0">🧑‍✈️</span>}
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-1.5">
            <span className="truncate">{d.name}</span>
            {d.verified && (
              <span title={VERIFIED_TOOLTIP} className="flex-shrink-0">
                <svg viewBox="0 0 24 24" className="w-5 h-5" aria-label="Verified Chief">
                  <title>{VERIFIED_TOOLTIP}</title>
                  <path fill="#0F9D6B" d="M12 2l2.4 1.8 3 .1 1 2.8 2.4 1.7-.9 2.9.9 2.9-2.4 1.7-1 2.8-3 .1L12 22l-2.4-1.8-3-.1-1-2.8L3.2 15.5l.9-2.9-.9-2.9 2.4-1.7 1-2.8 3-.1z"/>
                  <path fill="#fff" d="M10.6 14.6l-2-2-1.2 1.2 3.2 3.2 5.6-5.6-1.2-1.2z"/>
                </svg>
              </span>
            )}
            {d.country && <span className="text-xl leading-none flex-shrink-0" aria-label="country">{flagEmoji(d.country)}</span>}
          </h1>
          <p className="text-sm text-gray-500 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-white px-2 py-0.5 rounded-full shadow-sm"
              style={{ background: d.stats.tier.color }}>★ {d.stats.tier.label}</span>
            {(() => {
              const r = d.rank
              if (!r) return null
              const useCountry = r.rankCountry != null && d.country
              const n   = useCountry ? r.rankCountry : r.rankGlobal
              const pct = useCountry ? r.topPctCountry : r.topPctGlobal
              const where = useCountry ? ` in ${flagEmoji(d.country)}` : ''
              return (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'linear-gradient(180deg,#EBD59A,#D9B25A)', color: '#3a2c0d' }}>
                  🏅 #{n}{where}{pct != null && ` · Top ${pct}%`}
                </span>
              )
            })()}
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">🧑‍✈️ Comp Chief</span>
          </p>
          <div className="mt-1.5">
            <InlineEditableText field="tagline" value={d.tagline} maxLength={80} className="text-sm text-gray-600"
              placeholder="One-line headline" addLabel="Add a headline" />
          </div>
        </div>
      </div>

      {/* Social links — host-validated, nofollow */}
      {d.socials.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {d.socials.map(s => (
            <a key={s.key} href={s.url} target="_blank" rel="nofollow noopener noreferrer"
              aria-label={s.label} title={s.label}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white shadow-sm hover:opacity-85 transition-opacity"
              style={{ background: s.color }}>
              <SocialIcon platform={s.key} className="w-[18px] h-[18px]" />
            </a>
          ))}
        </div>
      )}

      {/* Bio */}
      <div className="mt-4">
        <InlineEditableText field="bio" value={d.bio} multiline maxLength={280} className="text-sm text-gray-700 leading-relaxed"
          placeholder="A little about you" addLabel="Add a bio" />
      </div>

      {/* Caps board — the Chief's record */}
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          ['Chief since',  since ?? '—'],
          ['Comps run',    String(d.stats.compsRun)],
          ['Tipsters led', String(d.stats.tipstersLed)],
          ['Seasons',      String(d.stats.seasons)],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-2 py-3 text-center">
            <span className="text-xl font-black text-gray-900 tabular-nums leading-none">{value}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mt-1.5">{label}</span>
          </div>
        ))}
      </div>

      {/* Honours cabinet */}
      {d.stats.honours.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold text-gray-900 mb-0.5">Honours</h2>
          <p className="text-xs text-gray-400 mb-3">Earned for building and looking after tribes.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {d.stats.honours.map(h => (
              <div key={h.key} className={`rounded-xl border bg-white px-3 py-3.5 text-center ${h.earned ? 'border-amber-200' : 'border-dashed border-gray-200'}`}>
                <div className={`w-11 h-11 mx-auto mb-2 rounded-full flex items-center justify-center text-xl ${h.earned ? 'bg-gradient-to-br from-amber-200 to-amber-400 shadow-sm' : 'bg-gray-100 grayscale opacity-70'}`}>{h.icon}</div>
                <p className={`text-[13px] font-bold leading-tight ${h.earned ? 'text-gray-900' : 'text-gray-400'}`}>{h.label}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{h.desc}</p>
                {h.progress && (
                  <>
                    <div className="h-1.5 rounded-full bg-gray-100 mt-2 overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.min(100, Math.round(h.progress.have / h.progress.need * 100))}%` }} />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1 tabular-nums">{h.progress.need - h.progress.have} to go</p>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Open comps they run (private comps are counted in the stats but never listed here) */}
      <section className="mt-8">
        <h2 className="text-lg font-bold text-gray-900 mb-0.5">Comps run by {d.name}</h2>
        <p className="text-xs text-gray-400 mb-2"><strong>Open</strong> comps are free for anyone to join; <strong>invite-only</strong> comps need a code from the Chief. Fully private comps aren’t shown.</p>
        {d.comps.length === 0 ? (
          <p className="text-sm text-gray-500">No comps to show yet.</p>
        ) : (
          <div className="space-y-2.5">
            {d.comps.map(c => {
              const inner = (
                <>
                  {c.logo_url
                    ? <img src={c.logo_url} alt="" className="w-10 h-10 rounded-xl object-cover flex-shrink-0 border border-gray-100" />
                    : <span className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center text-xl flex-shrink-0">🏆</span>}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{c.name}</p>
                    <p className="text-[11px] text-gray-500 flex items-center gap-1 truncate">
                      {c.tournament && (
                        <span className="flex items-center gap-1 text-gray-400 flex-shrink-0">
                          {c.tournament_logo
                            ? <img src={c.tournament_logo} alt="" className="w-3.5 h-3.5 object-contain" />
                            : <span aria-hidden>🏟️</span>}
                          {c.tournament} ·
                        </span>
                      )}
                      <span className="flex-shrink-0">{c.member_count} tipster{c.member_count !== 1 ? 's' : ''}</span>
                    </p>
                  </div>
                  <PrizeTag type={c.prize_type} />
                  {c.joinable ? (
                    <>
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full flex-shrink-0">🌍 Open</span>
                      <span className="text-emerald-600 font-bold flex-shrink-0">→</span>
                    </>
                  ) : (
                    <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">🔒 Invite only</span>
                  )}
                </>
              )
              return c.joinable ? (
                <Link key={c.id} href={`/c/${c.slug}`}
                  className="flex items-center gap-3 bg-white rounded-2xl border border-gray-200 p-3 shadow-sm hover:border-emerald-300 hover:shadow transition-all">
                  {inner}
                </Link>
              ) : (
                <div key={c.id} className="flex items-center gap-3 bg-white rounded-2xl border border-gray-200 p-3 shadow-sm">
                  {inner}
                </div>
              )
            })}
          </div>
        )}
        {/* Redacted line — reconciles the caps board (counts all comps) with the open-only
            list, without leaking any private comp's name or details. */}
        {d.stats.hiddenComps > 0 && (
          <p className="text-xs text-gray-400 mt-3">
            + {d.stats.hiddenComps} {d.stats.hiddenPrivate === d.stats.hiddenComps ? 'private' : 'other'} comp{d.stats.hiddenComps === 1 ? '' : 's'}
            {d.stats.hiddenTipsters > 0 && <> · {d.stats.hiddenTipsters} more tipster{d.stats.hiddenTipsters === 1 ? '' : 's'}</>}
            {' '}— not shown
          </p>
        )}
      </section>

      <p className="mt-8 text-xs text-gray-400"><Link href="/explore" className="hover:text-gray-600">← Browse all open comps</Link></p>
    </main>
    </OwnerViewProvider>
  )
}
