import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'
import { socialLinks } from '@/lib/socials'
import { SocialIcon } from '@/components/game/SocialIcon'
import { getTipsterStats, type TipsterStatsSummary, type TrophyGroup } from '@/lib/tipster-trophies'
import { OwnerViewProvider } from '@/components/game/OwnerViewContext'
import { InlineEditableText } from '@/components/game/InlineEditableText'
import { TipsterOwnerBar } from '@/components/game/TipsterOwnerBar'
import { DOGS, dogBySlug } from '@/lib/dogs'
import { DogAvatar } from '@/components/game/DogAvatar'

export const revalidate = 600

// ISO-3166 alpha-2 → flag emoji (no dependency). 'AU' → 🇦🇺.
function flagEmoji(cc: string | null): string {
  if (!cc || cc.length !== 2) return ''
  return String.fromCodePoint(...[...cc.toUpperCase()].map(c => 127397 + c.charCodeAt(0)))
}

type SocialLink = { key: string; url: string; label: string; short: string; color: string }
interface TipsterData {
  id: string; name: string; avatar_url: string | null; country: string | null
  bio: string | null; tagline: string | null; socials: SocialLink[]; stats: TipsterStatsSummary
}

async function load(id: string): Promise<TipsterData | null> {
  const admin = createAdminClient()
  // select('*') so newer columns (hide_tipster_profile, migration 167) flow through without
  // 42703 on un-migrated DBs.
  const { data: u } = await (admin.from('users') as any)
    .select('*').eq('id', id).maybeSingle()
  if (!u || !u.display_name) return null
  if (u.hide_tipster_profile) return null   // owner opted out → 404 + noindex

  const stats = await getTipsterStats(admin, id)
  if (!stats.hasRecord) return null          // no real record yet → no ghost cabinet

  return {
    id: u.id, name: u.display_name, avatar_url: u.avatar_url ?? null, country: u.country ?? null,
    bio: u.bio ?? null, tagline: u.tagline ?? null, socials: socialLinks(u.socials), stats,
  }
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const d = await load(params.id)
  if (!d) return { title: 'Tipster | TribePicks', robots: { index: false, follow: false } }
  const s = d.stats
  const bits = [
    s.bestRank ? `Best finish #${s.bestRank.rank} (Top ${s.bestRank.topPercent}%)` : null,
    s.bonusPoints ? `${s.bonusPoints} bonus pts` : null,
    s.tournamentsPlayed ? `${s.tournamentsPlayed} tournament${s.tournamentsPlayed === 1 ? '' : 's'} played` : null,
  ].filter(Boolean)
  return {
    title: `${d.name} — ${s.title.label} | TribePicks`,
    description: `${d.name}'s TribePicks trophy cabinet.${bits.length ? ' ' + bits.join(' · ') + '.' : ''}${d.bio ? ` ${d.bio}` : ''}`,
    alternates: { canonical: `https://tribepicks.com/tipster/${d.id}` },
  }
}

const GROUPS: { key: TrophyGroup; label: string; blurb: string }[] = [
  { key: 'participation', label: 'Participation', blurb: 'For showing up' },
  { key: 'performance',   label: 'Performance',   blurb: 'For finishes and ranks' },
]

const RankPin = ({ rank, total, top }: { rank: number; total: number; top: number | null }) => (
  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
    style={{ background: 'linear-gradient(180deg,#EBD59A,#D9B25A)', color: '#3a2c0d' }}>
    🏅 #{rank}{total ? ` of ${total}` : ''}{top != null && ` · Top ${top}%`}
  </span>
)

const NuggetPill = ({ icon, label }: { icon: string; label: string }) => (
  <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{icon} {label}</span>
)

