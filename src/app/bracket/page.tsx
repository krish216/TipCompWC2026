'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { clsx } from 'clsx'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'

// ── Group compositions (WC 2026) ─────────────────────────────────────────────
type Team = { name: string; flag: string }
type Group = { id: string; teams: Team[] }

const GROUPS: Group[] = [
  { id: 'A', teams: [
    { name: 'Mexico',       flag: '🇲🇽' }, { name: 'South Korea', flag: '🇰🇷' },
    { name: 'South Africa', flag: '🇿🇦' }, { name: 'Czechia',     flag: '🇨🇿' },
  ]},
  { id: 'B', teams: [
    { name: 'Canada',                 flag: '🇨🇦' }, { name: 'Qatar',       flag: '🇶🇦' },
    { name: 'Switzerland',            flag: '🇨🇭' }, { name: 'Bosnia and Herzegovina', flag: '🇧🇦' },
  ]},
  { id: 'C', teams: [
    { name: 'Brazil',   flag: '🇧🇷' }, { name: 'Morocco', flag: '🇲🇦' },
    { name: 'Haiti',    flag: '🇭🇹' }, { name: 'Scotland', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  ]},
  { id: 'D', teams: [
    { name: 'USA',       flag: '🇺🇸' }, { name: 'Paraguay',  flag: '🇵🇾' },
    { name: 'Australia', flag: '🇦🇺' }, { name: 'Turkey',    flag: '🇹🇷' },
  ]},
  { id: 'E', teams: [
    { name: 'Germany',     flag: '🇩🇪' }, { name: 'Ivory Coast', flag: '🇨🇮' },
    { name: 'Ecuador',     flag: '🇪🇨' }, { name: 'Curacao',     flag: '🏝️' },
  ]},
  { id: 'F', teams: [
    { name: 'Netherlands', flag: '🇳🇱' }, { name: 'Japan',   flag: '🇯🇵' },
    { name: 'Tunisia',     flag: '🇹🇳' }, { name: 'Sweden',  flag: '🇸🇪' },
  ]},
  { id: 'G', teams: [
    { name: 'Belgium',     flag: '🇧🇪' }, { name: 'Egypt',       flag: '🇪🇬' },
    { name: 'Iran',        flag: '🇮🇷' }, { name: 'New Zealand', flag: '🇳🇿' },
  ]},
  { id: 'H', teams: [
    { name: 'Spain',        flag: '🇪🇸' }, { name: 'Cabo Verde',  flag: '🇨🇻' },
    { name: 'Saudi Arabia', flag: '🇸🇦' }, { name: 'Uruguay',     flag: '🇺🇾' },
  ]},
  { id: 'I', teams: [
    { name: 'France',  flag: '🇫🇷' }, { name: 'Senegal', flag: '🇸🇳' },
    { name: 'Norway',  flag: '🇳🇴' }, { name: 'Iraq',    flag: '🇮🇶' },
  ]},
  { id: 'J', teams: [
    { name: 'Argentina', flag: '🇦🇷' }, { name: 'Algeria', flag: '🇩🇿' },
    { name: 'Austria',   flag: '🇦🇹' }, { name: 'Jordan',  flag: '🇯🇴' },
  ]},
  { id: 'K', teams: [
    { name: 'Portugal',   flag: '🇵🇹' }, { name: 'Uzbekistan', flag: '🇺🇿' },
    { name: 'Colombia',   flag: '🇨🇴' }, { name: 'DR Congo',   flag: '🇨🇩' },
  ]},
  { id: 'L', teams: [
    { name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' }, { name: 'Croatia', flag: '🇭🇷' },
    { name: 'Ghana',   flag: '🇬🇭' },   { name: 'Panama',  flag: '🇵🇦' },
  ]},
]

// Slot key helpers
const grpSlot = (g: string, rank: 1 | 2 | 3) => `grp:${g}:${rank}`
const thirdSlot = (g: string) => `third:${g}`

// ── Bracket structure ────────────────────────────────────────────────────────
// slot descriptors for each R32 match home/away:
//   '1X' = 1st place Group X, '2X' = 2nd place Group X
//   'T1'..'T8' = advancing third-place teams in selection order

type SlotDesc = string  // e.g. '1A', '2B', 'T1'

interface R32Match { key: string; home: SlotDesc; away: SlotDesc }

const R32_MATCHES: R32Match[] = [
  { key: 'r32:1',  home: '1A', away: '2B' },
  { key: 'r32:2',  home: '1C', away: '2D' },
  { key: 'r32:3',  home: '1B', away: '2A' },
  { key: 'r32:4',  home: '1D', away: '2C' },
  { key: 'r32:5',  home: '1E', away: '2F' },
  { key: 'r32:6',  home: '1G', away: '2H' },
  { key: 'r32:7',  home: '1F', away: '2E' },
  { key: 'r32:8',  home: '1H', away: '2G' },
  { key: 'r32:9',  home: '1I', away: '2J' },
  { key: 'r32:10', home: '1K', away: '2L' },
  { key: 'r32:11', home: '1J', away: '2I' },
  { key: 'r32:12', home: '1L', away: '2K' },
  { key: 'r32:13', home: 'T1', away: 'T2' },
  { key: 'r32:14', home: 'T3', away: 'T4' },
  { key: 'r32:15', home: 'T5', away: 'T6' },
  { key: 'r32:16', home: 'T7', away: 'T8' },
]

// Bracket tree: pairs of R32 keys → R16 key, pairs of R16 keys → QF, etc.
const BRACKET_TREE = {
  r16: [
    { key: 'r16:1', from: ['r32:1',  'r32:2']  },
    { key: 'r16:2', from: ['r32:3',  'r32:4']  },
    { key: 'r16:3', from: ['r32:5',  'r32:6']  },
    { key: 'r16:4', from: ['r32:7',  'r32:8']  },
    { key: 'r16:5', from: ['r32:9',  'r32:10'] },
    { key: 'r16:6', from: ['r32:11', 'r32:12'] },
    { key: 'r16:7', from: ['r32:13', 'r32:14'] },
    { key: 'r16:8', from: ['r32:15', 'r32:16'] },
  ],
  qf: [
    { key: 'qf:1', from: ['r16:1', 'r16:2'] },
    { key: 'qf:2', from: ['r16:3', 'r16:4'] },
    { key: 'qf:3', from: ['r16:5', 'r16:6'] },
    { key: 'qf:4', from: ['r16:7', 'r16:8'] },
  ],
  sf: [
    { key: 'sf:1', from: ['qf:1', 'qf:2'] },
    { key: 'sf:2', from: ['qf:3', 'qf:4'] },
  ],
  final: { key: 'final', from: ['sf:1', 'sf:2'] },
}

// ── Utility ──────────────────────────────────────────────────────────────────

function flagFor(name: string | null | undefined): string {
  if (!name) return '🏳️'
  for (const g of GROUPS) {
    const t = g.teams.find(t => t.name === name)
    if (t) return t.flag
  }
  return '🏳️'
}

// ── Main Page ────────────────────────────────────────────────────────────────

type Picks = Record<string, string | null>
type Section = 'groups' | 'thirds' | 'bracket'

export default function BracketPage() {
  const { session } = useSupabase()
  const { selectedTournId } = useUserPrefs()

  const [picks,   setPicks]   = useState<Picks>({})
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState<Section>('groups')

  const pendingRef = useRef<Map<string, string | null>>(new Map())
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load picks
  useEffect(() => {
    if (!session || !selectedTournId) { setLoading(false); return }
    fetch(`/api/bracket?tournament_id=${selectedTournId}`)
      .then(r => r.json())
      .then(({ picks: p }) => { if (p) setPicks(p) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [session, selectedTournId])

  // Debounced save — batches rapid taps into one flush
  const savePick = useCallback((slotKey: string, teamName: string | null) => {
    setPicks(prev => ({ ...prev, [slotKey]: teamName }))
    pendingRef.current.set(slotKey, teamName)

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      const batch = Array.from(pendingRef.current.entries())
      pendingRef.current.clear()
      await Promise.all(batch.map(([slot_key, team_name]) =>
        fetch('/api/bracket', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tournament_id: selectedTournId, slot_key, team_name }),
        })
      ))
    }, 600)
  }, [selectedTournId])

  // Derived: advancing thirds (in selection order)
  const advancingThirds: string[] = GROUPS
    .map(g => picks[thirdSlot(g.id)])
    .filter((t): t is string => !!t)

  // Resolve a slot descriptor to a team name from picks
  const resolveSlot = (desc: SlotDesc): string | null => {
    if (desc.startsWith('T')) {
      const idx = parseInt(desc.slice(1)) - 1
      return advancingThirds[idx] ?? null
    }
    const rank = desc[0] as '1' | '2'
    const grp  = desc[1]
    return picks[grpSlot(grp, parseInt(rank) as 1 | 2)] ?? null
  }

  if (!session) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 px-6">
      <span className="text-4xl">🔐</span>
      <p className="text-sm text-gray-500 text-center">Sign in to build your bracket</p>
    </div>
  )

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <svg className="w-6 h-6 animate-spin text-emerald-500" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>
    </div>
  )

  const thirdsCount = advancingThirds.length
  const groupsDone  = GROUPS.every(g => picks[grpSlot(g.id, 1)] && picks[grpSlot(g.id, 2)])

  return (
    <div className="max-w-2xl mx-auto px-4 pb-28 pt-4">
      <div className="mb-5">
        <h1 className="text-xl font-black text-gray-900">My Bracket</h1>
        <p className="text-xs text-gray-500 mt-0.5">WC 2026 · Pick qualifiers and your path to the final</p>
      </div>

      {/* Section nav */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1">
        {([
          { id: 'groups',  label: 'Groups',  badge: groupsDone ? '✓' : null },
          { id: 'thirds',  label: '3rd Place', badge: thirdsCount > 0 ? `${thirdsCount}/8` : null },
          { id: 'bracket', label: 'Bracket',  badge: null },
        ] as { id: Section; label: string; badge: string | null }[]).map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            className={clsx(
              'flex-1 flex items-center justify-center gap-1 py-2 text-xs font-semibold rounded-lg transition-all',
              section === s.id ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'
            )}>
            {s.label}
            {s.badge && (
              <span className={clsx(
                'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                s.badge === '✓' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'
              )}>{s.badge}</span>
            )}
          </button>
        ))}
      </div>

      {section === 'groups'  && <GroupsSection  picks={picks} savePick={savePick} />}
      {section === 'thirds'  && <ThirdsSection  picks={picks} savePick={savePick} advancingThirds={advancingThirds} />}
      {section === 'bracket' && <BracketSection picks={picks} savePick={savePick} resolveSlot={resolveSlot} advancingThirds={advancingThirds} />}
    </div>
  )
}

