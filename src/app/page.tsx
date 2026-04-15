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
  const [compData,             setOrgData]             = useState<{name:string;logo_url:string|null;app_name?:string|null}|null>(null)
  const [userComps,            setUserComps]           = useState<{id:string;name:string;app_name?:string|null;logo_url?:string|null}[]>([])
  const [selectedCompId,       setSelectedCompId]      = useState<string | null>(null)
  const [userTournaments,     setUserTournaments]     = useState<any[]>([])
  const [activeTournamentId,  setActiveTournamentId]  = useState<string | null>(null)
  const [activeTournament, setActiveTournament] = useState<{name:string;slug:string}|null>(null)
  const started = Date.now() >= KICKOFF.getTime()

  useEffect(() => {
    if (!session) { setLoading(false); return }
    const load = async () => {
      const [userRes, lbRes, adminRes] = await Promise.all([
        supabase.from('users').select('display_name, favourite_team, comp_id').eq('id', session.user.id).single(),
        fetch('/api/leaderboard?scope=global&limit=200'),
        fetch('/api/admin'),
      ])
      const ud = userRes.data as any
      setDisplayName(ud?.display_name ?? null)
      setFavTeam(ud?.favourite_team ?? null)
      // Fetch org explicitly to avoid RLS issues with nested joins
      const compId = ud?.comp_id ?? null
      if (compId) {
        const { data: compRow } = await supabase
          .from('comps').select('name, logo_url, app_name').eq('id', compId).single()
        setOrgData(compRow ?? null)
      } else {
        setOrgData(null)
      }
      // Will load comps for tournament after resolving activeTournId below
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
      // Fetch all comps the user has joined for the active tournament
      if (activeTournId) {
        try {
          const ucRes  = await fetch('/api/user-comps')
          const ucData = await ucRes.json()
          if (!ucData.error && Array.isArray(ucData.data)) {
            const comps = (ucData.data as any[])
              .map((uc: any) => Array.isArray(uc.comps) ? uc.comps[0] : uc.comps)
              .filter((c: any) => c && c.tournament_id === activeTournId)
            setUserComps(comps)
            // Default selected comp: user's current comp_id or first in list
            const primary = comps.find((c: any) => c.id === compId) ?? comps[0] ?? null
            if (primary) {
              setSelectedCompId(primary.id)
              setOrgData({ name: primary.name, logo_url: primary.logo_url ?? null, app_name: primary.app_name ?? null })
            }
          }
        } catch { /* user_comps may not exist yet */ }
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
    await supabase.from('users').update({ active_tournament_id: tid }).eq('id', session!.user.id)

    // Reload comps for the newly selected tournament
    try {
      const ucRes  = await fetch('/api/user-comps')
      const ucData = await ucRes.json()
      if (!ucData.error && Array.isArray(ucData.data)) {
        const comps = (ucData.data as any[])
          .map((uc: any) => Array.isArray(uc.comps) ? uc.comps[0] : uc.comps)
          .filter((c: any) => c && c.tournament_id === tid)
        setUserComps(comps)
        const { data: me } = await supabase.from('users').select('comp_id').eq('id', session!.user.id).single()
        const cid = (me as any)?.comp_id ?? null
        const primary = comps.find((c: any) => c.id === cid) ?? comps[0] ?? null
        if (primary) {
          setSelectedCompId(primary.id)
          setOrgData({ name: primary.name, logo_url: primary.logo_url ?? null, app_name: primary.app_name ?? null })
        } else {
          setSelectedCompId(null)
          setOrgData(null)
        }
      }
    } catch { /* ignore */ }
  }

  const switchComp = async (comp: {id:string;name:string;app_name?:string|null;logo_url?:string|null}) => {
    setSelectedCompId(comp.id)
    setOrgData({ name: comp.name, logo_url: comp.logo_url ?? null, app_name: comp.app_name ?? null })
    await supabase.from('users').update({ comp_id: comp.id }).eq('id', session!.user.id)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <CountdownBanner />

      {/* ── Context selector — tournament then comp ── */}
      {session && (
        <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Tournament row */}
          {userTournaments.length > 0 && (
            <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-xl)', padding: '14px 16px' }}>
              <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Tournament
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {userTournaments.map((ut: any) => {
                  const t = Array.isArray(ut.tournaments) ? ut.tournaments[0] : ut.tournaments
                  if (!t) return null
                  const isActive = activeTournamentId === ut.tournament_id
                  return (
                    <button key={ut.tournament_id}
                      onClick={() => switchTournament(ut.tournament_id, t.name)}
                      disabled={isActive}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 14px',
                        borderRadius: 'var(--border-radius-lg)',
                        border: isActive ? '2px solid var(--color-border-success)' : '1.5px solid var(--color-border-tertiary)',
                        background: isActive ? 'var(--color-background-success)' : 'var(--color-background-secondary)',
                        color: isActive ? 'var(--color-text-success)' : 'var(--color-text-secondary)',
                        fontSize: 13, fontWeight: isActive ? 600 : 400,
                        cursor: isActive ? 'default' : 'pointer',
                        transition: 'all 0.15s',
                      }}>
                      <span style={{ fontSize: 14 }}>⚽</span>
                      <span>{t.name}</span>
                      {isActive && (
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-text-success)', opacity: 0.7, marginLeft: 2 }} />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Comp row — only shown after a tournament is selected */}
          {activeTournamentId && (
            <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-xl)', padding: '14px 16px' }}>
              <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Active comp
              </p>
              {userComps.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>No comp joined for this tournament</p>
                  <a href="/tribe" style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-info)', textDecoration: 'none' }}>Join one →</a>
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {userComps.map(c => {
                    const isActive = selectedCompId === c.id
                    return (
                      <button key={c.id} onClick={() => !isActive && switchComp(c)} disabled={isActive}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px 14px',
                          borderRadius: 'var(--border-radius-lg)',
                          border: isActive ? '2px solid var(--color-border-info)' : '1.5px solid var(--color-border-tertiary)',
                          background: isActive ? 'var(--color-background-info)' : 'var(--color-background-secondary)',
                          color: isActive ? 'var(--color-text-info)' : 'var(--color-text-secondary)',
                          fontSize: 13, fontWeight: isActive ? 600 : 400,
                          cursor: isActive ? 'default' : 'pointer',
                          transition: 'all 0.15s',
                        }}>
                        {c.logo_url && (
                          <img src={c.logo_url} alt="" style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
                        )}
                        <span>{c.app_name || c.name}</span>
                        {isActive && (
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-text-info)', opacity: 0.7, marginLeft: 2 }} />
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Active context summary — logo + title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-xl)' }}>
            {compData?.logo_url && compData.name !== 'PUBLIC' ? (
              <img src={compData.logo_url} alt={compData.name}
                style={{ width: 48, height: 48, borderRadius: 'var(--border-radius-md)', objectFit: 'cover', flexShrink: 0, border: '0.5px solid var(--color-border-tertiary)' }} />
            ) : (
              <img src="/wc2026-logo.png" alt="WC2026"
                style={{ width: 40, height: 'auto', flexShrink: 0, objectFit: 'contain' }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {compData?.app_name
                  ? compData.app_name
                  : compData?.name && compData.name !== 'PUBLIC'
                    ? compData.name
                    : 'World Cup 2026'}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                {activeTournament ? activeTournament.name : 'Tipping Competition'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Non-logged-in hero */}
      {!session && (
        <div className="mb-8 text-center">
          <img src="/wc2026-logo.png" alt="FIFA World Cup 2026" width={80} height={120}
            className="w-20 h-auto mx-auto mb-3 drop-shadow-md object-contain" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">World Cup 2026 Tipping Comp</h1>
          <p className="text-sm text-gray-500">Predict every match. Compete with your tribe.</p>
        </div>
      )}

      {session && !loading && (
        <div className="mb-6">
          {/* Welcome card */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-3 flex-1 min-w-[140px]">
              {(!compData?.logo_url || compData.name === 'PUBLIC') && (
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-sm flex-shrink-0">
                  {(displayName ?? session.user.email ?? 'P').charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  Welcome back, {displayName}! 👋
                </p>
                {compData?.name && compData.name !== 'PUBLIC' && (
                  <p className="text-xs text-blue-600 mt-0.5">🏢 {compData.name}</p>
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
