'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { Spinner } from '@/components/ui'

interface OpenComp {
  id:               string
  name:             string
  description:      string | null
  comp_category:    string | null
  team_affiliation: string | null
  prize_type:       string
  prize_description: string | null
  member_cap:       number | null
  logo_url:         string | null
  member_count:     number
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
  const [loading, setLoading] = useState(true)
  const [query,   setQuery]   = useState('')
  const [joining, setJoining] = useState<string | null>(null)
  const [joinErr, setJoinErr] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/comps/explore')
      .then(r => r.json())
      .then(d => { setComps(d.data ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = query.trim()
    ? comps.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.description?.toLowerCase().includes(query.toLowerCase()) ||
        c.team_affiliation?.toLowerCase().includes(query.toLowerCase())
      )
    : comps

  const handleJoin = async (comp: OpenComp) => {
    if (!session) { router.push('/login'); return }
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

      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Browse open comps</h1>
        <p className="text-sm text-gray-500 mt-0.5">Join a comp that's open to everyone — no invite code needed</p>
      </div>

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
                {/* Name + logo */}
                <div className="flex items-start gap-3 mb-2.5">
                  {comp.logo_url
                    ? <img src={comp.logo_url} alt="" className="w-10 h-10 rounded-xl object-cover flex-shrink-0 border border-gray-100" />
                    : <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center flex-shrink-0 text-xl">🏆</div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 leading-tight">{comp.name}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      <CategoryBadge category={comp.comp_category} team={comp.team_affiliation} />
                      <PrizeBadge type={comp.prize_type} />
                    </div>
                  </div>
                </div>

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