export default async function TipsterProfilePage({ params }: { params: { id: string } }) {
  const d = await load(params.id)
  if (!d) notFound()
  const s = d.stats

  const board: [string, string][] = [
    ['Points',      String(s.totalPoints)],
    ['Rounds',      String(s.roundsCompleted)],
    ['Tournaments', String(s.tournamentsPlayed)],
    ['Challenges',  String(s.challengesPlayed)],
    ['Bonus pts',   String(s.bonusPoints)],
    ['Coverage',    s.coveragePct != null ? `${s.coveragePct}%` : '—'],
  ]

  return (
    <OwnerViewProvider profileId={d.id}>
    <main className="max-w-xl mx-auto px-4 py-8">
      {/* Owner-only view layer (edit · preview) */}
      <TipsterOwnerBar />

      {/* Identity */}
      <div className="flex items-center gap-4">
        {d.avatar_url
          ? <img src={d.avatar_url} alt={d.name} className="w-[72px] h-[72px] rounded-full object-cover flex-shrink-0 border-2 border-gray-100" />
          : <span className="w-[72px] h-[72px] rounded-full bg-emerald-100 flex items-center justify-center text-3xl flex-shrink-0">🎯</span>}
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-1.5">
            <span className="truncate">{d.name}</span>
            {d.country && <span className="text-xl leading-none flex-shrink-0" aria-label="country">{flagEmoji(d.country)}</span>}
          </h1>
          <p className="text-sm text-gray-500 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'linear-gradient(180deg,#DFF3E7,#BFE6CE)', color: '#0F5132' }}>
              {s.title.emoji} {s.title.label}
            </span>
            {/* Competitive lean → lead with the flattering rank; community lean → pepper
                positive performance nuggets instead of a deflating global rank. */}
            {s.showRank && s.bestRank
              ? <RankPin rank={s.bestRank.rank} total={s.bestRank.totalPlayers} top={s.bestRank.topPercent} />
              : s.nuggets.map(n => <NuggetPill key={n.label} icon={n.icon} label={n.label} />)}
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
          {d.socials.map(sl => (
            <a key={sl.key} href={sl.url} target="_blank" rel="nofollow noopener noreferrer"
              aria-label={sl.label} title={sl.label}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white shadow-sm hover:opacity-85 transition-opacity"
              style={{ background: sl.color }}>
              <SocialIcon platform={sl.key} className="w-[18px] h-[18px]" />
            </a>
          ))}
        </div>
      )}

      {/* Bio */}
      <div className="mt-4">
        <InlineEditableText field="bio" value={d.bio} multiline maxLength={280} className="text-sm text-gray-700 leading-relaxed"
          placeholder="A little about you" addLabel="Add a bio" />
      </div>

      {/* Cabinet board — the tipster's record at a glance */}
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {board.map(([label, value]) => (
          <div key={label} className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-2 py-3 text-center">
            <span className="text-xl font-black text-gray-900 tabular-nums leading-none">{value}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mt-1.5">{label}</span>
          </div>
        ))}
      </div>

      {/* Trophy cabinet — grouped Won · Nailed · Showed up · Heritage */}
      {s.trophies.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold text-gray-900 mb-0.5">Trophy cabinet</h2>
          <p className="text-xs text-gray-400 mb-4">Earned for showing up — and for how you finish.</p>
          <div className="space-y-6">
            {/* Lead with the pillar that tells this tipster's strongest story. */}
            {(s.lean === 'competitive' ? [...GROUPS].reverse() : GROUPS).map(g => {
              const items = s.trophies.filter(t => t.group === g.key)
              if (items.length === 0) return null
              return (
                <div key={g.key}>
                  <div className="flex items-baseline gap-2 mb-2.5">
                    <h3 className="text-sm font-bold text-gray-700">{g.label}</h3>
                    <span className="text-[11px] text-gray-400">{g.blurb}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {items.map(t => (
                      <div key={t.key} className={`rounded-xl border bg-white px-3 py-3.5 text-center ${t.earned ? 'border-amber-200' : 'border-dashed border-gray-200'}`}>
                        <div className={`w-11 h-11 mx-auto mb-2 rounded-full flex items-center justify-center text-xl ${t.earned ? 'bg-gradient-to-br from-amber-200 to-amber-400 shadow-sm' : 'bg-gray-100 grayscale opacity-70'}`}>{t.icon}</div>
                        <p className={`text-[13px] font-bold leading-tight ${t.earned ? 'text-gray-900' : 'text-gray-400'}`}>{t.label}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{t.desc}</p>
                        {t.progress && (
                          <>
                            <div className="h-1.5 rounded-full bg-gray-100 mt-2 overflow-hidden">
                              <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.min(100, Math.round(t.progress.have / t.progress.need * 100))}%` }} />
                            </div>
                            <p className="text-[10px] text-gray-400 mt-1 tabular-nums">{Math.max(0, t.progress.need - t.progress.have)} to go</p>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Tournaments played */}
      <section className="mt-8">
        <h2 className="text-lg font-bold text-gray-900 mb-3">Tournaments played</h2>
        <div className="space-y-2.5">
          {s.tournaments.map(t => (
            <div key={t.id} className="flex items-center gap-3 bg-white rounded-2xl border border-gray-200 p-3 shadow-sm">
              {t.logo
                ? <img src={t.logo} alt="" className="w-10 h-10 rounded-xl object-contain flex-shrink-0 border border-gray-100 bg-white" />
                : <span className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center text-xl flex-shrink-0">🏟️</span>}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate flex items-center gap-1.5">
                  {t.name}
                  {t.inaugural && <span title="TribePicks' first tournament" className="text-[10px]">⭐</span>}
                </p>
                <p className="text-[11px] text-gray-500 flex items-center gap-1.5 flex-wrap">
                  <span className="tabular-nums font-semibold text-gray-700">{t.points} pts</span>
                  {t.fixturesDecided > 0 && <span>· {t.predictionsMade}/{t.fixturesDecided} tipped</span>}
                </p>
              </div>
              {t.rank && <RankPin rank={t.rank} total={t.totalPlayers} top={t.topPercent} />}
            </div>
          ))}
        </div>
      </section>

      {/* Upsell — the analyst's desk lives behind Pro */}
      <Link href="/pro/tipster"
        className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 hover:border-emerald-300 transition-colors">
        <div className="min-w-0">
          <p className="text-sm font-bold text-emerald-900">📈 See how you actually play</p>
          <p className="text-[11px] text-emerald-700">Form trends, hit rate, head-to-head and your tipster persona — with Tipster Pro.</p>
        </div>
        <span className="text-emerald-600 font-bold flex-shrink-0">→</span>
      </Link>

      {/* Collect the pack — the doggies this tipster has fed */}
      {s.fedDogs.length > 0 && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-500 mb-2">🐕 Pack fed · {s.fedDogs.length}/{DOGS.length}</p>
          <div className="flex flex-wrap gap-1.5">
            {s.fedDogs.map(slug => {
              const d = dogBySlug(slug); if (!d) return null
              const isLucky = slug === s.luckyDog
              return <DogAvatar key={slug} photo={d.photo} name={d.name + (isLucky ? ' · 🍀 lucky' : '')} className={`w-9 h-9 rounded-full border-2 ${isLucky ? 'border-amber-400' : 'border-white'}`} />
            })}
          </div>
          {s.luckyDog && dogBySlug(s.luckyDog) && (
            <p className="text-[12px] text-amber-700 mt-2">🍀 Lucky doggie: <strong>{dogBySlug(s.luckyDog)!.name}</strong></p>
          )}
        </div>
      )}

      {/* Feed the pack — gentle, on-theme donation nudge */}
      <Link href="/feed" className="mt-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-900 transition-colors">
        🐾 Feed the pack for good luck →
      </Link>

      <p className="mt-8 text-xs text-gray-400"><Link href="/leaderboard" className="hover:text-gray-600">← Back to the leaderboard</Link></p>
    </main>
    </OwnerViewProvider>
  )
}
