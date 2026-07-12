'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { Spinner } from '@/components/ui'
import { CompChiefBadge } from '@/components/game/CompChiefBadge'

interface OpenComp {
  id:               string
  name:             string
  slug:             string
  description:      string | null
  comp_category:    string | null
  team_affiliation: string | null
  prize_type:       string
  prize_description: string | null
  member_cap:       number | null
  logo_url:         string | null
  member_count:     number
  tournament:       string | null
  tournament_logo:  string | null
  chief:            { id: string | null; name: string; avatar_url: string | null; verified?: boolean } | null
}

function CategoryBadge({ category, team }: { category: string | null; team: string | null }) {
  if (category === 'team_fans' && team)
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-green-100 text-green-800 px-2 py-0.5 rounded-full">⚽ {team} fans</span>
  return <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full">🌍 All Welcome</span>
}

function PrizeBadge({ type }: { type: string }) {
  if (type === 'pool')         return <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">💰 Pool prize</span>
  if (type === 'chief_offers') return <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">🎁 Prize offered</span>
  return null
}

function MemberBar({ count, cap }: { count: number; cap: number | null }) {
  if (!cap) return <span className="text-[11px] text-gray-500">{count} tipster{count !== 1 ? 's' : ''}</span>
  const pct = Math.min(100, Math.round((count / cap) * 100))
  const full = pct >= 100
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${full ? 'bg-red-400' : 'bg-sky-400'}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[11px] font-medium flex-shrink-0 ${full ? 'text-red-600' : 'text-gray-500'}`}>
        {count} / {cap}
      </span>
    </div>
  )
}

export default function ExplorePage() {
  const router = useRouter()
  const { session } = useSupabase()

  const [comps,   setComps]   = useState<OpenComp[]>([])
  const [topChiefs, setTopChiefs] = useState<{ id: string; name: string; avatar_url: string | null; country: string | null; rank: number; tipsters_led: number; verified?: boolean }[]>([])
  const [loading, setLoading] = useState(true)
  const [query,   setQuery]   = useState('')
  const [joining, setJoining] = useState<string | null>(null)
  const [joinErr, setJoinErr] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/comps/explore')
      .then(r => r.json())
      .then(d => { setComps(d.data ?? []); setLoading(false) })
      .catch(() => setLoading(false))
    fetch('/api/chiefs/top?limit=8')
      .then(r => r.json())
      .then(d => setTopChiefs(d.chiefs ?? []))
      .catch(() => {})
  }, [])

  const flag = (cc: string | null) =>
    cc && cc.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map(c => 127397 + c.charCodeAt(0))) : ''

  const filtered = query.trim()
    ? comps.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.description?.toLowerCase().includes(query.toLowerCase()) ||
        c.team_affiliation?.toLowerCase().includes(query.toLowerCase())
      )
    : comps

  const handleJoin = async (comp: OpenComp) => {
    if (!session) { router.push('/login?redirect=/explore'); return }
    setJoining(comp.id); setJoinErr(null)
    const res = await fetch('/api/comps/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comp_id: comp.id }),
    })
    const data = await res.json()
    setJoining(null)
    if (!res.ok) { setJoinErr(data.error ?? 'Failed to join'); return }
    router.push(`/?joined=${encodeURIComponent(comp.name)}&comp_id=${comp.id}`)
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6">

      {/* Back link */}
      <button onClick={() => router.back()}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-4 transition-colors">
        ← Back
      </button>

      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Browse open comps</h1>
        <p className="text-sm text-gray-500 mt-0.5">Join a comp that's open to everyone — no invite code needed</p>
      </div>

      {/* Top Chiefs — prestige strip from the nightly ranking */}
      {topChiefs.length > 0 && (
        <div className="mb-5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">🏅 Top Chiefs</p>
          <div className="-mx-4 px-4 flex gap-2.5 overflow-x-auto scrollbar-hide pb-1">
            {topChiefs.map((ch, i) => (
              <Link key={ch.id} href={`/chief/${ch.id}`}
                className="flex-shrink-0 w-[132px] rounded-2xl border border-gray-200 bg-white p-3 text-center shadow-sm hover:border-amber-300 hover:shadow transition-all">
                <div className="relative w-12 h-12 mx-auto mb-2">
                  {ch.avatar_url
                    ? <img src={ch.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-amber-200" />
                    : <span className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-xl">🧑‍✈️</span>}
                  <span className="absolute -top-1 -right-1 text-[10px] font-black text-amber-900 bg-gradient-to-b from-amber-200 to-amber-400 rounded-full w-5 h-5 flex items-center justify-center shadow">{i + 1}</span>
                </div>
                <p className="text-xs font-bold text-gray-900 truncate flex items-center justify-center gap-1">
                  <span className="truncate">{ch.name} {flag(ch.country)}</span>
                  {ch.verified && <svg viewBox="0 0 24 24" className="w-3 h-3 flex-shrink-0" aria-label="Verified"><path fill="#0F9D6B" d="M12 2l2.4 1.8 3 .1 1 2.8 2.4 1.7-.9 2.9.9 2.9-2.4 1.7-1 2.8-3 .1L12 22l-2.4-1.8-3-.1-1-2.8L3.2 15.5l.9-2.9-.9-2.9 2.4-1.7 1-2.8 3-.1z"/><path fill="#fff" d="M10.6 14.6l-2-2-1.2 1.2 3.2 3.2 5.6-5.6-1.2-1.2z"/></svg>}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">{ch.tipsters_led} tipsters led</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name or team…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
        />
      </div>

      {joinErr && (
        <p className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{joinErr}</p>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-2xl mb-2">🔍</p>
          <p className="text-sm font-medium text-gray-700">{query ? 'No comps match your search' : 'No open comps yet'}</p>
          <p className="text-xs text-gray-400 mt-1">{query ? 'Try a different search' : 'Check back soon'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(comp => {
            const isFull    = comp.member_cap !== null && comp.member_count >= comp.member_cap
            const isJoining = joining === comp.id
            return (
              <div key={comp.id} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                {/* Name + logo → comp detail page */}
                <Link href={`/c/${comp.slug}`} className="flex items-start gap-3 mb-2.5 group">
                  {comp.logo_url
                    ? <img src={comp.logo_url} alt="" className="w-10 h-10 rounded-xl object-cover flex-shrink-0 border border-gray-100" />
                    : <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center flex-shrink-0 text-xl">🏆</div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 leading-tight group-hover:text-sky-700 transition-colors">{comp.name}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {comp.tournament && <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{comp.tournament_logo ? <img src={comp.tournament_logo} alt="" className="w-3 h-3 object-contain" /> : <span aria-hidden>🏟️</span>} {comp.tournament}</span>}
                      <CategoryBadge category={comp.comp_category} team={comp.team_affiliation} />
                      <PrizeBadge type={comp.prize_type} />
                    </div>
                  </div>
                </Link>

                {/* Run by [Chief] → chief profile */}
                {comp.chief && (
                  <CompChiefBadge name={comp.chief.name} avatarUrl={comp.chief.avatar_url} verified={comp.chief.verified}
                    href={comp.chief.id ? `/chief/${comp.chief.id}` : null} className="mb-2" />
                )}

                {/* Description */}
                {comp.description && (
                  <p className="text-xs text-gray-500 mb-2.5 line-clamp-2">{comp.description}</p>
                )}

                {/* Member bar + Join button */}
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <MemberBar count={comp.member_count} cap={comp.member_cap} />
                  </div>
                  <button
                    onClick={() => handleJoin(comp)}
                    disabled={isFull || isJoining}
                    className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold transition-colors flex-shrink-0
                      ${isFull
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-sky-600 hover:bg-sky-700 text-white'}`}
                  >
                    {isJoining ? <Spinner className="w-3 h-3 text-white" /> : isFull ? 'Full' : 'Join →'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