// ── Groups Section ───────────────────────────────────────────────────────────

function GroupsSection({ picks, savePick }: { picks: Picks; savePick: (k: string, v: string | null) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">Pick the top 2 teams to qualify from each group. The 3rd-place team is used in the next step.</p>
      {GROUPS.map(g => (
        <GroupCard key={g.id} group={g} picks={picks} savePick={savePick} />
      ))}
    </div>
  )
}

function GroupCard({ group, picks, savePick }: {
  group: Group
  picks: Picks
  savePick: (k: string, v: string | null) => void
}) {
  const { id, teams } = group
  const first  = picks[grpSlot(id, 1)] ?? null
  const second = picks[grpSlot(id, 2)] ?? null
  const third  = picks[grpSlot(id, 3)] ?? null

  const assign = (teamName: string, rank: 1 | 2 | 3) => {
    const key = grpSlot(id, rank)

    // Deselect if already selected at this rank
    if (picks[key] === teamName) {
      savePick(key, null)
      return
    }
    // Remove this team from any other rank slot in this group
    if (picks[grpSlot(id, 1)] === teamName) savePick(grpSlot(id, 1), null)
    if (picks[grpSlot(id, 2)] === teamName) savePick(grpSlot(id, 2), null)
    if (picks[grpSlot(id, 3)] === teamName) savePick(grpSlot(id, 3), null)
    savePick(key, teamName)
  }

  const rankOf = (name: string): 1 | 2 | 3 | null => {
    if (first  === name) return 1
    if (second === name) return 2
    if (third  === name) return 3
    return null
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-50 border-b border-emerald-100">
        <span className="text-xs font-bold text-emerald-800 tracking-wider">GROUP {id}</span>
        <div className="flex items-center gap-1.5">
          {[first, second].map((t, i) => (
            <span key={i} className={clsx(
              'text-xs px-2 py-0.5 rounded-full font-medium',
              t ? 'bg-emerald-600 text-white' : 'bg-white text-gray-400 border border-gray-200'
            )}>
              {t ? `${flagFor(t)} ${t}` : (i === 0 ? '1st ?' : '2nd ?')}
            </span>
          ))}
        </div>
      </div>

      {/* Teams */}
      <div className="divide-y divide-gray-50">
        {teams.map(team => {
          const rank = rankOf(team.name)
          return (
            <div key={team.name} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm text-gray-800 flex items-center gap-2">
                <span className="text-base">{team.flag}</span>
                {team.name}
              </span>
              <div className="flex gap-1">
                {([1, 2, 3] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => assign(team.name, r)}
                    className={clsx(
                      'w-7 h-7 rounded-full text-[11px] font-bold transition-all border',
                      rank === r
                        ? r === 1 ? 'bg-emerald-600 text-white border-emerald-600'
                          : r === 2 ? 'bg-blue-500 text-white border-blue-500'
                          : 'bg-amber-400 text-white border-amber-400'
                        : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400'
                    )}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Thirds Section ───────────────────────────────────────────────────────────

function ThirdsSection({ picks, savePick, advancingThirds }: {
  picks: Picks
  savePick: (k: string, v: string | null) => void
  advancingThirds: string[]
}) {
  const [showToast, setShowToast] = useState(false)
  const prevLen = useRef(advancingThirds.length)

  useEffect(() => {
    if (prevLen.current < 8 && advancingThirds.length === 8) {
      setShowToast(true)
      const t = setTimeout(() => setShowToast(false), 3500)
      return () => clearTimeout(t)
    }
    prevLen.current = advancingThirds.length
  }, [advancingThirds.length])

  const toggle = (groupId: string, teamName: string) => {
    const key = thirdSlot(groupId)
    if (picks[key] === teamName) {
      savePick(key, null)
    } else if (advancingThirds.length < 8) {
      savePick(key, teamName)
    }
  }

  const count = advancingThirds.length

  return (
    <>
      {/* Success toast */}
      {showToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-emerald-600 text-white text-sm font-semibold px-5 py-2.5 rounded-full shadow-lg pointer-events-none">
          <span>✓</span>
          <span>All 8 third-place qualifiers selected</span>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">Pick 8 of the 12 third-placed teams to advance to R32.</p>
          <span className={clsx(
            'text-xs font-bold px-2.5 py-1 rounded-full',
            count === 8 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
          )}>
            {count}/8
          </span>
        </div>

        <div className="flex flex-col gap-3">
          {GROUPS.map(g => {
            const thirdTeam = picks[grpSlot(g.id, 3)]
            const advancing = picks[thirdSlot(g.id)]
            const locked    = !thirdTeam
            const full      = count >= 8 && !advancing

            return (
              <div key={g.id}
                className={clsx(
                  'rounded-xl border p-3 transition-all',
                  advancing ? 'bg-emerald-50 border-emerald-300' :
                  locked    ? 'bg-gray-50 border-gray-100 opacity-60' :
                  full      ? 'bg-gray-50 border-gray-100 opacity-50' :
                              'bg-white border-gray-200'
                )}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-gray-500 tracking-wider">GROUP {g.id}</span>
                  {advancing && <span className="text-[10px] text-emerald-600 font-semibold">Advancing ✓</span>}
                </div>
                {thirdTeam ? (
                  <button
                    disabled={full && !advancing}
                    onClick={() => toggle(g.id, thirdTeam)}
                    className="w-full flex items-center gap-2 text-left">
                    <span className="text-base">{flagFor(thirdTeam)}</span>
                    <span className="text-sm font-medium text-gray-800">{thirdTeam}</span>
                  </button>
                ) : (
                  <p className="text-[11px] text-gray-400 italic">Pick 3rd place in Groups first</p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ── Bracket tree layout constants ────────────────────────────────────────────
const SLOT_H  = 80    // height per R32 slot (px) — sets vertical scale of the whole tree
const CARD_H  = 64    // match card height (px)
const LABEL_H = 28    // round label row height above the tree
const COL_W   = 148   // match card column width (px)
const CONN_W  = 40    // connector area width between columns (px)
const TREE_H  = R32_MATCHES.length * SLOT_H       // 1280px (matches only)
const TOTAL_H = LABEL_H + TREE_H                   // 1308px
const CHAMP_W = 72
const TOTAL_W = 5 * COL_W + 4 * CONN_W + CHAMP_W  // full bracket width

// Y-center of a match within the tree area (excludes LABEL_H)
const treeCY = (r: number, i: number) => (i + 0.5) * Math.pow(2, r) * SLOT_H
// Absolute top of a match card within the container (includes LABEL_H)
const matchTY = (r: number, i: number) => LABEL_H + treeCY(r, i) - CARD_H / 2
// Left edge of a round column
const colX    = (r: number) => r * (COL_W + CONN_W)

const ROUND_LABELS = ['Round of 32', 'Round of 16', 'Quarter-finals', 'Semi-finals', 'Final']

// ── Bracket Section ──────────────────────────────────────────────────────────

function BracketSection({ picks, savePick, resolveSlot }: {
  picks: Picks
  savePick: (k: string, v: string | null) => void
  resolveSlot: (desc: SlotDesc) => string | null
  advancingThirds: string[]
}) {
  const champion  = picks['final'] ?? null
  const scrollRef = useRef<HTMLDivElement>(null)

  // Intercept picks: auto-scroll to the next round when QF or SF winner is chosen
  const bracketPick = useCallback((key: string, team: string | null) => {
    savePick(key, team)
    if (!team) return
    let targetLeft: number | null = null
    if (key.startsWith('qf:')) targetLeft = colX(3) - 16  // reveal SF column
    if (key.startsWith('sf:')) targetLeft = colX(4) - 16  // reveal Final column
    if (targetLeft !== null) {
      requestAnimationFrame(() =>
        scrollRef.current?.scrollTo({ left: targetLeft!, behavior: 'smooth' })
      )
    }
  }, [savePick])

  return (
    <div>
      <p className="text-xs text-gray-500 mb-3">
        Pick winners for each match. Teams shown are from your group stage picks.
      </p>
      <div ref={scrollRef} className="overflow-x-auto" style={{ overflowY: 'auto', maxHeight: '78vh' }}>
        <div style={{ position: 'relative', width: TOTAL_W, height: TOTAL_H }}>

          {/* Round labels */}
          {ROUND_LABELS.map((lbl, ri) => (
            <div key={ri}
              style={{ position: 'absolute', top: 0, left: colX(ri), width: COL_W, height: LABEL_H }}
              className="flex items-center justify-center">
              <span className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">{lbl}</span>
            </div>
          ))}
          <div style={{ position: 'absolute', top: 0, left: TOTAL_W - CHAMP_W, width: CHAMP_W, height: LABEL_H }}
            className="flex items-center justify-center">
            <span className="text-[10px] font-bold text-amber-500 tracking-wider uppercase">Winner</span>
          </div>

          {/* ── Round of 32 ── */}
          {R32_MATCHES.map((m, i) => (
            <div key={m.key} style={{ position: 'absolute', top: matchTY(0, i), left: colX(0), width: COL_W }}>
              <BracketMatchCard
                matchKey={m.key}
                homeTeam={resolveSlot(m.home)} awayTeam={resolveSlot(m.away)}
                homeDesc={m.home}              awayDesc={m.away}
                winner={picks[m.key] ?? null}  savePick={savePick}
              />
            </div>
          ))}
          <BracketConnectors fromRoundIdx={0} fromCount={16} />

          {/* ── Round of 16 ── */}
          {BRACKET_TREE.r16.map((m, i) => (
            <div key={m.key} style={{ position: 'absolute', top: matchTY(1, i), left: colX(1), width: COL_W }}>
              <BracketMatchCard
                matchKey={m.key}
                homeTeam={picks[m.from[0]] ?? null} awayTeam={picks[m.from[1]] ?? null}
                homeDesc={m.from[0]}                awayDesc={m.from[1]}
                winner={picks[m.key] ?? null}        savePick={savePick}
              />
            </div>
          ))}
          <BracketConnectors fromRoundIdx={1} fromCount={8} />

          {/* ── Quarter-finals ── */}
          {BRACKET_TREE.qf.map((m, i) => (
            <div key={m.key} style={{ position: 'absolute', top: matchTY(2, i), left: colX(2), width: COL_W }}>
              <BracketMatchCard
                matchKey={m.key}
                homeTeam={picks[m.from[0]] ?? null} awayTeam={picks[m.from[1]] ?? null}
                homeDesc={m.from[0]}                awayDesc={m.from[1]}
                winner={picks[m.key] ?? null}        savePick={bracketPick}
              />
            </div>
          ))}
          <BracketConnectors fromRoundIdx={2} fromCount={4} />

          {/* ── Semi-finals ── */}
          {BRACKET_TREE.sf.map((m, i) => (
            <div key={m.key} style={{ position: 'absolute', top: matchTY(3, i), left: colX(3), width: COL_W }}>
              <BracketMatchCard
                matchKey={m.key}
                homeTeam={picks[m.from[0]] ?? null} awayTeam={picks[m.from[1]] ?? null}
                homeDesc={m.from[0]}                awayDesc={m.from[1]}
                winner={picks[m.key] ?? null}        savePick={bracketPick}
              />
            </div>
          ))}
          <BracketConnectors fromRoundIdx={3} fromCount={2} />

          {/* ── Final ── */}
          <div style={{ position: 'absolute', top: matchTY(4, 0), left: colX(4), width: COL_W }}>
            <BracketMatchCard
              matchKey={BRACKET_TREE.final.key}
              homeTeam={picks[BRACKET_TREE.final.from[0]] ?? null}
              awayTeam={picks[BRACKET_TREE.final.from[1]] ?? null}
              homeDesc={BRACKET_TREE.final.from[0]}
              awayDesc={BRACKET_TREE.final.from[1]}
              winner={champion}
              savePick={savePick}
            />
          </div>

          {/* ── Champion ── */}
          {champion && (
            <div style={{
              position: 'absolute',
              top: LABEL_H + treeCY(4, 0) - 44,
              left: colX(4) + COL_W + 10,
              width: CHAMP_W - 10,
            }} className="flex flex-col items-center gap-1 bg-amber-50 border border-amber-200 rounded-xl px-2 py-2.5">
              <span className="text-2xl leading-none">{flagFor(champion)}</span>
              <span className="text-[9px] font-bold text-amber-700 text-center leading-tight">{champion}</span>
              <span className="text-base leading-none">🏆</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// SVG bracket connectors between two adjacent rounds
function BracketConnectors({ fromRoundIdx, fromCount }: { fromRoundIdx: number; fromCount: number }) {
  const xV      = CONN_W / 2
  const toCount = fromCount / 2

  return (
    <svg
      style={{ position: 'absolute', top: LABEL_H, left: colX(fromRoundIdx) + COL_W }}
      width={CONN_W} height={TREE_H}>
      {Array.from({ length: toCount }, (_, i) => {
        const y1   = treeCY(fromRoundIdx,     i * 2)
        const y2   = treeCY(fromRoundIdx,     i * 2 + 1)
        const yMid = treeCY(fromRoundIdx + 1, i)
        return (
          <g key={i} stroke="#d1d5db" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <line x1={0}     y1={y1}   x2={xV}     y2={y1}   />
            <line x1={xV}    y1={y1}   x2={xV}     y2={y2}   />
            <line x1={0}     y1={y2}   x2={xV}     y2={y2}   />
            <line x1={xV}    y1={yMid} x2={CONN_W} y2={yMid} />
          </g>
        )
      })}
    </svg>
  )
}

function BracketMatchCard({ matchKey, homeTeam, awayTeam, homeDesc, awayDesc, winner, savePick }: {
  matchKey: string
  homeTeam: string | null
  awayTeam: string | null
  homeDesc: string
  awayDesc: string
  winner: string | null
  savePick: (k: string, v: string | null) => void
}) {
  const pick = (team: string | null) => {
    if (!team) return
    savePick(matchKey, winner === team ? null : team)
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
      style={{ height: CARD_H }}>
      {[
        { team: homeTeam, desc: homeDesc },
        { team: awayTeam, desc: awayDesc },
      ].map(({ team, desc }, i) => {
        const isWinner = !!team && winner === team
        const isLoser  = !!winner && !!team && winner !== team
        return (
          <button
            key={i}
            onClick={() => pick(team)}
            disabled={!team}
            style={{ height: CARD_H / 2 }}
            className={clsx(
              'w-full flex items-center gap-1.5 px-2.5 text-left transition-all',
              i === 0 ? '' : 'border-t border-gray-100',
              isWinner ? 'bg-emerald-50'
              : isLoser ? 'opacity-40'
              : team ? 'hover:bg-gray-50'
              : 'cursor-default'
            )}>
            <span className="text-sm leading-none flex-shrink-0">
              {team ? flagFor(team) : '⬜'}
            </span>
            <span className={clsx(
              'text-[11px] truncate flex-1 leading-none',
              isWinner ? 'font-bold text-emerald-700' : 'font-medium text-gray-700',
              !team && 'text-gray-300 italic'
            )}>
              {team ?? desc}
            </span>
            {isWinner && <span className="text-emerald-500 text-[10px] flex-shrink-0">✓</span>}
          </button>
        )
      })}
    </div>
  )
}
