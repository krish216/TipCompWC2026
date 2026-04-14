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
  const [orgData,             setOrgData]             = useState<{name:string;logo_url:string|null;app_name?:string|null}|null>(null)
  const [userTournaments,     setUserTournaments]     = useState<any[]>([])
  const [activeTournamentId,  setActiveTournamentId]  = useState<string | null>(null)
  const [activeTournament, setActiveTournament] = useState<{name:string;slug:string}|null>(null)
  const started = Date.now() >= KICKOFF.getTime()

  useEffect(() => {
    if (!session) { setLoading(false); return }
    const load = async () => {
      const [userRes, lbRes, adminRes] = await Promise.all([
        supabase.from('users').select('display_name, favourite_team, org_id').eq('id', session.user.id).single(),
        fetch('/api/leaderboard?scope=global&limit=200'),
        fetch('/api/admin'),
      ])
      const ud = userRes.data as any
      setDisplayName(ud?.display_name ?? null)
      setFavTeam(ud?.favourite_team ?? null)
      // Fetch org explicitly to avoid RLS issues with nested joins
      const orgId = ud?.org_id ?? null
      if (orgId) {
        const { data: orgRow } = await supabase
          .from('organisations').select('name, logo_url, app_name').eq('id', orgId).single()
        setOrgData(orgRow ?? null)
      } else {
        setOrgData(null)
      }
      // Fetch active tournament name for display
      const [settingsRes, userTournRes] = await Promise.all([
        fetch('/api/app-settings'),
        fetch('/api/user-tournaments'),
      ])
      const settingsData  = await settingsRes.json()
      const userTournData = await userTournRes.json()
      setUserTournaments(userTournData.data ?? [])
      // Active tournament: user's preference, or fall back to app-wide active
      // Active tournament: prefer user's explicit choice, else first enrolled, else app default
      const { data: userPrefRow } = await supabase
        .from('users').select('active_tournament_id').eq('id', session.user.id).single()
      const userActiveTournId = (userPrefRow as any)?.active_tournament_id
      const firstEnrolledId   = (userTournData.data ?? [])[0]?.tournament_id
      const activeTournId     = userActiveTournId ?? firstEnrolledId ?? settingsData.data?.active_tournament_id
      setActiveTournamentId(activeTournId ?? null)
      if (activeTournId) {
        const { data: tournRow } = await supabase
          .from('tournaments').select('name, slug').eq('id', activeTournId).single()
        setActiveTournament(tournRow ?? null)
      }
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

  const switchTournament = async (tid: string, tname: string) => {
    setActiveTournamentId(tid)
    setActiveTournament(userTournaments.find((ut: any) => ut.tournament_id === tid)?.tournaments ?? { name: tname, slug: '' })
    // Save as user's active tournament
    await supabase.from('users').update({ active_tournament_id: tid }).eq('id', session!.user.id)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <CountdownBanner />

      <div className="mb-8 text-center">
        {/* Show org logo if user belongs to a non-PUBLIC org, otherwise WC26 logo */}
        {session && orgData?.logo_url && orgData.name !== 'PUBLIC' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={orgData.logo_url} alt={orgData.name}
            className="w-20 h-20 mx-auto mb-3 rounded-xl object-cover border border-gray-200 drop-shadow-md" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/wc2026-logo.png" alt="FIFA World Cup 2026"
            width={80} height={120}
            className="w-20 h-auto mx-auto mb-3 drop-shadow-md object-contain" />
        )}
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {session && orgData?.app_name
            ? orgData.app_name
            : session && orgData?.name && orgData.name !== 'PUBLIC'
              ? `${orgData.name} Tipping Comp`
              : 'World Cup 2026 Tipping Comp'}
        </h1>
        <p className="text-sm text-gray-500">
          {activeTournament
            ? <>Predict every match of <strong>{activeTournament.name}</strong>. Compete with your tribe.</>
            : 'Predict every match. Compete with your tribe.'
          }
        </p>

        {/* Tournament switcher */}
        {session && userTournaments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
            {userTournaments.map((ut: any) => {
              const t = Array.isArray(ut.tournaments) ? ut.tournaments[0] : ut.tournaments
              if (!t) return null
              const isActive = activeTournamentId === ut.tournament_id
              return (
                <button key={ut.tournament_id}
                  onClick={() => switchTournament(ut.tournament_id, t.name)}
                  disabled={isActive}
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full border-2 transition-all ${
                    isActive
                      ? 'bg-green-600 border-green-600 text-white shadow-md scale-[1.03] cursor-default'
                      : 'bg-white border-gray-300 text-gray-600 hover:border-green-400 hover:text-green-700 hover:shadow-sm'
                  }`}>
                  <span>⚽</span>
                  <span>{t.name}</span>
                  {isActive && (
                    <span className="flex items-center gap-0.5 ml-0.5 text-green-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse" />
                      Current
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {session && !loading && (
        <div className="mb-6">
          {/* Welcome card */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-3 flex-1 min-w-[140px]">
              {(!orgData?.logo_url || orgData.name === 'PUBLIC') && (
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-sm flex-shrink-0">
                  {(displayName ?? session.user.email ?? 'P').charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  Welcome back, {displayName}! 👋
                </p>
                {orgData?.name && orgData.name !== 'PUBLIC' && (
                  <p className="text-xs text-blue-600 mt-0.5">🏢 {orgData.name}</p>
                )}
                {favTeam && <p className="text-xs text-purple-600 mt-0.5">⭐ {favTeam}</p>}
              </div>
            </div>
            <div className="flex gap-4">
              {totalPts !== null && <div className="text-center"><p className="text-xl font-bold text-green-700">{totalPts}</p><p className="text-[11px] text-gray-400">points</p></div>}
              {myRank   !== null && <div className="text-center"><p className="text-xl font-bold text-gray-800">#{myRank}</p><p className="text-[11px] text-gray-400">rank</p></div>}
            </div>
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
