'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { CountdownBanner } from '@/components/game/CountdownBanner'
import { Spinner } from '@/components/ui'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'

const KICKOFF = new Date('2026-06-11T19:00:00Z')

export default function HomePage() {
  const { session, supabase } = useSupabase()

  // User profile
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [totalPts,    setTotalPts]    = useState<number | null>(null)
  const [myRank,      setMyRank]      = useState<number | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [isAdmin,     setIsAdmin]     = useState(false)

  // Tournament + comp selection comes from shared context
  const {
    activeTournaments, tournsComps,
    selectedTournId, selectedCompId,
    selectedTourn, selectedComp,
    pickTournament, pickComp,
    loading: contextLoading,
  } = useUserPrefs()

  const started = Date.now() >= KICKOFF.getTime()

  // ── Load on session ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) { setLoading(false); return }
    const load = async () => {
      // 1. User profile + leaderboard + admin check (parallel)
      const [userRes, lbRes, adminRes] = await Promise.all([
        supabase.from('users').select('display_name, comp_id').eq('id', session.user.id).single(),
        fetch('/api/leaderboard?scope=global&limit=200'),
        fetch('/api/admin'),
      ])
      const ud = userRes.data as any
      setDisplayName(ud?.display_name ?? null)

      const lbData = await lbRes.json()
      const myRow = lbData.my_entry ?? (lbData.data ?? []).find((e: any) => e.user_id === session.user.id)
      if (myRow) { setTotalPts(myRow.total_points); setMyRank(myRow.rank) }

      const adminData = await adminRes.json()
      setIsAdmin(adminData.is_admin === true)

      // Tournaments + comps are managed by UserPrefsContext
      // Just set loading false once profile is done
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

  // pickTournament and pickComp come from useUserPrefs()

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <CountdownBanner />

      {/* ── Not logged in hero ── */}
      {!session && (
        <div className="mb-8 text-center">
          <img src="/wc2026-logo.png" alt="FIFA World Cup 2026" width={80} height={120}
            className="w-20 h-auto mx-auto mb-3 drop-shadow-md object-contain" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">World Cup 2026 Tipping Comp</h1>
          <p className="text-sm text-gray-500">Predict every match. Compete with your tribe.</p>
        </div>
      )}

      {/* ── Logged in: tournament + comp selector ── */}
      {session && (
        <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Step 1 — Tournament */}
          <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-xl)', padding: '14px 16px' }}>
            <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              {activeTournaments.length > 1 ? 'Select tournament' : 'Tournament'}
            </p>
            {(loading || contextLoading) ? (
              <div style={{ height: 36, display: 'flex', alignItems: 'center' }}>
                <Spinner className="w-5 h-5" />
              </div>
            ) : activeTournaments.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>No active tournaments</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {activeTournaments.map(t => {
                  const isSel = selectedTournId === t.id
                  return (
                    <button key={t.id} onClick={() => !isSel && pickTournament(t.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                        borderRadius: 'var(--border-radius-lg)', cursor: isSel ? 'default' : 'pointer',
                        border: isSel ? '2px solid var(--color-border-success)' : '1.5px solid var(--color-border-tertiary)',
                        background: isSel ? 'var(--color-background-success)' : 'var(--color-background-secondary)',
                        color: isSel ? 'var(--color-text-success)' : 'var(--color-text-secondary)',
                        fontSize: 13, fontWeight: isSel ? 600 : 400, transition: 'all 0.15s',
                      }}>
                      <span>⚽</span>
                      <span>{t.name}</span>
                      {isSel && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-text-success)', opacity: 0.7 }} />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Step 2 — Comp (only after tournament is selected) */}
          {selectedTournId && (
            <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-xl)', padding: '14px 16px' }}>
              <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                {tournsComps.length > 1 ? 'Select comp' : 'Comp'}
              </p>
              {tournsComps.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)' }}>
                    No comp joined for this tournament
                  </p>
                  <a href="/tribe" style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-success)', textDecoration: 'none', flexShrink: 0 }}>
                    Join one →
                  </a>
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {tournsComps.map(c => {
                    const isSel = selectedCompId === c.id
                    return (
                      <button key={c.id} onClick={() => !isSel && pickComp(c)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                          borderRadius: 'var(--border-radius-lg)', cursor: isSel ? 'default' : 'pointer',
                          border: isSel ? '2px solid var(--color-border-info)' : '1.5px solid var(--color-border-tertiary)',
                          background: isSel ? 'var(--color-background-info)' : 'var(--color-background-secondary)',
                          color: isSel ? 'var(--color-text-info)' : 'var(--color-text-secondary)',
                          fontSize: 13, fontWeight: isSel ? 600 : 400, transition: 'all 0.15s',
                        }}>
                        {c.logo_url && <img src={c.logo_url} alt="" style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />}
                        <span>{c.app_name || c.name}</span>
                        {isSel && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-text-info)', opacity: 0.7 }} />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Context summary bar */}
          {(selectedTourn || selectedComp) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', border: '0.5px solid var(--color-border-tertiary)' }}>
              {selectedComp?.logo_url
                ? <img src={selectedComp.logo_url} alt="" style={{ width: 32, height: 32, borderRadius: 'var(--border-radius-md)', objectFit: 'cover', flexShrink: 0 }} />
                : <img src="/wc2026-logo.png" alt="" style={{ width: 28, height: 'auto', flexShrink: 0 }} />
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedComp ? (selectedComp.app_name || selectedComp.name) : selectedTourn?.name}
                </p>
                {selectedComp && selectedTourn && (
                  <p style={{ margin: '1px 0 0', fontSize: 11, color: 'var(--color-text-secondary)' }}>{selectedTourn.name}</p>
                )}
              </div>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
                {selectedComp ? 'Active context' : 'No comp selected'}
              </span>
            </div>
          )}
        </div>
      )}

      {session && !loading && (
        <div className="mb-6">
          {/* Welcome card */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-3 flex-1 min-w-[140px]">
              {!selectedComp?.logo_url && (
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-sm flex-shrink-0">
                  {(displayName ?? session.user.email ?? 'P').charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  Welcome back, {displayName}! 👋
                </p>
                {selectedComp && (
                  <p className="text-xs text-blue-600 mt-0.5">🏢 {selectedComp.app_name || selectedComp.name}</p>
                )}
                {selectedTourn && (
                  <p className="text-xs text-gray-400 mt-0.5">⚽ {selectedTourn.name}</p>
                )}
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
