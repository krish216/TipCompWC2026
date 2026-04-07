'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { CountdownBanner } from '@/components/game/CountdownBanner'
import { Spinner } from '@/components/ui'

const KICKOFF = new Date('2026-06-11T19:00:00Z')

export default function HomePage() {
  const { session, supabase } = useSupabase()
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [favTeam,     setFavTeam]     = useState<string | null>(null)
  const [totalPts,    setTotalPts]    = useState<number | null>(null)
  const [myRank,      setMyRank]      = useState<number | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [isAdmin,     setIsAdmin]     = useState(false)
  const [orgData,     setOrgData]     = useState<{name:string;logo_url:string|null}|null>(null)
  const started = Date.now() >= KICKOFF.getTime()

  useEffect(() => {
    if (!session) { setLoading(false); return }
    const load = async () => {
      const [userRes, lbRes, adminRes] = await Promise.all([
        supabase.from('users').select('display_name, favourite_team, org_id, organisations(name, logo_url)').eq('id', session.user.id).single(),
        fetch('/api/leaderboard?scope=global&limit=200'),
        fetch('/api/admin'),
      ])
      const ud = userRes.data as any
      setDisplayName(ud?.display_name ?? null)
      setFavTeam(ud?.favourite_team ?? null)
      setOrgData(ud?.organisations ?? null)
      const lbData = await lbRes.json()
      const myRow = lbData.my_entry ?? (lbData.data ?? []).find((e: any) => e.user_id === session.user.id)
      if (myRow) { setTotalPts(myRow.total_points); setMyRank(myRow.rank) }
      const adminData = await adminRes.json()
      setIsAdmin(adminData.is_admin === true)
      setLoading(false)
    }
    load()
  }, [session, supabase])

  const NavCard = ({ href, icon, title, description, accent = false }: {
    href: string; icon: string; title: string; description: string; accent?: boolean
  }) => (
    <Link href={href} className={`flex items-start gap-4 p-4 rounded-xl border transition-all hover:shadow-sm hover:-translate-y-0.5 ${accent ? 'bg-green-600 border-green-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}>
      <span className="text-2xl flex-shrink-0 mt-0.5">{icon}</span>
      <div>
        <p className={`text-sm font-semibold ${accent ? 'text-white' : 'text-gray-900'}`}>{title}</p>
        <p className={`text-xs mt-0.5 ${accent ? 'text-green-100' : 'text-gray-500'}`}>{description}</p>
      </div>
    </Link>
  )

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <CountdownBanner />

      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">TipComp 2026 ⚽</h1>
        <p className="text-sm text-gray-500">Predict every match of the FIFA World Cup. Compete with your tribe.</p>
      </div>

      {session && !loading && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-1 min-w-[140px]">
            {orgData?.logo_url && (
              <img src={orgData.logo_url} alt={orgData.name}
                className="w-10 h-10 rounded-lg object-cover border border-gray-200 flex-shrink-0" />
            )}
            <div>
              <p className="text-sm font-semibold text-gray-900">Welcome back, {displayName ?? session.user.email?.split('@')[0]}! 👋</p>
              {orgData?.name && orgData.name !== 'PUBLIC' && (
                <p className="text-xs text-blue-600 mt-0.5">🏢 {orgData.name}</p>
              )}
              {favTeam && <p className="text-xs text-purple-600 mt-0.5">⭐ Favourite: {favTeam}</p>}
            </div>
          </div>
          <div className="flex gap-4">
            {totalPts !== null && <div className="text-center"><p className="text-xl font-bold text-green-700">{totalPts}</p><p className="text-[11px] text-gray-400">points</p></div>}
            {myRank   !== null && <div className="text-center"><p className="text-xl font-bold text-gray-800">#{myRank}</p><p className="text-[11px] text-gray-400">rank</p></div>}
          </div>
        </div>
      )}

      {loading && session && <div className="flex justify-center py-6"><Spinner className="w-6 h-6" /></div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {session ? (
          <>
            <NavCard href="/predict"     icon="🎯" title="Predict"     description={started ? "Enter scores before kickoff" : "Predictions open — get ahead"} accent />
            <NavCard href="/leaderboard" icon="🏆" title="Leaderboard" description="Global rankings and round-by-round standings" />
            <NavCard href="/tribe"       icon="👥" title="Your tribe"  description="Compete on a private leaderboard with friends" />
            <NavCard href="/rules"       icon="📖" title="How to play" description="Scoring guide, tournament format, and FAQ" />
            <NavCard href="/settings"    icon="⚙️" title="Settings"    description="Favourite team, notifications, account" />
            {isAdmin && <NavCard href="/admin" icon="🔧" title="Admin panel" description="Enter results and manage the tournament" />}
          </>
        ) : (
          <>
            <NavCard href="/login?tab=register" icon="🚀" title="Join free"     description="Register and start predicting in 30 seconds" accent />
            <NavCard href="/login" icon="🔑" title="Sign in"       description="Already have an account" />
            <NavCard href="/leaderboard" icon="🏆" title="Leaderboard" description="See the current standings" />
            <NavCard href="/rules"       icon="📖" title="How to play" description="Scoring guide and tournament format" />
          </>
        )}
      </div>

      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Tournament</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          {[{label:'Matches',value:'104'},{label:'Teams',value:'48'},{label:'Rounds',value:'7'},{label:'Max pts',value:'??'}].map(s => (
            <div key={s.label} className="bg-white rounded-lg border border-gray-100 py-2.5 px-2">
              <p className="text-lg font-bold text-gray-900">{s.value}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-xs text-gray-500">
          <span>🗓 Kickoff: Jun 11, 2026</span>
          <span>·</span>
          <span>🏟 Estadio Azteca, Mexico City</span>
          <span>·</span>
          <span>🏆 Final: Jul 19, MetLife Stadium</span>
        </div>
      </div>
    </div>
  )
}
