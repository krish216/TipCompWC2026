import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'
import { resolveCompChief } from '@/lib/comp-chief'
import { CompChiefBadge } from '@/components/game/CompChiefBadge'
import { JoinCompButton } from '@/components/game/JoinCompButton'
import { GroupChatLink } from '@/components/game/GroupChatLink'

export const revalidate = 300

interface CompDetail {
  id: string; name: string; slug: string; description: string | null; logo_url: string | null
  comp_category: string | null; team_affiliation: string | null
  prize_type: string; prize_description: string | null; member_cap: number | null; member_count: number
  tournament: string | null; tournament_logo: string | null
  chief: { id: string | null; name: string; avatar_url: string | null; verified: boolean } | null
}

async function load(slug: string): Promise<CompDetail | null> {
  const admin = createAdminClient()
  const { data: c } = await (admin.from('comps') as any)
    .select('id, name, slug, description, logo_url, comp_category, team_affiliation, prize_type, prize_description, member_cap, visibility, is_discoverable, created_by, owner_name, tournament:tournaments(name, logo_url), user_comps(count)')
    .eq('slug', slug).maybeSingle()
  // Only OPEN + discoverable comps get a public page.
  if (!c || c.visibility !== 'open' || !c.is_discoverable) return null

  const chief = await resolveCompChief(admin, c as any)
  return {
    id: c.id, name: c.name, slug: c.slug, description: c.description ?? null, logo_url: c.logo_url ?? null,
    comp_category: c.comp_category ?? null, team_affiliation: c.team_affiliation ?? null,
    prize_type: c.prize_type ?? 'none', prize_description: c.prize_description ?? null,
    member_cap: c.member_cap ?? null, member_count: c.user_comps?.[0]?.count ?? 0,
    tournament: c.tournament?.name ?? null, tournament_logo: c.tournament?.logo_url ?? null,
    chief: { id: chief.id, name: chief.name, avatar_url: chief.avatar_url, verified: chief.verified },
  }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const c = await load(params.slug)
  if (!c) return { title: 'Comp | TribePicks' }
  return {
    title: `${c.name} — join the comp | TribePicks`,
    description: `${c.description ?? `Join ${c.name}, an open prediction comp on TribePicks`}${c.chief ? ` Run by ${c.chief.name}.` : ''}`,
    alternates: { canonical: `https://tribepicks.com/c/${c.slug}` },
  }
}

export default async function CompDetailPage({ params }: { params: { slug: string } }) {
  const c = await load(params.slug)
  if (!c) notFound()
  const isFull = c.member_cap !== null && c.member_count >= c.member_cap
  const chiefHref = c.chief?.id ? `/chief/${c.chief.id}` : null

  return (
    <main className="max-w-xl mx-auto px-4 py-8">
      <p className="text-xs text-gray-400 mb-4"><Link href="/explore" className="hover:text-gray-600">← Browse open comps</Link></p>

      {/* Header */}
      <div className="flex items-start gap-3">
        {c.logo_url
          ? <img src={c.logo_url} alt="" className="w-14 h-14 rounded-2xl object-cover flex-shrink-0 border border-gray-100" />
          : <span className="w-14 h-14 rounded-2xl bg-sky-100 flex items-center justify-center text-2xl flex-shrink-0">🏆</span>}
        <div className="min-w-0">
          <h1 className="text-xl font-black text-gray-900">{c.name}</h1>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {c.tournament && <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{c.tournament_logo ? <img src={c.tournament_logo} alt="" className="w-3 h-3 object-contain" /> : <span aria-hidden>🏟️</span>} {c.tournament}</span>}
            {c.comp_category === 'team_fans' && c.team_affiliation
              ? <span className="text-[10px] font-semibold bg-green-100 text-green-800 px-2 py-0.5 rounded-full">⚽ {c.team_affiliation} fans</span>
              : <span className="text-[10px] font-semibold bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full">🌍 All welcome</span>}
            {c.prize_type === 'pool' && <span className="text-[10px] font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">💰 Pool prize</span>}
            {c.prize_type === 'chief_offers' && <span className="text-[10px] font-semibold bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">🎁 Prize offered</span>}
          </div>
        </div>
      </div>

      {/* Run by [Chief] */}
      {c.chief && (
        <div className="mt-3">
          <CompChiefBadge name={c.chief.name} avatarUrl={c.chief.avatar_url} verified={c.chief.verified} href={chiefHref} variant="card" />
        </div>
      )}

      {/* Description */}
      {c.description && <p className="mt-4 text-sm text-gray-700 leading-relaxed whitespace-pre-line">{c.description}</p>}

      {/* Prize */}
      {c.prize_description && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700 mb-0.5">🏆 Prize</p>
          <p className="text-sm text-amber-900">{c.prize_description}</p>
        </div>
      )}

      {/* Members */}
      <p className="mt-5 text-sm text-gray-500">
        <span className="font-bold text-gray-900">{c.member_count}</span>
        {c.member_cap ? ` / ${c.member_cap}` : ''} tipster{c.member_count !== 1 ? 's' : ''}
        {isFull && <span className="ml-1.5 text-red-600 font-semibold">· Full</span>}
      </p>

      {/* Join */}
      <div className="mt-4">
        <JoinCompButton compId={c.id} compName={c.name} isFull={isFull} />
      </div>

      {/* Group chat — only rendered for members (endpoint gates it) */}
      <div className="mt-3 flex justify-center">
        <GroupChatLink compId={c.id} />
      </div>
    </main>
  )
}
