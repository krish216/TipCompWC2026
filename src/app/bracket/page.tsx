'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { clsx } from 'clsx'
import { useSupabase } from '@/components/layout/SupabaseProvider'
import { useUserPrefs } from '@/components/layout/UserPrefsContext'
import { Spinner, Flag } from '@/components/ui'
import { BracketGuestEntryModal, ENTERED_KEY } from '@/components/game/BracketGuestEntryModal'
import { BracketEntryModal } from '@/components/game/BracketEntryModal'
import { SponsorLogoMark } from '@/components/game/SponsorLogoMark'

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
  { key: 'r32:1',  home: '1E', away: 'T1' }, // T1 : Groups A, B, C, D or F 
  { key: 'r32:2',  home: '1I', away: 'T2' }, // T2 : Groups C,D,F,G, or H
  { key: 'r32:3',  home: '2A', away: '2B' },
  { key: 'r32:4',  home: '1F', away: '2C' },
  { key: 'r32:5',  home: '2K', away: '2L' },
  { key: 'r32:6',  home: '1H', away: '2J' },
  { key: 'r32:7',  home: '1D', away: 'T3' }, // T3 : Groups B,E,F,I, and J 
  { key: 'r32:8',  home: '1G', away: 'T4' }, // T4 : Groups A,E,H,I and J.
  { key: 'r32:9',  home: '1C', away: '2F' },
  { key: 'r32:10', home: '2E', away: '2I' },
  { key: 'r32:11', home: '1A', away: 'T5' }, // T5 : Groups C,E,F,H and I
  { key: 'r32:12', home: '1L', away: 'T6' }, // T6 : Groups E,H,I,J and K.
  { key: 'r32:13', home: '1J', away: '2H' },
  { key: 'r32:14', home: '2D', away: '2G' },
  { key: 'r32:15', home: '1B', away: 'T7' }, // T7 : Groups E,F,G,I and J 
  { key: 'r32:16', home: '1K', away: 'T8' }, // T8 : Groups D,E,I,J and L.
]




// ── Third-place slot rules ────────────────────────────────────────────────────
// Each T slot feeds a specific R32 fixture; eligible groups are per FIFA WC 2026 rules.
const T_SLOTS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'] as const
type TSlot = (typeof T_SLOTS)[number]

const THIRD_SLOT_GROUPS: Record<TSlot, string[]> = {
  T1: ['A', 'B', 'C', 'D', 'F'],
  T2: ['C', 'D', 'F', 'G', 'H'],
  T3: ['B', 'E', 'F', 'I', 'J'],
  T4: ['A', 'E', 'H', 'I', 'J'],
  T5: ['C', 'E', 'F', 'H', 'I'],
  T6: ['E', 'H', 'I', 'J', 'K'],
  T7: ['E', 'F', 'G', 'I', 'J'],
  T8: ['D', 'E', 'I', 'J', 'L'],
}

// Which opponent each T slot faces in R32 (derived from R32_MATCHES so it stays in sync)
const T_SLOT_OPPONENT: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const m of R32_MATCHES) {
    if (m.away.startsWith('T')) map[m.away] = m.home
    if (m.home.startsWith('T')) map[m.home] = m.away
  }
  return map
})()

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
  final:      { key: 'final', from: ['sf:1', 'sf:2'] },
  thirdPlace: { key: 'tp',    from: ['sf:1', 'sf:2'] },
}

// All knockout-round slot keys (used to cascade-clear when group/thirds change)
const BRACKET_KEYS: string[] = [
  ...R32_MATCHES.map(m => m.key),
  ...BRACKET_TREE.r16.map(m => m.key),
  ...BRACKET_TREE.qf.map(m => m.key),
  ...BRACKET_TREE.sf.map(m => m.key),
  BRACKET_TREE.final.key,
  BRACKET_TREE.thirdPlace.key,
]

// Returns all slot keys downstream of `key` in the bracket tree
function getDownstream(key: string): string[] {
  const result: string[] = []
  if (key.startsWith('r32:')) {
    const next = BRACKET_TREE.r16.find(m => m.from.includes(key))
    if (next) { result.push(next.key); result.push(...getDownstream(next.key)) }
  } else if (key.startsWith('r16:')) {
    const next = BRACKET_TREE.qf.find(m => m.from.includes(key))
    if (next) { result.push(next.key); result.push(...getDownstream(next.key)) }
  } else if (key.startsWith('qf:')) {
    const next = BRACKET_TREE.sf.find(m => m.from.includes(key))
    if (next) { result.push(next.key); result.push(...getDownstream(next.key)) }
  } else if (key.startsWith('sf:')) {
    result.push(BRACKET_TREE.final.key)
    result.push(BRACKET_TREE.thirdPlace.key)
  }
  return result
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

// ── Upset scoring ────────────────────────────────────────────────────────────
// Higher score = bigger underdog. Used to surface the spiciest bracket call.
const TEAM_UPSET_SCORE: Record<string, number> = {
  'Brazil': 5,  'France': 5,   'Argentina': 5,
  'Germany': 8, 'Spain': 8,    'England': 10,  'Portugal': 10, 'Netherlands': 12,
  'Belgium': 20, 'Uruguay': 22, 'Colombia': 25, 'Mexico': 25,   'USA': 28,
  'Croatia': 28, 'Morocco': 30, 'Switzerland': 30, 'Senegal': 32, 'Japan': 32,
  'South Korea': 35, 'Turkey': 35, 'Ecuador': 38,
  'Austria': 40, 'Norway': 42, 'Ivory Coast': 42,
  'Australia': 45, 'Canada': 45, 'Sweden': 45,
  'Ghana': 48, 'Tunisia': 48, 'Iran': 50, 'Algeria': 50, 'Scotland': 52,
  'Czechia': 55, 'Paraguay': 55, 'Bosnia and Herzegovina': 58,
  'Egypt': 60, 'New Zealand': 60,
  'South Africa': 65, 'Saudi Arabia': 65, 'Panama': 65, 'DR Congo': 68,
  'Iraq': 70, 'Qatar': 70, 'Cabo Verde': 70, 'Uzbekistan': 72, 'Jordan': 72,
  'Haiti': 75, 'Curacao': 80,
}

function findBiggestUpset(picks: Picks): { team: string; label: string } | null {
  const champion = picks['final'] ?? null
  const rounds: { keys: string[]; label: string; weight: number }[] = [
    { keys: BRACKET_TREE.r16.map(m => m.key), label: 'in the quarters', weight: 2 },
    { keys: BRACKET_TREE.qf.map(m => m.key),  label: 'in the semis',    weight: 3 },
    { keys: BRACKET_TREE.sf.map(m => m.key),  label: 'in the final',    weight: 4 },
  ]
  let bestScore = 0
  let best: { team: string; label: string } | null = null
  for (const { keys, label, weight } of rounds) {
    for (const key of keys) {
      const team = picks[key]
      if (!team || team === champion) continue
      const score = (TEAM_UPSET_SCORE[team] ?? 50) * weight
      if (score > bestScore) { bestScore = score; best = { team, label } }
    }
  }
  return best
}

// ── Main Page ────────────────────────────────────────────────────────────────

type Picks = Record<string, string | null>
type Section = 'groups' | 'thirds' | 'bracket'

const localKey = (tournId: string) => `tribepicks_bracket_${tournId}`

function getOrCreateSessionId(): string {
  try {
    let sid = localStorage.getItem('tribepicks_session_id')
    if (!sid) {
      sid = crypto.randomUUID()
      localStorage.setItem('tribepicks_session_id', sid)
    }
    return sid
  } catch {
    return 'unknown'
  }
}

export default function BracketPage() {
  const { session } = useSupabase()
  const { selectedTournId: ctxTournId } = useUserPrefs()
  const searchParams = useSearchParams()
  const urlChallenge = searchParams.get('challenge')   // sponsor challenge slug from the URL, if any
  // Remember the sponsor challenge the user last arrived with, so navigating here
  // via the navbar (plain /bracket, no ?challenge=) keeps them in the sponsor's
  // context — otherwise they lose the link back to its leaderboard to enter.
  // Invite-only challenges aren't in the public list, so this is their only anchor.
  const [rememberedChallenge, setRememberedChallenge] = useState<string | null>(null)
  useEffect(() => {
    if (urlChallenge) {
      try { localStorage.setItem('tribepicks_bracket_challenge', urlChallenge) } catch {}
      setRememberedChallenge(urlChallenge)
    } else {
      try { setRememberedChallenge(localStorage.getItem('tribepicks_bracket_challenge')) } catch {}
    }
  }, [urlChallenge])
  const challengeParam = urlChallenge ?? rememberedChallenge   // sponsor challenge slug, if any

  // Guests: resolve tournament ID from ?slug= URL param (context is always null for non-signed-in users)
  const [resolvedTournId, setResolvedTournId] = useState<string | null>(null)
  const [tournResolving,  setTournResolving]  = useState<boolean>(!session)

  useEffect(() => {
    if (session) { setTournResolving(false); return }
    const slug = searchParams.get('slug')
    const url  = slug ? `/api/tournaments?slug=${encodeURIComponent(slug)}` : '/api/tournaments'
    fetch(url)
      .then(r => r.json())
      .then(({ data }) => {
        const list  = Array.isArray(data) ? data : []
        const tourn = list.find((t: any) => t.is_active) ?? list[0] ?? null
        if (tourn?.id) setResolvedTournId(tourn.id)
      })
      .catch(() => {})
      .finally(() => setTournResolving(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedTournId = ctxTournId ?? resolvedTournId

  const [picks,   setPicks]   = useState<Picks>({})
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState<Section>('groups')

  // Knockout mode: bracket seeds from the real R32 fixtures and hides the group
  // prediction steps. Prod gate = tournaments.bracket_knockout_mode (admin toggle).
  // Dev override: ?knockout=1/0, honoured only outside production so we can test on
  // localhost without flipping the real toggle.
  const [bracketKnockoutFlag, setBracketKnockoutFlag] = useState(false)
  const devKnockoutParam = searchParams.get('knockout')
  const devKnockout = process.env.NODE_ENV !== 'production' && devKnockoutParam != null
    ? (devKnockoutParam === '1' || devKnockoutParam === 'true')
    : null
  const knockoutMode = devKnockout !== null ? devKnockout : bracketKnockoutFlag
  // In knockout mode the only step is the bracket; never show groups/thirds.
  const showSection: Section = knockoutMode ? 'bracket' : section
  const didInitSection = useRef(false)
  // Autosave feedback for signed-in users (debounced DB writes are otherwise silent).
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  // Guest-built bracket that conflicts with the signed-in account's saved bracket
  // → let the user choose which to keep (set by the load effect on sign-in).
  const [bracketChoice, setBracketChoice] = useState<{ newPicks: Picks; existing: Picks } | null>(null)
  const [bracketClearedToast, setBracketClearedToast] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [showGuestEnter, setShowGuestEnter] = useState(false)
  // Open bracket challenges for this tournament (each its own sponsor + leaderboard).
  const [challenges, setChallenges] = useState<{ slug: string; name: string; entrants: number; sponsor: any; entered?: boolean; locked?: boolean }[]>([])
  const [memberEnterSlug, setMemberEnterSlug] = useState<string | null>(null)
  const [manageSlug, setManageSlug] = useState<string | null>(null)
  const [manageInitial, setManageInitial] = useState<{ final_goals?: number | null; tp_goals?: number | null; phone?: string | null; postcode?: string | null } | null>(null)

  // Open the entry modal in "edit" mode (amend tie-breakers or withdraw) for an
  // already-entered challenge. Pull the current entry so the form is pre-filled.
  const openManage = useCallback(async (slug: string) => {
    try {
      const es = await fetch(`/api/bracket/enter?challenge=${encodeURIComponent(slug)}`).then(r => r.json())
      setManageInitial(es?.entry ?? null)
    } catch { setManageInitial(null) }
    setManageSlug(slug)
  }, [])
  const [guestChallenge, setGuestChallenge] = useState<string | undefined>(challengeParam ?? undefined)
  // Guest (not logged in) entries we've made this device, slug → tie-breakers.
  const [enteredMap, setEnteredMap] = useState<Record<string, { final_goals: number; tp_goals: number }>>({})
  // Sponsor co-branding for the builder: the URL's challenge sponsor, else the
  // default bracket challenge's sponsor (resolver falls back to legacy app_settings).
  const [sponsorCfg, setSponsorCfg] = useState<any | null>(null)

  const pendingRef       = useRef<Map<string, string | null>>(new Map())
  const timerRef         = useRef<ReturnType<typeof setTimeout> | null>(null)
  const picksRef         = useRef<Picks>({})
  const clearingRef      = useRef(false)
  const championBannerRef = useRef<HTMLDivElement>(null)
  // Tracks whether the initial load has settled; prevents scroll-to-top on load
  const prevGroupsDone  = useRef(false)
  const prevThirdsCount = useRef(0)
  const prevFinalRef    = useRef<string | null>(null)
  const initializedRef  = useRef(false)
  const confettiFiredRef = useRef(false)
  const resetTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sourceRef       = useRef<string | null>(searchParams.get('ref'))
  const deviceRef       = useRef<string>(typeof window !== 'undefined' ? (window.innerWidth < 768 ? 'mobile' : 'desktop') : 'unknown')
  const [shareFormat, setShareFormat] = useState<'portrait' | 'landscape' | 'square'>('landscape')
  const shareFnRef      = useRef<() => void>(() => {})

  // R32 fixture schedule (kickoff/venue per bracket slot) — used to order the
  // R32 cards chronologically and show each tie's date. Keyed by bracket_slot.
  // Read the tournament's bracket_knockout_mode flag (admin toggle).
  useEffect(() => {
    if (!selectedTournId) return
    fetch('/api/tournaments')
      .then(r => r.json())
      .then(d => {
        const t = (d?.data ?? []).find((x: any) => x.id === selectedTournId)
        setBracketKnockoutFlag(t?.bracket_knockout_mode === true)
      })
      .catch(() => {})
  }, [selectedTournId])

  const [koFixtures, setKoFixtures] = useState<KoFixtureMap>({})
  useEffect(() => {
    if (!selectedTournId) return
    // All knockout fixtures (rows carrying a bracket_slot), keyed by slot.
    fetch(`/api/fixtures?tournament_id=${selectedTournId}`)
      .then(r => r.json())
      .then(j => {
        const map: KoFixtureMap = {}
        for (const f of (j?.data ?? [])) {
          if (!f?.bracket_slot) continue
          const r = f.result
          const actualWinner = r
            ? (r.home > r.away ? f.home : r.away > r.home ? f.away : (r.pen_winner ?? null))
            : null
          map[f.bracket_slot] = {
            kickoff_utc: f.kickoff_utc ?? null,
            venue:       f.venue ?? null,
            home:        f.home ?? null,
            away:        f.away ?? null,
            hasResult:   !!r,
            actualWinner,
          }
        }
        setKoFixtures(map)
      })
      .catch(() => {})
  }, [selectedTournId])

  // Keep picksRef in sync so callbacks can read latest picks without stale closure
  useEffect(() => { picksRef.current = picks }, [picks])

  // Load the tournament's open bracket challenges (enter hub, chooser + links).
  const loadChallenges = useCallback(() => {
    if (!selectedTournId) return
    fetch(`/api/bracket/challenges?tournament_id=${selectedTournId}`)
      .then(r => r.json())
      .then(d => setChallenges(Array.isArray(d?.challenges) ? d.challenges : []))
      .catch(() => {})
  }, [selectedTournId])
  useEffect(() => { loadChallenges() }, [loadChallenges])

  // Sponsor co-branding for the builder header (specific challenge or default).
  useEffect(() => {
    const qp = challengeParam ? `?challenge=${encodeURIComponent(challengeParam)}` : ''
    fetch(`/api/bracket/config${qp}`).then(r => r.json()).then(setSponsorCfg).catch(() => {})
    // Keep the guest entry modal pointed at the same challenge once it resolves
    // (covers the remembered-challenge fallback, where the URL param was dropped).
    if (challengeParam) setGuestChallenge(prev => prev ?? challengeParam)
  }, [challengeParam])

  // Land on the furthest-complete view: if the bracket already has a champion
  // (e.g. arriving from the leaderboard's "Edit bracket →"), open the Bracket
  // tab rather than starting cold at Groups. Runs once, after picks load.
  useEffect(() => {
    if (didInitSection.current || loading) return
    didInitSection.current = true
    if (picksRef.current['final']) setSection('bracket')
  }, [loading])

  // Which open challenges this (logged-out) guest has already entered on this device.
  const refreshEntered = useCallback(() => {
    const map: Record<string, { final_goals: number; tp_goals: number }> = {}
    for (const c of challenges) {
      try { const raw = localStorage.getItem(ENTERED_KEY(c.slug)); if (raw) map[c.slug] = JSON.parse(raw) } catch {}
    }
    setEnteredMap(map)
  }, [challenges])
  useEffect(() => { refreshEntered() }, [refreshEntered])

  // Load picks — localStorage for guests, DB for signed-in users (with migration)
  useEffect(() => {
    if (tournResolving) return                          // wait until slug→id resolution finishes
    if (!selectedTournId) { setLoading(false); return }

    if (!session) {
      // Guest: read from localStorage
      try {
        const stored = localStorage.getItem(localKey(selectedTournId))
        if (stored) setPicks(JSON.parse(stored))
      } catch {}
      setLoading(false)
      return
    }

    // Signed-in: this device may hold a guest-built bracket in localStorage. Load
    // the account's DB bracket FIRST, then decide — never blindly overwrite.
    let localPicks: Picks = {}
    try {
      const stored = localStorage.getItem(localKey(selectedTournId))
      if (stored) localPicks = JSON.parse(stored)
    } catch {}
    const localEntries = Object.entries(localPicks).filter(([, v]) => !!v)

    fetch(`/api/bracket?tournament_id=${selectedTournId}`)
      .then(r => r.json())
      .then(({ picks: dbPicks }) => {
        const hasDbBracket = !!dbPicks && Object.values(dbPicks as Picks).some(Boolean)
        const conflict = localEntries.length > 0 && hasDbBracket
          && !!localPicks['final'] && !!(dbPicks as Picks)['final']
          && localPicks['final'] !== (dbPicks as Picks)['final']

        if (localEntries.length > 0 && !hasDbBracket) {
          // Empty account → migrate the guest's localStorage bracket up to it.
          setPicks(localPicks)
          Promise.all(localEntries.map(([slot_key, team_name]) =>
            fetch('/api/bracket', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tournament_id: selectedTournId, slot_key, team_name }),
            })
          )).then(() => { try { localStorage.removeItem(localKey(selectedTournId)) } catch {} }).catch(() => {})
        } else if (conflict) {
          // The account already has a DIFFERENT bracket → keep theirs for now and
          // ask which to keep. localStorage is retained until they decide.
          setPicks(dbPicks)
          setBracketChoice({ newPicks: localPicks, existing: dbPicks })
        } else {
          // Same bracket, or nothing local → keep the DB bracket; drop stale localStorage.
          if (dbPicks) setPicks(dbPicks)
          if (hasDbBracket) { try { localStorage.removeItem(localKey(selectedTournId)) } catch {} }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [session, selectedTournId])

  // When a guest signs in while on this page, attribute their captured champion
  // prediction to the now signed-in user (analytics, best-effort). Bracket
  // migration itself is handled non-destructively by the load effect above —
  // we deliberately do NOT flush localStorage picks here (that clobbered the
  // brackets of users who already had one). Runs once per mount.
  const wasGuestRef = useRef(!session)
  useEffect(() => {
    if (!wasGuestRef.current || !session || !selectedTournId) return
    wasGuestRef.current = false  // run once — this effect isn't idempotent

    const champion = picksRef.current['final'] ?? null
    if (champion) {
      const sessionId  = getOrCreateSessionId()
      const lp         = picksRef.current
      const sf1        = lp[BRACKET_TREE.sf[0].key] ?? null
      const sf2        = lp[BRACKET_TREE.sf[1].key] ?? null
      const runnerUp   = sf1 === champion ? sf2 : sf1
      const sfLoser1   = sf1 ? BRACKET_TREE.sf[0].from.map((k: string) => lp[k] ?? null).find(t => t !== sf1) ?? null : null
      const sfLoser2   = sf2 ? BRACKET_TREE.sf[1].from.map((k: string) => lp[k] ?? null).find(t => t !== sf2) ?? null : null
      fetch('/api/bracket-prediction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournament_id: selectedTournId,
          champion,
          runner_up:  runnerUp,
          session_id: sessionId,
          sf_loser_1: sfLoser1,
          sf_loser_2: sfLoser2,
          source:     sourceRef.current ?? undefined,
          device:     deviceRef.current,
        }),
      }).catch(() => {})
    }
  }, [session, selectedTournId])

  // Debounced save — localStorage for guests, DB for signed-in users
  const savePick = useCallback((slotKey: string, teamName: string | null) => {
    if (!session) {
      // Guest: write full picks snapshot to localStorage
      setPicks(prev => {
        const next = { ...prev, [slotKey]: teamName }
        if (selectedTournId) {
          try { localStorage.setItem(localKey(selectedTournId), JSON.stringify(next)) } catch {}
        }
        return next
      })
      return
    }

    // Signed-in: debounced DB write
    setPicks(prev => ({ ...prev, [slotKey]: teamName }))
    pendingRef.current.set(slotKey, teamName)
    setSaveState('saving')

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      const batch = Array.from(pendingRef.current.entries())
      pendingRef.current.clear()
      try {
        await Promise.all(batch.map(([slot_key, team_name]) =>
          fetch('/api/bracket', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tournament_id: selectedTournId, slot_key, team_name }),
          })
        ))
        setSaveState('saved')
        setTimeout(() => setSaveState(s => (s === 'saved' ? 'idle' : s)), 1800)
      } catch {
        setSaveState('idle')
      }
    }, 600)
  }, [session, selectedTournId])

  // Clear all knockout picks from state + pending queue + DB/localStorage
  const clearBracketPicks = useCallback(() => {
    if (clearingRef.current) return
    if (!BRACKET_KEYS.some(k => picksRef.current[k])) return

    clearingRef.current = true
    setTimeout(() => { clearingRef.current = false }, 1000)

    setPicks(prev => {
      const next = { ...prev }
      BRACKET_KEYS.forEach(k => { next[k] = null })
      return next
    })
    for (const k of Array.from(pendingRef.current.keys())) {
      if (BRACKET_KEYS.includes(k)) pendingRef.current.delete(k)
    }
    if (timerRef.current) clearTimeout(timerRef.current)

    if (session) {
      fetch(`/api/bracket?tournament_id=${selectedTournId}`, { method: 'DELETE' }).catch(() => {})
    } else if (selectedTournId) {
      try {
        const updated = { ...picksRef.current }
        BRACKET_KEYS.forEach(k => { updated[k] = null })
        localStorage.setItem(localKey(selectedTournId), JSON.stringify(updated))
      } catch {}
    }

    setBracketClearedToast(true)
    setTimeout(() => setBracketClearedToast(false), 3000)
  }, [session, selectedTournId])

  // Reset every pick (groups + thirds + bracket) — called by "Reset all" button
  const resetAllPicks = useCallback(() => {
    if (!confirmReset) {
      setConfirmReset(true)
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
      resetTimerRef.current = setTimeout(() => setConfirmReset(false), 3000)
      return
    }
    setConfirmReset(false)
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current)

    setPicks({})
    pendingRef.current.clear()
    if (timerRef.current) clearTimeout(timerRef.current)

    if (session && selectedTournId) {
      fetch(`/api/bracket?tournament_id=${selectedTournId}&all=true`, { method: 'DELETE' }).catch(() => {})
    } else if (selectedTournId) {
      try { localStorage.removeItem(localKey(selectedTournId)) } catch {}
    }

    setBracketClearedToast(true)
    setTimeout(() => setBracketClearedToast(false), 3000)
  }, [confirmReset, session, selectedTournId])

  const navigateTo = useCallback((s: Section) => setSection(s), [])

  // Wrapper passed to Groups + Thirds: cascades bracket clear on any change
  const savePickWithCascade = useCallback((slotKey: string, teamName: string | null) => {
    const m = slotKey.match(/^grp:([A-L]):3$/)
    if (m) {
      // When a group 3rd changes, clear any T slot that had the old team assigned
      const oldTeam = picksRef.current[slotKey]
      if (oldTeam && oldTeam !== teamName) {
        for (const t of T_SLOTS) {
          if (picksRef.current[thirdSlot(t)] === oldTeam) {
            savePick(thirdSlot(t), null)
          }
        }
      }
    }
    savePick(slotKey, teamName)
    clearBracketPicks()
  }, [savePick, clearBracketPicks])

  // Derived: advancing thirds indexed by T slot position (T1=idx 0 … T8=idx 7)
  // Nulls preserved so resolveSlot always maps T1→idx 0 regardless of which slots are filled
  const advancingThirds = T_SLOTS.map(t => picks[thirdSlot(t)] ?? null)

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

  const thirdsCount = advancingThirds.filter(Boolean).length
  const groupsDone  = GROUPS.every(g => picks[grpSlot(g.id, 1)] && picks[grpSlot(g.id, 2)] && picks[grpSlot(g.id, 3)])

  const champion = picks['final'] ?? null

  // Arrived from a specific sponsor's leaderboard (/bracket?challenge=slug)?
  // Then focus the entry on that challenge and offer a link back to its board.
  // Invite-only sponsor challenges aren't in the public `challenges` list, so rebuild
  // the targeted challenge from the resolved sponsor config (which resolves by slug).
  // Without this, the CTA/modal fall back to the Global challenge and miss the sponsor.
  const targetedChallenge = (challengeParam ? challenges.find(c => c.slug === challengeParam) : undefined)
    ?? (challengeParam && sponsorCfg?.enabled ? {
        slug: challengeParam,
        name: sponsorCfg.challenge_name ?? 'Bracket Challenge',
        entrants: 0,
        sponsor: { name: sponsorCfg.sponsor_name, logo: sponsorCfg.sponsor_logo, prize: sponsorCfg.prize, url: sponsorCfg.sponsor_url, logo_tone: sponsorCfg.logo_tone, tagline: sponsorCfg.sponsor_tagline },
      } : undefined)
  const ctaChallenges = targetedChallenge ? [targetedChallenge] : challenges
  // Find a challenge by slug, including the synthesized targeted one (so the entry
  // modals see the sponsor for invite-only challenges).
  const chFor = (s?: string | null) => (targetedChallenge && targetedChallenge.slug === s ? targetedChallenge : challenges.find(c => c.slug === s))
  const allCtaEntered = ctaChallenges.length > 0 && ctaChallenges.every(c => !!enteredMap[c.slug])
  // Only talk about prizes / a "draw" when a sponsor with a prize is actually live;
  // an unsponsored challenge is just "save & track your bracket".
  const ctaHasPrize = ctaChallenges.some(c => !!c.sponsor?.prize)
  const branded = !!(sponsorCfg?.enabled && (sponsorCfg.sponsor_logo || sponsorCfg.sponsor_name))
  // Leaderboard the header links to: the targeted board, else the generic one.
  const leaderboardHref = targetedChallenge ? `/bracket/leaderboard/${targetedChallenge.slug}` : '/bracket/leaderboard'

  // Initialise scroll sentinels once loading is done (prevents spurious scroll on load)
  useEffect(() => {
    if (!loading) {
      prevGroupsDone.current  = groupsDone
      prevThirdsCount.current = thirdsCount
      prevFinalRef.current    = champion
      initializedRef.current  = true
      // Bracket was already complete on load — suppress confetti so refresh doesn't re-celebrate
      if (champion) confettiFiredRef.current = true
    }
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // React to champion being picked / changed / cleared
  useEffect(() => {
    if (!initializedRef.current) return
    const prev    = prevFinalRef.current
    prevFinalRef.current = champion

    if (!champion) return

    if (champion === prev) return  // same pick reloaded, no action

    // Confetti burst — once per mount, not on tinkering or page reload
    if (!confettiFiredRef.current) {
      confettiFiredRef.current = true
      import('canvas-confetti').then(({ default: confetti }) => {
        const colors = ['#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#fbbf24', '#ffffff']
        confetti({ particleCount: 80, spread: 65, origin: { x: 0.25, y: 0.85 }, colors })
        confetti({ particleCount: 80, spread: 65, origin: { x: 0.75, y: 0.85 }, colors })
      }).catch(() => {})
    }

    // New champion: guests scroll to top (CTA card is first); logged-in scroll to champion banner
    setTimeout(() => {
      if (!session) {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } else {
        const el = championBannerRef.current
        if (el) {
          const top = el.getBoundingClientRect().top + window.scrollY - 64
          window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
        }
      }
    }, 50)

    // Record prediction in DB (use picksRef for fresh values — picks closure may be stale)
    if (selectedTournId) {
      const sessionId   = getOrCreateSessionId()
      const latestPicks = picksRef.current
      const sf1         = latestPicks[BRACKET_TREE.sf[0].key] ?? null
      const sf2         = latestPicks[BRACKET_TREE.sf[1].key] ?? null
      const runnerUp    = sf1 === champion ? sf2 : sf1
      const sfLoser1    = sf1 ? BRACKET_TREE.sf[0].from.map((k: string) => latestPicks[k] ?? null).find(t => t !== sf1) ?? null : null
      const sfLoser2    = sf2 ? BRACKET_TREE.sf[1].from.map((k: string) => latestPicks[k] ?? null).find(t => t !== sf2) ?? null : null
      fetch('/api/bracket-prediction', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          tournament_id: selectedTournId,
          champion,
          runner_up:    runnerUp,
          session_id:   sessionId,
          sf_loser_1:   sfLoser1,
          sf_loser_2:   sfLoser2,
          source:       sourceRef.current ?? undefined,
          device:       deviceRef.current,
          completed_at: prev === null ? new Date().toISOString() : undefined,
        }),
      }).catch(() => {})
    }
  }, [champion]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to top (after 1s) when Groups stage is fully completed
  useEffect(() => {
    if (loading) return
    const wasComplete = prevGroupsDone.current
    prevGroupsDone.current = groupsDone
    if (!wasComplete && groupsDone) {
      const t = setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 1000)
      return () => clearTimeout(t)
    }
  }, [groupsDone, loading])

  // Scroll to top (after 1s) when all 8 third-place teams are selected
  useEffect(() => {
    if (loading) return
    const prevCount = prevThirdsCount.current
    prevThirdsCount.current = thirdsCount
    if (prevCount < 8 && thirdsCount === 8) {
      const t = setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 1000)
      return () => clearTimeout(t)
    }
  }, [thirdsCount, loading])

  if (loading || tournResolving) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Spinner className="w-6 h-6" />
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto px-4 pb-28 pt-4">
      {/* Autosave indicator (signed-in users) — confirms picks reach the server. */}
      {session && saveState !== 'idle' && !bracketClearedToast && (
        <div className={clsx(
          'fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-full shadow-lg pointer-events-none transition-colors',
          saveState === 'saving' ? 'bg-gray-800 text-white' : 'bg-emerald-600 text-white')}>
          {saveState === 'saving'
            ? <><Spinner className="w-3.5 h-3.5" /><span>Saving…</span></>
            : <><span>✓</span><span>Bracket saved</span></>}
        </div>
      )}

      {/* Bracket-cleared toast */}
      {bracketClearedToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-gray-800 text-white text-sm font-semibold px-5 py-2.5 rounded-full shadow-lg pointer-events-none">
          <span>🗑️</span>
          <span>Bracket picks cleared</span>
        </div>
      )}


      {/* Two-tap reset: first tap arms confirmation, second tap executes */}
      {(() => {
        const resetBtn = (extra: string) => (
          <button onClick={resetAllPicks}
            className={clsx('text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all', extra,
              confirmReset ? 'bg-red-50 border-red-300 text-red-600' : 'bg-white border-gray-200 text-gray-400 hover:text-gray-600')}>
            {confirmReset ? 'Confirm reset?' : 'Reset all'}
          </button>
        )
        return branded ? (
          // Co-branded builder header — sponsor logo + prize, like the leaderboard.
          <div className="mb-5">
            <div className="bg-green-900 rounded-2xl px-5 py-5 flex flex-col items-center gap-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-3">
              <div className="text-center sm:text-left min-w-0">
                <h1 className="text-xl sm:text-2xl font-black text-white leading-tight">{targetedChallenge?.name ?? 'Bracket Challenge'}</h1>
                <p className="text-[11px] text-green-300 mt-0.5">Build your bracket to enter</p>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-[8px] uppercase tracking-[0.2em] text-amber-300 whitespace-nowrap">Sponsored by</span>
                {sponsorCfg.sponsor_url
                  ? <a href={sponsorCfg.sponsor_url} target="_blank" rel="noopener noreferrer sponsored" className="inline-flex"><SponsorLogoMark logo={sponsorCfg.sponsor_logo} name={sponsorCfg.sponsor_name} logoTone={sponsorCfg.logo_tone} surface="dark" className="max-h-12 sm:max-h-16 max-w-[140px] sm:max-w-[200px]" /></a>
                  : <SponsorLogoMark logo={sponsorCfg.sponsor_logo} name={sponsorCfg.sponsor_name} logoTone={sponsorCfg.logo_tone} surface="dark" className="max-h-12 sm:max-h-16 max-w-[140px] sm:max-w-[200px]" />}
                {sponsorCfg.sponsor_name && !sponsorCfg.logo_includes_name && <span className="text-xs sm:text-sm font-bold text-white">{sponsorCfg.sponsor_name}</span>}
                {sponsorCfg.sponsor_tagline && <span className="text-[10px] text-white/70 leading-tight">{sponsorCfg.sponsor_tagline}</span>}
              </div>
              <div className="text-center sm:text-right min-w-0">
                {sponsorCfg.prize
                  ? <p className="text-sm text-green-200">🏆 Win <strong className="text-amber-300 font-bold">{sponsorCfg.prize}</strong></p>
                  : <p className="text-sm text-green-300">🏆 Predict the knockout bracket</p>}
              </div>
            </div>
            <div className="flex items-center justify-between mt-2 px-1">
              <div className="flex items-center gap-3">
                <a href={leaderboardHref} className="text-xs font-semibold text-emerald-600 hover:text-emerald-700">{sponsorCfg.sponsor_name ? `${sponsorCfg.sponsor_name} Leaderboard →` : 'Leaderboard →'}</a>
                <a href="/bracket/how-it-works" className="text-xs font-semibold text-gray-400 hover:text-gray-600">How it works</a>
              </div>
              {resetBtn('')}
            </div>
          </div>
        ) : (
          // Plain header (no sponsor configured).
          <div className="mb-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-black text-gray-900">My Bracket</h1>
                <p className="text-xs text-gray-500 mt-0.5">WC 2026 · Pick qualifiers and your path to the final</p>
              </div>
              {resetBtn('flex-shrink-0 mt-0.5')}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <a href={leaderboardHref} className="text-xs font-semibold text-emerald-600 hover:text-emerald-700">← Leaderboard</a>
              <a href="/bracket/how-it-works" className="text-xs font-semibold text-gray-400 hover:text-gray-600">How it works</a>
            </div>
          </div>
        )
      })()}

      {/* Completion CTA — persistent card for guests once champion is picked */}
      {!session && champion && showSection === 'bracket' && (
        <div className="mb-4 px-4 py-4 bg-emerald-50 border border-emerald-200 rounded-xl">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Flag team={champion} className="text-3xl rounded shadow-sm" />
            <span className="text-sm font-bold text-emerald-900">{champion}</span>
            <span className="text-2xl leading-none">🏆</span>
          </div>
          <p className="text-sm font-bold text-emerald-900 mb-0.5">{allCtaEntered ? (ctaHasPrize ? 'You’re in the draw! 🎉' : 'You’re all set! 🎉') : (ctaHasPrize ? 'Your bracket is done — enter to win 🏆' : 'Your bracket is done! 🎯')}</p>
          <p className="text-xs text-emerald-700 mb-3">{allCtaEntered ? 'We’ve saved your bracket and emailed your login link — click it to track your score all tournament long.' : (ctaHasPrize ? 'Drop your name and email to join the prize draw. We’ll save your bracket and score it all tournament long — no password needed.' : 'Drop your name and email to save your bracket and follow your score all tournament long — no password needed.')}</p>
          <div className="space-y-2">
            {ctaChallenges.map(c => {
              const entered = enteredMap[c.slug]
              return entered ? (
                <div key={c.slug} className="rounded-xl border border-emerald-300 bg-white px-4 py-3 text-left">
                  <p className="text-sm font-bold text-emerald-900">✓ {c.sponsor?.prize ? 'You&apos;re in the draw' : 'Bracket entered'}{c.sponsor?.name ? ` · ${c.sponsor.name}` : ''} 🎉</p>
                  <p className="text-[11px] text-emerald-700 mt-0.5">Tie-breakers — Final <strong>{entered.final_goals}</strong> goal{entered.final_goals === 1 ? '' : 's'} · 3rd place <strong>{entered.tp_goals}</strong> goal{entered.tp_goals === 1 ? '' : 's'}.</p>
                  <a href="/login?redirect=/bracket/leaderboard" className="text-[11px] font-semibold text-emerald-700 underline mt-1.5 inline-block">Sign in to track, change or withdraw your entry →</a>
                </div>
              ) : (
                <button key={c.slug} onClick={() => { setGuestChallenge(c.slug); setShowGuestEnter(true) }}
                  className="w-full flex items-center justify-between gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-sm font-bold px-4 py-3 rounded-xl transition-all">
                  <span className="truncate">Enter {c.sponsor?.name ? `${c.sponsor.name} · ` : ''}{c.name}</span>
                  <span aria-hidden>→</span>
                </button>
              )
            })}
          </div>
          <p className="text-center text-[11px] text-emerald-600 mt-2.5">
            Want a full comp with your crew? <a href="/login?tab=register&bracket=1" className="underline font-semibold">Sign up here</a>.
          </p>
        </div>
      )}

      {showGuestEnter && selectedTournId && (
        <BracketGuestEntryModal
          tournamentId={selectedTournId}
          challenge={guestChallenge}
          hasPrize={!!chFor(guestChallenge)?.sponsor?.prize}
          challengeName={chFor(guestChallenge)?.name}
          sponsorName={chFor(guestChallenge)?.sponsor?.name ?? null}
          sponsorSubsidiary={chFor(guestChallenge)?.sponsor?.tagline ?? null}
          sponsorLogo={chFor(guestChallenge)?.sponsor?.logo ?? null}
          sponsorLogoTone={chFor(guestChallenge)?.sponsor?.logo_tone ?? null}
          picks={picks}
          sessionId={getOrCreateSessionId()}
          source={sourceRef.current}
          device={deviceRef.current}
          onClose={() => { setShowGuestEnter(false); refreshEntered() }}
        />
      )}

      {/* Champion share banner — shown above section tabs when bracket is complete */}
      {picks['final'] && showSection === 'bracket' && (
        <div ref={championBannerRef} className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-xl leading-none flex-shrink-0">🏆</span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-amber-800">Share your bracket picks</p>
                <p className="text-xs text-amber-600 mt-0.5 truncate">{picks['final']} wins the World Cup</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div className="flex rounded-lg border border-amber-300 overflow-hidden text-[10px] font-bold">
                <button onClick={() => setShareFormat('portrait')} title="Portrait"
                  className={clsx('px-2 py-1.5 transition-colors', shareFormat === 'portrait' ? 'bg-amber-500 text-white' : 'text-amber-600 hover:bg-amber-100')}>↕</button>
                <button onClick={() => setShareFormat('landscape')} title="Landscape"
                  className={clsx('px-2 py-1.5 transition-colors border-l border-amber-300', shareFormat === 'landscape' ? 'bg-amber-500 text-white' : 'text-amber-600 hover:bg-amber-100')}>↔</button>
                <button onClick={() => setShareFormat('square')} title="Square (1:1)"
                  className={clsx('px-2 py-1.5 transition-colors border-l border-amber-300', shareFormat === 'square' ? 'bg-amber-500 text-white' : 'text-amber-600 hover:bg-amber-100')}>□</button>
              </div>
              <button onClick={() => shareFnRef.current()}
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-xs font-bold px-3 py-2 rounded-lg transition-all">
                <span className="text-sm leading-none">↑</span>
                <span>Share</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Challenges hub — build one bracket, enter many. Logged-in players only;
          guests use the completion card above (avoids two Enter affordances).
          Sponsor branding only appears per-row when a challenge actually has one. */}
      {session && challenges.length > 0 && (
        <div className="mb-5 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-bold text-gray-900">🏆 My Bracket Challenges</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Build your bracket, then <strong>enter a challenge</strong> to get on its leaderboard — and into any prize draw.</p>
          </div>
          <div className="divide-y divide-gray-100">
            {challenges.map(c => (
              <div key={c.slug} className={clsx('flex items-center gap-3 px-4 py-3', c.entered && 'bg-emerald-50/60')}>
                <div className="w-9 h-9 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c.sponsor?.logo ? <img src={c.sponsor.logo} alt="" className="max-w-full max-h-full object-contain p-0.5" /> : <span className="text-gray-300">🏆</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{c.sponsor?.name ? `${c.sponsor.name} · ` : ''}{c.name}</p>
                    {c.entered && <span className="flex-shrink-0 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">✓ ENTERED</span>}
                  </div>
                  <p className="text-[11px] text-gray-500 truncate">{c.sponsor?.prize ? `🎁 ${c.sponsor.prize} · ` : ''}{c.entrants} entered</p>
                </div>
                <div className="flex-shrink-0">
                  {c.entered ? (
                    <div className="flex items-center gap-3">
                      <button onClick={() => openManage(c.slug)} className="text-xs font-semibold text-gray-500 hover:text-gray-700 whitespace-nowrap">Manage</button>
                      <a href={`/bracket/leaderboard/${c.slug}`} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap">Leaderboard →</a>
                    </div>
                  ) : c.locked ? (
                    <span className="text-xs text-gray-400">Closed</span>
                  ) : !champion ? (
                    <span className="text-[11px] text-amber-600 whitespace-nowrap">Finish bracket to enter</span>
                  ) : (
                    <button onClick={() => setMemberEnterSlug(c.slug)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white whitespace-nowrap">Enter →</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {manageSlug && (
        <BracketEntryModal
          challenge={manageSlug}
          challengeName={chFor(manageSlug)?.name}
          editing
          initial={manageInitial ?? undefined}
          hasPrize={!!chFor(manageSlug)?.sponsor?.prize}
          sponsorName={chFor(manageSlug)?.sponsor?.name ?? null}
          sponsorSubsidiary={chFor(manageSlug)?.sponsor?.tagline ?? null}
          sponsorLogo={chFor(manageSlug)?.sponsor?.logo ?? null}
          sponsorLogoTone={chFor(manageSlug)?.sponsor?.logo_tone ?? null}
          onClose={() => setManageSlug(null)}
          onEntered={() => { setManageSlug(null); loadChallenges() }}
        />
      )}

      {memberEnterSlug && (
        <BracketEntryModal
          challenge={memberEnterSlug}
          challengeName={chFor(memberEnterSlug)?.name}
          hasPrize={!!chFor(memberEnterSlug)?.sponsor?.prize}
          sponsorName={chFor(memberEnterSlug)?.sponsor?.name ?? null}
          sponsorSubsidiary={chFor(memberEnterSlug)?.sponsor?.tagline ?? null}
          sponsorLogo={chFor(memberEnterSlug)?.sponsor?.logo ?? null}
          sponsorLogoTone={chFor(memberEnterSlug)?.sponsor?.logo_tone ?? null}
          onClose={() => setMemberEnterSlug(null)}
          onEntered={() => { window.location.href = `/bracket/leaderboard/${memberEnterSlug}` }}
        />
      )}

      {/* Sign-in bracket conflict — the account already has a different saved bracket
          than the one just built on this device. Let the user pick which to keep. */}
      {bracketChoice && selectedTournId && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:px-4">
          <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">🏆 You already have a bracket</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-gray-600">
                Your account already has a saved bracket (champion <strong className="text-gray-900">{bracketChoice.existing['final']}</strong>).
                The bracket you just built on this device picks <strong className="text-gray-900">{bracketChoice.newPicks['final']}</strong>.
              </p>
              <p className="text-sm font-medium text-gray-800">Which would you like to keep?</p>
              <button
                onClick={() => { try { localStorage.removeItem(localKey(selectedTournId)) } catch {} ; setBracketChoice(null) }}
                className="w-full py-3 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white">
                Keep my saved bracket
              </button>
              <button
                onClick={() => {
                  const np = bracketChoice.newPicks
                  setPicks(np)
                  const entries = Object.entries(np).filter(([, v]) => !!v)
                  setSaveState('saving')
                  Promise.all(entries.map(([slot_key, team_name]) =>
                    fetch('/api/bracket', {
                      method: 'PUT', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ tournament_id: selectedTournId, slot_key, team_name }),
                    })
                  )).then(() => {
                    try { localStorage.removeItem(localKey(selectedTournId)) } catch {}
                    setSaveState('saved'); setTimeout(() => setSaveState(s => (s === 'saved' ? 'idle' : s)), 1800)
                  }).catch(() => setSaveState('idle'))
                  setBracketChoice(null)
                }}
                className="w-full py-2.5 rounded-xl text-sm font-bold border border-gray-200 text-gray-700 hover:bg-gray-50">
                Use my new picks instead
              </button>
              <p className="text-[11px] text-gray-400 text-center">Either way, you can keep editing each pick until that match kicks off — entries stay open until the semi-finals.</p>
            </div>
          </div>
        </div>
      )}

      {/* Section nav — hidden in knockout mode (bracket is the only step) */}
      {!knockoutMode && (
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1">
        {([
          { id: 'groups',  label: 'Groups',  badge: groupsDone ? '✓' : null },
          { id: 'thirds',  label: '3rd Place', badge: thirdsCount === 8 ? '✓' : thirdsCount > 0 ? `${thirdsCount}/8` : null },
          { id: 'bracket', label: 'Bracket',  badge: picks['final'] ? '✓' : null },
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
      )}

      {showSection === 'groups'  && <GroupsSection  picks={picks} savePick={savePickWithCascade} onNavigate={navigateTo} />}
      {showSection === 'thirds'  && <ThirdsSection  picks={picks} savePick={savePickWithCascade} advancingThirds={advancingThirds} onNavigate={navigateTo} groupsDone={groupsDone} />}
      {showSection === 'bracket' && <BracketSection picks={picks} picksRef={picksRef} savePick={savePick} resolveSlot={resolveSlot} advancingThirds={advancingThirds} koFixtures={koFixtures} knockoutMode={knockoutMode} shareFormat={shareFormat} shareFnRef={shareFnRef} onNavigate={navigateTo} onShare={(fmt: string) => {
        if (!selectedTournId) return
        fetch('/api/bracket-prediction', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tournament_id: selectedTournId, session_id: getOrCreateSessionId(), share_format: fmt }),
        }).catch(() => {})
      }} />}
    </div>
  )
}

// ── Groups Section ───────────────────────────────────────────────────────────

function GroupsSection({ picks, savePick, onNavigate }: {
  picks: Picks
  savePick: (k: string, v: string | null) => void
  onNavigate: (s: Section) => void
}) {
  const groupCardRefs = useRef<(HTMLDivElement | null)[]>([])
  const scrollToGroup = useCallback((idx: number) => {
    const el = groupCardRefs.current[idx]
    if (!el) return
    // Offset by fixed top navbar (~56px) + 8px breathing room
    const top = el.getBoundingClientRect().top + window.scrollY - 64
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  }, [])

  // Track per-group completion to detect transitions
  const prevCompletion = useRef<boolean[]>(
    GROUPS.map(g => !!(picks[grpSlot(g.id, 1)] && picks[grpSlot(g.id, 2)] && picks[grpSlot(g.id, 3)]))
  )

  useEffect(() => {
    const prev = prevCompletion.current
    let didScroll = false
    GROUPS.forEach((g, gi) => {
      const isComplete = !!(picks[grpSlot(g.id, 1)] && picks[grpSlot(g.id, 2)] && picks[grpSlot(g.id, 3)])
      if (!prev[gi] && isComplete && !didScroll) {
        for (let offset = 1; offset < GROUPS.length; offset++) {
          const nextIdx = (gi + offset) % GROUPS.length
          const ng = GROUPS[nextIdx]
          if (!(picks[grpSlot(ng.id, 1)] && picks[grpSlot(ng.id, 2)] && picks[grpSlot(ng.id, 3)])) {
            setTimeout(() => scrollToGroup(nextIdx), 400)
            didScroll = true
            break
          }
        }
      }
    })
    prevCompletion.current = GROUPS.map(g =>
      !!(picks[grpSlot(g.id, 1)] && picks[grpSlot(g.id, 2)] && picks[grpSlot(g.id, 3)])
    )
  }, [picks, scrollToGroup])

  return (
    <>
      <div className="space-y-4">
        <p className="text-xs text-gray-500">Pick the top 2 teams to qualify from each group. The 3rd-place team is used in the next step.</p>
        {GROUPS.map((g, gi) => (
          <div key={g.id} ref={el => { groupCardRefs.current[gi] = el }}>
            <GroupCard group={g} picks={picks} savePick={savePick} />
          </div>
        ))}
      </div>
      <GroupsProgressBar picks={picks} onGroupClick={scrollToGroup} onNavigate={onNavigate} />
    </>
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
  const groupComplete = !!(first && second && third)

  const assign = (teamName: string, rank: 1 | 2 | 3) => {
    const key = grpSlot(id, rank)

    // Deselect if already selected at this rank
    if (picks[key] === teamName) {
      savePick(key, null)
      return
    }
    // Prevent picking 3rd place for a team already occupying 1st or 2nd
    if (rank === 3 && (picks[grpSlot(id, 1)] === teamName || picks[grpSlot(id, 2)] === teamName)) {
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
      {/* Header — amber while incomplete, emerald once all 3 ranks filled */}
      <div className={clsx(
        'flex items-center justify-between px-4 py-2.5 border-b transition-colors',
        groupComplete ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'
      )}>
        <span className={clsx(
          'text-xs font-bold tracking-wider',
          groupComplete ? 'text-emerald-800' : 'text-amber-800'
        )}>GROUP {id}</span>
        <div className="flex items-center gap-1.5">
          {[first, second].map((t, i) => (
            <span key={i} className={clsx(
              'text-xs px-2 py-0.5 rounded-full font-medium',
              t ? 'bg-emerald-600 text-white' : 'bg-white text-gray-400 border border-gray-200'
            )}>
              {t ? <><Flag team={t} className="mr-1 rounded-[1px]" />{t}</> : (i === 0 ? '1st ?' : '2nd ?')}
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
              <div className="flex gap-1.5">
                {([1, 2, 3] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => assign(team.name, r)}
                    aria-label={`${team.name} — ${r === 1 ? '1st' : r === 2 ? '2nd' : '3rd'} place`}
                    aria-pressed={rank === r}
                    className={clsx(
                      'w-10 h-10 rounded-full text-xs font-bold transition-all border',
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
// Shows 8 T-slot cards. Each slot has a fixed set of eligible groups (FIFA rules).
// Tapping a group's third-place team assigns it to that slot; a group can only fill one slot.

function ThirdsSection({ picks, savePick, advancingThirds, onNavigate, groupsDone }: {
  picks: Picks
  savePick: (k: string, v: string | null) => void
  advancingThirds: (string | null)[]
  onNavigate: (s: Section) => void
  groupsDone: boolean
}) {
  const count     = advancingThirds.filter(Boolean).length
  const remaining = 8 - count

  // Map group ID → T slot it is currently assigned to (across all slots)
  const groupToSlot: Record<string, string> = {}
  for (const t of T_SLOTS) {
    const team = picks[thirdSlot(t)]
    if (!team) continue
    const grp = GROUPS.find(g => picks[grpSlot(g.id, 3)] === team)
    if (grp) groupToSlot[grp.id] = t
  }

  const fmtOpponent = (desc: string) =>
    `${desc[0] === '1' ? '1st' : '2nd'} Grp ${desc[1]}`

  // Gate: all 12 groups must be fully picked before thirds can be assigned
  if (!groupsDone) {
    const completedGroups = GROUPS.filter(g =>
      picks[grpSlot(g.id, 1)] && picks[grpSlot(g.id, 2)] && picks[grpSlot(g.id, 3)]
    ).length
    return (
      <>
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <span className="text-4xl">🔒</span>
          <h2 className="text-base font-bold text-gray-700">Complete all groups first</h2>
          <p className="text-sm text-gray-500 max-w-xs">
            Pick 1st, 2nd and 3rd place in all 12 groups before assigning 3rd-place qualifiers.
          </p>
          <span className="text-sm font-semibold text-emerald-700">{completedGroups}/12 groups done</span>
          <button
            onClick={() => onNavigate('groups')}
            className="text-sm font-semibold text-emerald-700 border border-emerald-300 px-5 py-2.5 rounded-xl hover:bg-emerald-50 transition-colors">
            Go to Groups →
          </button>
        </div>
        <ThirdsProgressBar advancingThirds={advancingThirds} onNavigate={onNavigate} />
      </>
    )
  }

  // Non-qualifying groups: had a 3rd picked but not assigned to any T slot
  const nonQualifying = count === 8
    ? GROUPS.filter(g => picks[grpSlot(g.id, 3)] && !groupToSlot[g.id])
    : []

  return (
    <>
      <div className="space-y-3">
        {count < 8 && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
            <span className="text-lg leading-none mt-0.5">⚠️</span>
            <div>
              <p className="text-sm font-bold text-amber-900">
                {remaining} slot{remaining !== 1 ? 's' : ''} remaining
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Assign a third-placed team to each slot to complete your R32.
              </p>
            </div>
            <span className="ml-auto text-sm font-bold px-2.5 py-1 rounded-full bg-amber-200 text-amber-800 flex-shrink-0">
              {count}/8
            </span>
          </div>
        )}

        <p className="text-xs text-gray-500">
          Each slot has eligible groups set by FIFA's bracket rules. Tap a team to assign them.
        </p>

        <div className="flex flex-col gap-3">
          {T_SLOTS.map(tSlot => {
            const assigned = picks[thirdSlot(tSlot)] ?? null
            const eligible = THIRD_SLOT_GROUPS[tSlot]
            const opponent = T_SLOT_OPPONENT[tSlot]

            return (
              <div key={tSlot} className={clsx(
                'rounded-xl border transition-all',
                assigned ? 'bg-emerald-50 border-emerald-300 px-3 py-2.5' : 'bg-white border-gray-200 p-3'
              )}>
                {assigned ? (
                  /* Single-row when assigned: label · opponent | flag name | ✓ | Clear */
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-xs font-black text-emerald-700">{tSlot}</span>
                      {opponent && (
                        <span className="text-[9px] text-gray-400">· vs {fmtOpponent(opponent)}</span>
                      )}
                    </div>
                    <Flag team={assigned} className="text-base rounded-sm" />
                    <span className="text-xs font-semibold text-gray-800 flex-1 truncate">{assigned}</span>
                    <span className="text-[9px] font-bold text-emerald-600 flex-shrink-0">✓ Advancing</span>
                    <button
                      onClick={() => savePick(thirdSlot(tSlot), null)}
                      className="flex-shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-lg bg-rose-100 text-rose-600 hover:bg-rose-200 active:scale-95 transition-all">
                      Clear
                    </button>
                  </div>
                ) : (
                  /* Expanded when unassigned: header + eligible group buttons */
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-black text-gray-700">{tSlot}</span>
                      {opponent && (
                        <span className="text-[10px] text-gray-400">vs {fmtOpponent(opponent)}</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {eligible.map(groupId => {
                        const thirdTeam  = picks[grpSlot(groupId, 3)] ?? null
                        const usedInSlot = groupToSlot[groupId]
                        const isUsed     = !!usedInSlot
                        const disabled   = !thirdTeam || isUsed

                        return (
                          <button
                            key={groupId}
                            disabled={disabled}
                            onClick={() => !disabled && savePick(thirdSlot(tSlot), thirdTeam!)}
                            className={clsx(
                              'flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all',
                              disabled
                                ? 'border-gray-100 bg-gray-50 cursor-not-allowed'
                                : 'border-gray-200 bg-white hover:border-emerald-300 hover:bg-emerald-50 active:scale-[0.98]'
                            )}>
                            <span className={clsx(
                              'text-[10px] font-bold w-8 flex-shrink-0',
                              disabled ? 'text-gray-300' : 'text-gray-500'
                            )}>
                              Grp {groupId}
                            </span>
                            {thirdTeam ? (
                              <>
                                <Flag team={thirdTeam} className={clsx('text-base rounded-sm', disabled && 'opacity-40')} />
                                <span className={clsx(
                                  'text-xs font-medium flex-1 truncate',
                                  disabled ? 'text-gray-300' : 'text-gray-700'
                                )}>
                                  {thirdTeam}
                                </span>
                                {isUsed && (
                                  <span className="text-[9px] text-gray-300 flex-shrink-0">in {usedInSlot}</span>
                                )}
                              </>
                            ) : (
                              <span className="text-xs text-gray-300 italic flex-1">3rd place TBD</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>

        {/* Non-qualifying third-place teams — greyed out after all 8 slots filled */}
        {nonQualifying.length > 0 && (
          <div className="mt-1">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
              Did not qualify
            </p>
            <div className="flex flex-col gap-2">
              {nonQualifying.map(g => {
                const team = picks[grpSlot(g.id, 3)]!
                return (
                  <div key={g.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-100 bg-gray-50 opacity-50">
                    <span className="text-[10px] font-bold text-gray-400 w-8 flex-shrink-0">Grp {g.id}</span>
                    <Flag team={team} className="text-base rounded-sm" />
                    <span className="text-xs text-gray-500 flex-1">{team}</span>
                    <span className="text-[9px] text-gray-400">Eliminated</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
      <ThirdsProgressBar advancingThirds={advancingThirds} onNavigate={onNavigate} />
    </>
  )
}

// ── Groups Progress Bar ──────────────────────────────────────────────────────

function GroupsProgressBar({ picks, onGroupClick, onNavigate }: {
  picks: Picks
  onGroupClick: (idx: number) => void
  onNavigate: (s: Section) => void
}) {
  const completed = GROUPS.filter(g =>
    picks[grpSlot(g.id, 1)] && picks[grpSlot(g.id, 2)] && picks[grpSlot(g.id, 3)]
  ).length
  const allDone = completed === 12

  return (
    <div className="fixed bottom-[calc(3.5rem_+_env(safe-area-inset-bottom))] sm:bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
      <div className="max-w-2xl mx-auto px-3 py-2">
        {allDone ? (
          <button
            onClick={() => onNavigate('thirds')}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white text-sm font-bold py-2 rounded-xl active:scale-[0.98] transition-all">
            All groups done! Pick 3rd place qualifiers →
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold flex-shrink-0 tabular-nums w-8 text-gray-400">
              {completed}/12
            </span>
            <div className="flex items-center gap-1 flex-1 justify-between">
              {GROUPS.map((g, gi) => {
                const done = !!(picks[grpSlot(g.id, 1)] && picks[grpSlot(g.id, 2)] && picks[grpSlot(g.id, 3)])
                return (
                  <button
                    key={g.id}
                    onClick={() => onGroupClick(gi)}
                    aria-label={`Jump to Group ${g.id}`}
                    className={clsx(
                      'text-[11px] font-bold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all',
                      done ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                    )}>
                    {g.id}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Thirds Progress Bar ──────────────────────────────────────────────────────

function ThirdsProgressBar({ advancingThirds, onNavigate }: {
  advancingThirds: (string | null)[]
  onNavigate: (s: Section) => void
}) {
  const allDone = advancingThirds.filter(Boolean).length === 8

  return (
    <div className="fixed bottom-[calc(3.5rem_+_env(safe-area-inset-bottom))] sm:bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
      <div className="max-w-2xl mx-auto px-3 py-2">
        {allDone ? (
          <button
            onClick={() => onNavigate('bracket')}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white text-sm font-bold py-2 rounded-xl active:scale-[0.98] transition-all">
            All qualifiers picked! Fill your bracket →
          </button>
        ) : (
          <div className="flex items-center gap-1">
            {Array.from({ length: 8 }, (_, i) => {
              const team = advancingThirds[i] ?? null
              return (
                <div key={i} className={clsx(
                  'flex-1 flex flex-col items-center gap-0.5 rounded-lg py-1.5 min-w-0 transition-all',
                  team ? 'bg-emerald-50' : 'bg-gray-50'
                )}>
                  <span className="text-sm leading-none">
                    {team ? <Flag team={team} className="text-sm rounded-sm" /> : (
                      <span className="text-[10px] font-bold text-gray-300">{i + 1}</span>
                    )}
                  </span>
                  <span className={clsx(
                    'text-[9px] font-semibold leading-none w-full text-center truncate px-0.5',
                    team ? 'text-emerald-700' : 'text-gray-200'
                  )}>
                    {team ? team : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Bracket tree layout constants ────────────────────────────────────────────
const SLOT_H  = 68    // height per R32 slot (px) — sets vertical scale of the whole tree
const CARD_H  = 56    // match card height (px) — 28px per team row (better touch target)
const LABEL_H = 34    // round label row height above the tree (round name + date)
const COL_W   = 100   // match card column width (px)
const CONN_W  = 16    // connector area width between columns (px)
const TREE_H  = R32_MATCHES.length * SLOT_H       // 960px (matches only)
const TOTAL_H = LABEL_H + TREE_H                   // 982px
const CHAMP_W = 56
const TOTAL_W = 5 * COL_W + 4 * CONN_W + CHAMP_W  // full bracket width

// Y-center of a match within the tree area (excludes LABEL_H)
const treeCY = (r: number, i: number) => (i + 0.5) * Math.pow(2, r) * SLOT_H
// Absolute top of a match card within the container (includes LABEL_H)
const matchTY = (r: number, i: number) => LABEL_H + treeCY(r, i) - CARD_H / 2
// Left edge of a round column
const colX    = (r: number) => r * (COL_W + CONN_W)

// Knockout fixture schedule + real participants + result state, keyed by
// bracket_slot ('r32:1'…'final'). Used to seed R32 teams, show R32 dates, and
// lock cards whose tie has kicked off or finished.
type KoFixture = { kickoff_utc: string | null; venue: string | null; home: string | null; away: string | null; hasResult: boolean; actualWinner: string | null }
type KoFixtureMap = Record<string, KoFixture>

// A fixture team field is either a real qualified team, or a placeholder seed
// label ("Group L Winner", "Third Place Group E/H/I/J/K", "Group J 2nd Place").
// Real teams resolve to flags and are pickable; placeholders render as TBC.
const isPlaceholderTeam = (s: string | null | undefined): boolean =>
  !s || /\b(group|winner|place|3rd|runner|tbd|tbc)\b/i.test(s)
const realTeam = (s: string | null | undefined): string | null =>
  isPlaceholderTeam(s) ? null : (s as string)

// Compact local date for an R32 card label, e.g. "Sun 28 Jun"
const fmtR32Date = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  } catch { return '' }
}

const ROUND_LABELS = ['Round of 32', 'Round of 16', 'Quarter-finals', 'Semi-finals', 'Final']
const ROUND_DATES  = ['Jul 1–6', 'Jul 8–11', 'Jul 13–14', 'Jul 16–17', 'Jul 20 · NY']

// ── Bracket Section ──────────────────────────────────────────────────────────

function BracketSection({ picks, picksRef, savePick, resolveSlot, koFixtures, knockoutMode, shareFormat, shareFnRef, onNavigate, onShare }: {
  picks: Picks
  picksRef: React.RefObject<Picks>
  savePick: (k: string, v: string | null) => void
  resolveSlot: (desc: SlotDesc) => string | null
  advancingThirds: (string | null)[]
  koFixtures: KoFixtureMap
  knockoutMode: boolean
  shareFormat: 'portrait' | 'landscape' | 'square'
  shareFnRef: React.MutableRefObject<() => void>
  onNavigate: (s: Section) => void
  onShare: (format: string) => void
}) {
  const scrollRef    = useRef<HTMLDivElement>(null)
  const treeRef      = useRef<HTMLDivElement>(null)
  const [showRightFade, setShowRightFade] = useState(true)
  // In-progress "build-forward" choices: client-only, NEVER saved (so the tie reports
  // as not entered and never scores). Lets users keep building during the live window.
  const [provisional, setProvisional] = useState<Record<string, string | null>>({})
  // Snapshot of the knockout-resolved teams (real R32 seeds + advancement) so the
  // share-image canvas can render the SAME bracket the screen shows. Kept in a ref
  // (synced each render below) because the share builder reads it lazily on click.
  const koShareRef = useRef<{ on: boolean; fixtures: KoFixtureMap; shown: Record<string, string | null>; adv: Record<string, string | null>; tpHome: string | null; tpAway: string | null; tpWinner: string | null }>({ on: false, fixtures: {}, shown: {}, adv: {}, tpHome: null, tpAway: null, tpWinner: null })

  const groupsDone   = GROUPS.every(g => picks[grpSlot(g.id, 1)] && picks[grpSlot(g.id, 2)] && picks[grpSlot(g.id, 3)])
  const thirdsCount  = T_SLOTS.filter(t => picks[thirdSlot(t)]).length

  // ── Knockout-mode seeding (render-time only; never mutates bracket_picks) ────
  // R32 participants are the REAL fixtures (by bracket_slot). Any stored pick that
  // no longer matches its real tie is treated as unpicked, cascading down the tree.
  const r32TeamsFor = (key: string): [string | null, string | null] => {
    const f = koFixtures[key]
    return [realTeam(f?.home), realTeam(f?.away)]
  }
  // ── Fixture state (knockout mode) ───────────────────────────────────────────
  const nowMs = Date.now()
  const decided    = (slot: string): boolean => !!koFixtures[slot]?.hasResult
  const started    = (slot: string): boolean => {
    const f = koFixtures[slot]; if (!f) return false
    return decided(slot) || (!!f.kickoff_utc && Date.parse(f.kickoff_utc) <= nowMs)
  }
  // In progress = kicked off, no result yet.
  const inProgress = (slot: string): boolean => knockoutMode && started(slot) && !decided(slot)
  // Auto-advance the ACTUAL winner of a DECIDED tie into the next round (guarded to a
  // current participant) so users can keep building after the result.
  const autoAdvance = (slot: string, a: string | null, b: string | null): string | null => {
    if (!decided(slot)) return null
    const aw = koFixtures[slot]?.actualWinner ?? null
    return aw && (aw === a || aw === b) ? aw : null
  }
  const validPick = (slot: string, a: string | null, b: string | null): string | null => {
    const w = picks[slot] ?? null
    return w && (w === a || w === b) ? w : null
  }

  // Per-slot derived state (knockout mode), built top-down:
  //  • shown   = what the card highlights: the validated saved pick, or a decided tie's
  //              real winner. NEVER the in-progress build-only choice (those stay "Not entered").
  //  • adv     = what advances to the next round: shown, plus the in-progress build-only
  //              provisional choice (so users can build through the live window).
  //  • locked  = card can't be interacted with: a decided tie, an in-progress tie already
  //              entered (no editing mid-match), or an in-progress terminal tie (final/3rd —
  //              nothing to build forward, so locked at kickoff).
  const TERMINAL = new Set<string>([BRACKET_TREE.final.key, BRACKET_TREE.thirdPlace.key])
  const shownMap:  Record<string, string | null> = {}
  const advMap:    Record<string, string | null> = {}
  const lockedMap: Record<string, boolean>        = {}
  const computeSlot = (slot: string, a: string | null, b: string | null) => {
    const vp = validPick(slot, a, b)
    shownMap[slot]  = vp ?? autoAdvance(slot, a, b)
    advMap[slot]    = shownMap[slot] ?? (inProgress(slot) ? (provisional[slot] ?? null) : null)
    lockedMap[slot] = decided(slot) || (inProgress(slot) && (TERMINAL.has(slot) || vp !== null))
  }
  if (knockoutMode) {
    for (const m of R32_MATCHES) { const [h, a] = r32TeamsFor(m.key); computeSlot(m.key, h, a) }
    for (const m of [...BRACKET_TREE.r16, ...BRACKET_TREE.qf, ...BRACKET_TREE.sf, BRACKET_TREE.final]) {
      computeSlot(m.key, advMap[m.from[0]] ?? null, advMap[m.from[1]] ?? null)
    }
  }
  // Card-highlight winner (no in-progress build choice); raw picks outside knockout mode.
  const win = (key: string): string | null => knockoutMode ? (shownMap[key] ?? null) : (picks[key] ?? null)
  // Team that advances to the next round (includes in-progress build choices).
  const advance = (key: string): string | null => knockoutMode ? (advMap[key] ?? null) : (picks[key] ?? null)
  const lockedSlot = (slot: string): boolean => {
    if (!knockoutMode) return false
    return slot in lockedMap ? lockedMap[slot] : started(slot)   // terminal/uncomputed (e.g. tp) → lock at kickoff
  }

  // Surfaces the user's ORIGINAL stored pick under a card (knockout mode only), so a
  // prediction-era pick that isn't one of the real teams is still visible — marked
  // right/wrong once the tie has a result. Absolutely positioned just below the card.
  // Centered pill overlay showing the user's ORIGINAL pick for a slot (knockout mode):
  // their pick (marked right/wrong once the tie has a result) — or "Not picked" once a
  // tie is locked with no pick. Click-through so the team rows stay tappable.
  const pickNote = (slot: string): React.ReactNode => {
    if (!knockoutMode) return null
    const pill = (cls: string, label: React.ReactNode) => (
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
        <span className={clsx('inline-flex items-center gap-0.5 rounded-full border bg-white/95 px-1.5 py-0.5 text-[8px] font-semibold leading-none shadow-sm max-w-[84px] truncate', cls)}>
          {label}
        </span>
      </div>
    )
    // In progress: a saved (counting) pick shows neutrally; otherwise the tie reports
    // as "Not entered" (any build-forward choice is silent — it only seeds the next round).
    if (inProgress(slot)) {
      const sp = shownMap[slot] ?? null
      return sp
        ? pill('border-gray-200 text-gray-600', <span className="truncate">{sp}</span>)
        : pill('border-gray-200 text-gray-400 italic', 'Not entered')
    }
    const p = picks[slot] ?? null
    if (!p) {
      // Decided tie with no pick = a definitive miss; a not-yet-started tie stays blank.
      return decided(slot) ? pill('border-gray-200 text-gray-400 italic', '✗ Not picked') : null
    }
    const aw = koFixtures[slot]?.actualWinner ?? null
    const verdict = aw ? (p === aw ? 'ok' : 'no') : null
    const cls = verdict === 'ok' ? 'border-emerald-300 text-emerald-700'
      : verdict === 'no' ? 'border-rose-300 text-rose-600'
      : 'border-gray-200 text-gray-600'
    return pill(cls, <span className="truncate">{p}{verdict === 'ok' ? ' ✓' : verdict === 'no' ? ' ✗' : ''}</span>)
  }

  const champion = win('final')

  // Derive SF losers for the 3rd place play-off card (downstream advancers)
  const sf1Pick = advance(BRACKET_TREE.sf[0].key)
  const sf2Pick = advance(BRACKET_TREE.sf[1].key)
  const tpHome  = sf1Pick ? (BRACKET_TREE.sf[0].from.map((k: string) => advance(k)).find(t => t && t !== sf1Pick) ?? null) : null
  const tpAway  = sf2Pick ? (BRACKET_TREE.sf[1].from.map((k: string) => advance(k)).find(t => t && t !== sf2Pick) ?? null) : null
  // 3rd-place winner is validated against the SF losers (the tp participants).
  const tpRaw    = picks[BRACKET_TREE.thirdPlace.key] ?? null
  const tpWinner = knockoutMode
    ? ((tpRaw && (tpRaw === tpHome || tpRaw === tpAway) ? tpRaw : null) ?? autoAdvance(BRACKET_TREE.thirdPlace.key, tpHome, tpAway))
    : tpRaw

  // Keep the share-image snapshot current (real R32 seeds + resolved advancement).
  koShareRef.current = { on: knockoutMode, fixtures: koFixtures, shown: shownMap, adv: advMap, tpHome, tpAway, tpWinner }

  // Y position of the 3rd place card within the tree (below the Final card)
  const TP_CARD_TOP = matchTY(4, 0) + CARD_H + 28

  // Center the given round column in the scroll container
  const centerColumn = useCallback((roundIdx: number) => {
    const container = scrollRef.current
    if (!container) return
    const targetLeft = Math.max(0, colX(roundIdx) + COL_W / 2 - container.clientWidth / 2)
    requestAnimationFrame(() =>
      container.scrollTo({ left: targetLeft, behavior: 'smooth' })
    )
  }, [])

  // Scroll the page to the next unpicked R32 match after `currentKey`
  const scrollToNextR32 = useCallback((currentKey: string) => {
    const currentIdx = R32_MATCHES.findIndex(m => m.key === currentKey)
    const latest     = picksRef.current ?? {}
    for (let offset = 1; offset < R32_MATCHES.length; offset++) {
      const idx     = (currentIdx + offset) % R32_MATCHES.length
      const nextKey = R32_MATCHES[idx].key
      if (!latest[nextKey]) {
        const tree = treeRef.current
        if (!tree) return
        const treePageTop = tree.getBoundingClientRect().top + window.scrollY
        const matchTop    = treePageTop + matchTY(0, idx)
        window.scrollTo({ top: Math.max(0, matchTop - window.innerHeight / 2 + CARD_H / 2), behavior: 'smooth' })
        return
      }
    }
  }, [picksRef])

  // Scroll the page to the next unpicked match in any knockout round
  const scrollToNextInRound = useCallback((
    roundMatches: { key: string }[],
    roundIdx: number,
    currentKey: string,
  ) => {
    const currentIdx = roundMatches.findIndex(m => m.key === currentKey)
    const latest     = picksRef.current ?? {}
    for (let offset = 1; offset < roundMatches.length; offset++) {
      const idx     = (currentIdx + offset) % roundMatches.length
      const nextKey = roundMatches[idx].key
      if (!latest[nextKey]) {
        const tree = treeRef.current
        if (!tree) return
        const treePageTop = tree.getBoundingClientRect().top + window.scrollY
        const matchTop    = treePageTop + matchTY(roundIdx, idx)
        window.scrollTo({ top: Math.max(0, matchTop - window.innerHeight / 2 + CARD_H / 2), behavior: 'smooth' })
        return
      }
    }
  }, [picksRef])

  // Scroll the page to the 3rd place card
  const scrollToThirdPlace = useCallback(() => {
    const tree = treeRef.current
    if (!tree) return
    centerColumn(4)
    const treePageTop = tree.getBoundingClientRect().top + window.scrollY
    window.scrollTo({ top: treePageTop + TP_CARD_TOP - window.innerHeight / 2 + CARD_H / 2, behavior: 'smooth' })
  }, [centerColumn, TP_CARD_TOP])

  // Intercept picks: cascade-clear downstream winners, then auto-scroll
  const bracketPick = useCallback((key: string, team: string | null) => {
    // Clear all picks that derived from this match's winner
    getDownstream(key).forEach(k => savePick(k, null))
    savePick(key, team)
    if (!team) return
    if (key.startsWith('r32:')) scrollToNextR32(key)
    if (key.startsWith('r16:')) { centerColumn(1); scrollToNextInRound(BRACKET_TREE.r16, 1, key) }
    if (key.startsWith('qf:'))  { centerColumn(3); scrollToNextInRound(BRACKET_TREE.qf,  2, key) }
    if (key.startsWith('sf:')) {
      // Both SFs done → go to 3rd place; otherwise go to the remaining SF
      const otherSF = BRACKET_TREE.sf.find(m => m.key !== key)
      if (otherSF && picksRef.current?.[otherSF.key]) {
        scrollToThirdPlace()
      } else {
        centerColumn(3); scrollToNextInRound(BRACKET_TREE.sf, 3, key)
      }
    }
    if (key === BRACKET_TREE.thirdPlace.key) {
      // After 3rd place is picked, move focus to the Final
      centerColumn(4)
      const tree = treeRef.current
      if (tree) {
        const treePageTop = tree.getBoundingClientRect().top + window.scrollY
        window.scrollTo({ top: treePageTop + matchTY(4, 0) - window.innerHeight / 2 + CARD_H / 2, behavior: 'smooth' })
      }
    }
  }, [savePick, centerColumn, scrollToNextR32, scrollToNextInRound, scrollToThirdPlace, picksRef])

  // Build-only choice for an in-progress tie: client-only (never saved), so the tie stays
  // "not entered" and never scores. It only seeds the next round so users can keep building.
  const provisionalPick = useCallback((key: string, team: string | null) => {
    setProvisional(prev => ({ ...prev, [key]: prev[key] === team ? null : team }))
  }, [])
  // Pick handler per slot: in-progress + not-yet-entered ties build provisionally (not saved);
  // everything else saves normally.
  const pickHandler = (slot: string) => (inProgress(slot) && !lockedSlot(slot)) ? provisionalPick : bracketPick

  const shareAsPng = useCallback(async () => {
    const winner = picksRef.current?.['final'] ?? null
    if (!treeRef.current || !winner) return
    try {
      const { toPng } = await import('html-to-image')
      const upset     = findBiggestUpset(picksRef.current ?? {})
      const upsetLine = upset ? `\nBold call: ${upset.team} ${upset.label}` : ''
      const shareText = `My 2026 World Cup pick. 🏆\nChampion: ${winner}${upsetLine}\nBeat it → tribepicks.com/bracket?slug=wc2026`

      let dataUrl: string

      // Shared: build QR-code canvas for both formats
      const QRC = (await import('qrcode')).default
      const QR_URL   = 'https://tribepicks.com/bracket?slug=wc2026'
      const qrCanvas = document.createElement('canvas')
      await QRC.toCanvas(qrCanvas, QR_URL, { width: 72, margin: 1, color: { dark: '#111827', light: '#ffffff' } })

      if (shareFormat === 'portrait') {
        // Capture bracket tree; overlay logo top-right and QR bottom-right
        const { toCanvas: toCanvasP } = await import('html-to-image')
        const treeCanvas = await toCanvasP(treeRef.current, { backgroundColor: '#ffffff', pixelRatio: 2 })
        const PR  = 2
        const PAD = 20 * PR  // 40 device px

        const composite = document.createElement('canvas')
        composite.width  = treeCanvas.width
        composite.height = treeCanvas.height
        const ctxP = composite.getContext('2d')!
        ctxP.fillStyle = '#ffffff'
        ctxP.fillRect(0, 0, composite.width, composite.height)
        ctxP.drawImage(treeCanvas, 0, 0)

        // Logo — centred between Final and Winner column labels, at r16:1 match-card centre
        // Centre X: midpoint of (Final label centre = colX(4)+COL_W/2 = 670 CSS) and
        //           (Winner label centre = TOTAL_W−CHAMP_W/2 = 766 CSS) → 718 CSS → 1436 device px
        // Centre Y: LABEL_H + treeCY(1,0) = 22 + 1×SLOT_H = 90 CSS → 180 device px
        const logoImg = new Image(); logoImg.src = '/logo.png'
        await new Promise<void>(res => { logoImg.onload = () => res(); logoImg.onerror = () => res() })
        if (logoImg.naturalWidth > 0) {
          const logoH  = 80 * PR   // 160 device px (unchanged from previous step)
          const logoW  = (logoImg.naturalWidth / logoImg.naturalHeight) * logoH
          const logoCX = 1436      // device px
          const logoCY = 204       // device px
          const lx     = logoCX - logoW / 2
          const ly     = logoCY - logoH / 2
          ctxP.drawImage(logoImg, lx, ly, logoW, logoH)
          ctxP.textAlign    = 'center'
          ctxP.textBaseline = 'top'
          ctxP.font         = `bold ${11 * PR}px -apple-system, BlinkMacSystemFont, sans-serif`
          ctxP.fillStyle    = '#6b7280'
          ctxP.fillText('By TribePicks', logoCX, ly + logoH + 6)
        }

        // QR code — bottom-right (72 * 2 = 144 device px)
        const QR_P  = qrCanvas.width * PR
        const qrPX  = composite.width - QR_P - PAD
        const qrPY  = composite.height - QR_P - PAD
        ctxP.drawImage(qrCanvas, qrPX, qrPY, QR_P, QR_P)

        // URL text below QR
        ctxP.textAlign    = 'center'
        ctxP.textBaseline = 'top'
        ctxP.font         = `${10 * PR}px -apple-system, BlinkMacSystemFont, sans-serif`
        ctxP.fillStyle    = '#9ca3af'
        ctxP.fillText('tribepicks.com', qrPX + QR_P / 2, qrPY + QR_P + 6)

        dataUrl = composite.toDataURL('image/png')
      } else {
        // Landscape / Square bracket canvas — R32:1-8 left ← Final centre → R32:9-16 right
        const latest    = picksRef.current ?? {}
        const advThirds = T_SLOTS.map(t => latest[thirdSlot(t)] ?? null)
        const resolveD  = (desc: string): string | null => {
          if (desc.startsWith('T')) return advThirds[parseInt(desc.slice(1)) - 1] ?? null
          return latest[grpSlot(desc[1], parseInt(desc[0]) as 1 | 2)] ?? null
        }

        // Knockout mode draws from the SAME resolved teams as the screen (real R32
        // seeds + advancement), not the group/thirds prediction path. Outside
        // knockout mode these fall back to the prediction sources.
        const ko        = koShareRef.current
        const koOn      = !!ko.on
        // The two participants of a slot.
        const r32Parts  = (m: R32Match): [string | null, string | null] => koOn
          ? [realTeam(ko.fixtures[m.key]?.home), realTeam(ko.fixtures[m.key]?.away)]
          : [resolveD(m.home), resolveD(m.away)]
        const upParts   = (m: { from: string[] }): [string | null, string | null] => koOn
          ? [ko.adv[m.from[0]] ?? null, ko.adv[m.from[1]] ?? null]
          : [latest[m.from[0]] ?? null, latest[m.from[1]] ?? null]
        // The card-highlighted winner of a slot.
        const winOf     = (key: string): string | null => koOn ? (ko.shown[key] ?? null) : (latest[key] ?? null)
        // Champion as resolved on screen (knockout) or the raw final pick otherwise.
        const champ     = koOn ? (winOf('final') ?? winner) : winner

        const CW = 1600, CH = 900
        const isSquare = shareFormat === 'square'
        const TOP_PAD  = isSquare ? 350 : 0
        const CANVAS_H = isSquare ? CW : CH
        const LH = 48                     // label strip height (round name + date)
        const BH = CH - LH
        const SH = BH / 8
        const MW = 140, MH = 54        // match card dimensions
        const CG = 24                  // column gap

        // Column left-x positions (derived from center outward)
        const finalX = CW / 2 - MW / 2  // 730
        const sfLX   = finalX - CG - MW  // 566
        const qfLX   = sfLX   - CG - MW  // 402
        const r16LX  = qfLX   - CG - MW  // 238
        const r32LX  = r16LX  - CG - MW  // 74
        const sfRX   = finalX + MW + CG  // 894
        const qfRX   = sfRX   + MW + CG  // 1058
        const r16RX  = qfRX   + MW + CG  // 1222
        const r32RX  = r16RX  + MW + CG  // 1386

        // Y-center of match [roundIdx, matchIdx] — same formula for both halves
        const mCY = (r: number, i: number) => LH + (i + 0.5) * Math.pow(2, r) * SH

        const canvas = document.createElement('canvas')
        canvas.width  = CW
        canvas.height = CANVAS_H
        const ctx = canvas.getContext('2d')!

        // Background
        ctx.fillStyle = '#f3f4f6'
        ctx.fillRect(0, 0, CW, CANVAS_H)
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(8, 8, CW - 16, CANVAS_H - 16)

        if (isSquare) { ctx.save(); ctx.translate(0, TOP_PAD) }

        // Round labels with date subtitles
        const rlbls: Array<{ label: string; sub: string; x: number }> = [
          { label: 'R32',   sub: 'Jul 1–6',     x: r32LX + MW / 2 },
          { label: 'R16',   sub: 'Jul 8–11',    x: r16LX + MW / 2 },
          { label: 'QF',    sub: 'Jul 13–14',   x: qfLX  + MW / 2 },
          { label: 'SF',    sub: 'Jul 16–17',   x: sfLX  + MW / 2 },
          { label: 'FINAL', sub: 'Jul 20 · NY', x: CW / 2 },
          { label: 'SF',    sub: 'Jul 16–17',   x: sfRX  + MW / 2 },
          { label: 'QF',    sub: 'Jul 13–14',   x: qfRX  + MW / 2 },
          { label: 'R16',   sub: 'Jul 8–11',    x: r16RX + MW / 2 },
          { label: 'R32',   sub: 'Jul 1–6',     x: r32RX + MW / 2 },
        ]
        ctx.textAlign = 'center'
        rlbls.forEach(({ label, sub, x }) => {
          ctx.textBaseline = 'middle'
          ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif'
          ctx.fillStyle = label === 'FINAL' ? '#b45309' : '#9ca3af'
          ctx.fillText(label, x, LH * 0.33)
          ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif'
          ctx.fillStyle = label === 'FINAL' ? '#d97706' : '#9ca3af'
          ctx.fillText(sub, x, LH * 0.72)
        })

        // drawCard: renders one match card at (x, y); highlight=true gives amber border (Final)
        const drawCard = (x: number, y: number, tA: string | null, tB: string | null, win: string | null, highlight = false) => {
          ctx.fillStyle = highlight ? '#fffbeb' : '#ffffff'
          ctx.strokeStyle = highlight ? '#f59e0b' : '#e5e7eb'
          ctx.lineWidth = highlight ? 2 : 1
          ctx.beginPath(); ctx.roundRect(x, y, MW, MH, 5); ctx.fill(); ctx.stroke()

          ctx.strokeStyle = highlight ? '#fde68a' : '#f3f4f6'
          ctx.lineWidth = 1
          ctx.beginPath(); ctx.moveTo(x + 4, y + MH / 2); ctx.lineTo(x + MW - 4, y + MH / 2); ctx.stroke()

          const rowH = MH / 2
          ;([tA, tB] as const).forEach((team, ri) => {
            const ty  = y + ri * rowH
            const isW = !!team && team === win
            const isL = !!win && !!team && team !== win
            if (isW) {
              ctx.fillStyle = '#f0fdf4'
              ctx.fillRect(x + 1, ty + (ri === 0 ? 1 : 0), MW - 2, rowH - (ri === 0 ? 1 : 0))
            }
            const flag   = team ? flagFor(team) : ''
            ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
            const midY  = ty + rowH / 2
            ctx.globalAlpha = isL ? 0.35 : 1
            if (flag) {
              ctx.font = '11px serif'; ctx.fillStyle = '#000'
              ctx.fillText(flag, x + 5, midY)
            }
            ctx.font = isW
              ? 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif'
              : '10px -apple-system, BlinkMacSystemFont, sans-serif'
            ctx.fillStyle = isW ? '#059669' : team ? '#374151' : '#d1d5db'
            const nameX = flag ? x + 21 : x + 7
            const maxW  = MW - (flag ? 26 : 12) - (isW ? 14 : 0)
            ctx.save(); ctx.beginPath(); ctx.rect(nameX, ty, maxW, rowH); ctx.clip()
            ctx.fillText(team ?? '—', nameX, midY)
            ctx.restore()
            ctx.globalAlpha = 1
            if (isW) {
              ctx.fillStyle = '#10b981'
              ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif'
              ctx.textAlign = 'right'
              ctx.fillText('✓', x + MW - 4, midY)
            }
          })
        }

        // Connectors for left half (flow rightward; pairs of fromRound merge into toRound)
        const drawConnsL = (fromX: number, toX: number, pairs: number, r: number) => {
          ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1
          const xMid = fromX + CG / 2
          for (let i = 0; i < pairs; i++) {
            const y1   = mCY(r,     i * 2)
            const y2   = mCY(r,     i * 2 + 1)
            const yMid = mCY(r + 1, i)
            ctx.beginPath()
            ctx.moveTo(fromX, y1); ctx.lineTo(xMid, y1)
            ctx.moveTo(xMid,  y1); ctx.lineTo(xMid, y2)
            ctx.moveTo(fromX, y2); ctx.lineTo(xMid, y2)
            ctx.moveTo(xMid, yMid); ctx.lineTo(toX, yMid)
            ctx.stroke()
          }
        }

        // Connectors for right half (flow leftward; pairs of fromRound merge into toRound)
        const drawConnsR = (fromX: number, toX: number, pairs: number, r: number) => {
          ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1
          const xMid = fromX - CG / 2
          for (let i = 0; i < pairs; i++) {
            const y1   = mCY(r,     i * 2)
            const y2   = mCY(r,     i * 2 + 1)
            const yMid = mCY(r + 1, i)
            ctx.beginPath()
            ctx.moveTo(fromX, y1); ctx.lineTo(xMid, y1)
            ctx.moveTo(xMid,  y1); ctx.lineTo(xMid, y2)
            ctx.moveTo(fromX, y2); ctx.lineTo(xMid, y2)
            ctx.moveTo(xMid, yMid); ctx.lineTo(toX, yMid)
            ctx.stroke()
          }
        }

        // ── Phase 1: All grey connectors ──
        ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1; ctx.lineCap = 'butt'
        drawConnsL(r32LX + MW, r16LX, 4, 0)
        drawConnsL(r16LX + MW, qfLX, 2, 1)
        drawConnsL(qfLX + MW, sfLX, 1, 2)
        ctx.beginPath(); ctx.moveTo(sfLX + MW, mCY(3, 0)); ctx.lineTo(finalX,      mCY(3, 0)); ctx.stroke()
        drawConnsR(r32RX, r16RX + MW, 4, 0)
        drawConnsR(r16RX, qfRX + MW,  2, 1)
        drawConnsR(qfRX,  sfRX + MW,  1, 2)
        ctx.beginPath(); ctx.moveTo(finalX + MW, mCY(3, 0)); ctx.lineTo(sfRX,      mCY(3, 0)); ctx.stroke()

        // ── Phase 2: Champion path highlight (amber spine) ──
        {
          const r32i = R32_MATCHES.findIndex(m => winOf(m.key) === champ)
          const r16i = BRACKET_TREE.r16.findIndex(m => winOf(m.key) === champ)
          const qfi  = BRACKET_TREE.qf.findIndex(m => winOf(m.key) === champ)
          const sfi  = BRACKET_TREE.sf.findIndex(m => winOf(m.key) === champ)
          if (champ && r32i >= 0 && r16i >= 0 && qfi >= 0 && sfi >= 0) {
            ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
            if (sfi === 0) {
              const xA = r32LX + MW + CG / 2
              ctx.beginPath(); ctx.moveTo(r32LX + MW, mCY(0, r32i)); ctx.lineTo(xA, mCY(0, r32i)); ctx.lineTo(xA, mCY(1, r16i)); ctx.lineTo(r16LX, mCY(1, r16i)); ctx.stroke()
              const xB = r16LX + MW + CG / 2
              ctx.beginPath(); ctx.moveTo(r16LX + MW, mCY(1, r16i)); ctx.lineTo(xB, mCY(1, r16i)); ctx.lineTo(xB, mCY(2, qfi)); ctx.lineTo(qfLX, mCY(2, qfi)); ctx.stroke()
              const xC = qfLX + MW + CG / 2
              ctx.beginPath(); ctx.moveTo(qfLX + MW, mCY(2, qfi)); ctx.lineTo(xC, mCY(2, qfi)); ctx.lineTo(xC, mCY(3, 0)); ctx.lineTo(sfLX, mCY(3, 0)); ctx.stroke()
              ctx.beginPath(); ctx.moveTo(sfLX + MW, mCY(3, 0)); ctx.lineTo(finalX, mCY(3, 0)); ctx.stroke()
            } else {
              const r32j = r32i - 8; const r16j = r16i - 4; const qfj = qfi - 2
              const xA = r32RX - CG / 2
              ctx.beginPath(); ctx.moveTo(r32RX, mCY(0, r32j)); ctx.lineTo(xA, mCY(0, r32j)); ctx.lineTo(xA, mCY(1, r16j)); ctx.lineTo(r16RX + MW, mCY(1, r16j)); ctx.stroke()
              const xB = r16RX - CG / 2
              ctx.beginPath(); ctx.moveTo(r16RX, mCY(1, r16j)); ctx.lineTo(xB, mCY(1, r16j)); ctx.lineTo(xB, mCY(2, qfj)); ctx.lineTo(qfRX + MW, mCY(2, qfj)); ctx.stroke()
              const xC = qfRX - CG / 2
              ctx.beginPath(); ctx.moveTo(qfRX, mCY(2, qfj)); ctx.lineTo(xC, mCY(2, qfj)); ctx.lineTo(xC, mCY(3, 0)); ctx.lineTo(sfRX + MW, mCY(3, 0)); ctx.stroke()
              ctx.beginPath(); ctx.moveTo(sfRX, mCY(3, 0)); ctx.lineTo(finalX + MW, mCY(3, 0)); ctx.stroke()
            }
            ctx.lineWidth = 1; ctx.lineCap = 'butt'
          }
        }

        // ── Phase 3: All match cards + SF/Final venue & local kickoff time ──
        const fmtTime = (iso: string) => { try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }) } catch { return '' } }
        const drawVT = (cardX: number, cardTopY: number, venue: string, iso: string) => {
          ctx.textAlign = 'center'; ctx.textBaseline = 'top'
          ctx.font = '8px -apple-system, BlinkMacSystemFont, sans-serif'; ctx.fillStyle = '#9ca3af'
          ctx.fillText(`${venue}  ·  ${fmtTime(iso)}`, cardX + MW / 2, cardTopY + MH + 4)
        }

        R32_MATCHES.slice(0, 8).forEach((m, i) =>
          drawCard(r32LX, mCY(0, i) - MH / 2, ...r32Parts(m), winOf(m.key))
        )
        BRACKET_TREE.r16.slice(0, 4).forEach((m, i) =>
          drawCard(r16LX, mCY(1, i) - MH / 2, ...upParts(m), winOf(m.key))
        )
        BRACKET_TREE.qf.slice(0, 2).forEach((m, i) =>
          drawCard(qfLX, mCY(2, i) - MH / 2, ...upParts(m), winOf(m.key))
        )
        { const m = BRACKET_TREE.sf[0]; const ty = mCY(3, 0) - MH / 2; drawCard(sfLX, ty, ...upParts(m), winOf(m.key)); drawVT(sfLX, ty, 'MetLife, NY', '2026-07-16T23:00:00Z') }

        R32_MATCHES.slice(8).forEach((m, i) =>
          drawCard(r32RX, mCY(0, i) - MH / 2, ...r32Parts(m), winOf(m.key))
        )
        BRACKET_TREE.r16.slice(4).forEach((m, i) =>
          drawCard(r16RX, mCY(1, i) - MH / 2, ...upParts(m), winOf(m.key))
        )
        BRACKET_TREE.qf.slice(2).forEach((m, i) =>
          drawCard(qfRX, mCY(2, i) - MH / 2, ...upParts(m), winOf(m.key))
        )
        { const m = BRACKET_TREE.sf[1]; const ty = mCY(3, 0) - MH / 2; drawCard(sfRX, ty, ...upParts(m), winOf(m.key)); drawVT(sfRX, ty, 'AT&T, Dallas', '2026-07-17T23:00:00Z') }

        // ── Final (centre) ──
        { const m = BRACKET_TREE.final; const ty = mCY(3, 0) - MH / 2; drawCard(finalX, ty, ...upParts(m), champ, true); drawVT(finalX, ty, 'MetLife, NY', '2026-07-20T19:00:00Z') }

        // Final label above card
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
        ctx.font = 'bold 9px -apple-system, BlinkMacSystemFont, sans-serif'
        ctx.fillStyle = '#d97706'
        ctx.fillText('FINAL · Jul 20 · MetLife, NY', CW / 2, mCY(3, 0) - MH / 2 - 3)

        // Champion badge — pushed down to clear venue/time text below Final card
        const badgeY = mCY(3, 0) + MH / 2 + 30
        ctx.textAlign = 'center'; ctx.textBaseline = 'top'
        ctx.font = '22px serif'; ctx.fillStyle = '#000'
        ctx.fillText('🏆', CW / 2, badgeY)
        ctx.font = `bold ${champ.length > 12 ? 11 : 13}px -apple-system, BlinkMacSystemFont, sans-serif`
        ctx.fillStyle = '#b45309'
        ctx.fillText(champ, CW / 2, badgeY + 28)

        // ── 3rd Place Play-off (below champion badge) ──
        {
          const [sfA0, sfA1] = upParts(BRACKET_TREE.sf[0])
          const [sfB0, sfB1] = upParts(BRACKET_TREE.sf[1])
          const sf1 = winOf(BRACKET_TREE.sf[0].key)
          const sf2 = winOf(BRACKET_TREE.sf[1].key)
          const sfL1 = koOn ? ko.tpHome : (sf1 ? ([sfA0, sfA1].find(t => t && t !== sf1) ?? null) : null)
          const sfL2 = koOn ? ko.tpAway : (sf2 ? ([sfB0, sfB1].find(t => t && t !== sf2) ?? null) : null)
          const tpWinner = koOn ? ko.tpWinner : (latest[BRACKET_TREE.thirdPlace.key] ?? null)
          const tpY = badgeY + 52
          ctx.textAlign = 'center'; ctx.textBaseline = 'top'
          ctx.font = 'bold 8px -apple-system, BlinkMacSystemFont, sans-serif'
          ctx.fillStyle = '#9ca3af'
          ctx.fillText('3RD PLACE · Jul 19 · Miami', CW / 2, tpY)
          drawCard(finalX, tpY + 13, sfL1, sfL2, tpWinner)
        }

        if (isSquare) ctx.restore()

        // Branding
        const logoB = new Image(); logoB.src = '/logo.png'
        await new Promise<void>(res => { logoB.onload = () => res(); logoB.onerror = () => res() })

        if (!isSquare) {
          // Landscape: logo top-center, QR bottom-center
          if (logoB.naturalWidth > 0) {
            const lH = 56
            const lW = (logoB.naturalWidth / logoB.naturalHeight) * lH
            const lx = CW / 2 - lW / 2
            const ly = LH + 14
            ctx.drawImage(logoB, lx, ly, lW, lH)
            ctx.textAlign    = 'center'
            ctx.textBaseline = 'top'
            ctx.font         = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif'
            ctx.fillStyle    = '#6b7280'
            ctx.fillText('By TribePicks', CW / 2, ly + lH + 4)
          }
          const QR_L = 112
          ctx.drawImage(qrCanvas, CW / 2 - QR_L / 2, CH - QR_L - 14, QR_L, QR_L)
        } else {
          // Square: logo in top strip, QR in bottom strip
          if (logoB.naturalWidth > 0) {
            const lH = 80
            const lW = (logoB.naturalWidth / logoB.naturalHeight) * lH
            const ly = TOP_PAD / 2 - lH / 2 - 14
            const lx = CW / 2 - lW / 2
            ctx.drawImage(logoB, lx, ly, lW, lH)
            ctx.textAlign    = 'center'
            ctx.textBaseline = 'top'
            ctx.font         = 'bold 13px -apple-system, BlinkMacSystemFont, sans-serif'
            ctx.fillStyle    = '#6b7280'
            ctx.fillText('By TribePicks', CW / 2, ly + lH + 6)
          }
          const QR_S = 120
          const qrY  = CANVAS_H - TOP_PAD / 2 - QR_S / 2
          ctx.drawImage(qrCanvas, CW / 2 - QR_S / 2, qrY, QR_S, QR_S)
          ctx.textAlign    = 'center'
          ctx.textBaseline = 'top'
          ctx.font         = '10px -apple-system, BlinkMacSystemFont, sans-serif'
          ctx.fillStyle    = '#9ca3af'
          ctx.fillText('tribepicks.com', CW / 2, qrY + QR_S + 6)
        }

        dataUrl = canvas.toDataURL('image/png')
      }

      const blob = await fetch(dataUrl).then(r => r.blob())
      const file = new File([blob], 'wc2026-bracket.png', { type: 'image/png' })
      if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: '2026 World Cup!', text: shareText })
      } else {
        const a    = document.createElement('a')
        a.href     = dataUrl
        a.download = 'wc2026-bracket.png'
        a.click()
      }
      onShare(shareFormat)
    } catch {}
  }, [picksRef, shareFormat, onShare])

  // Expose shareAsPng to parent via ref so the banner rendered above the tabs can trigger it
  shareFnRef.current = shareAsPng

  // Show prerequisite gate before the bracket tree (skipped in knockout mode —
  // the bracket seeds from real fixtures, so group/thirds picks aren't required)
  if (!knockoutMode && (!groupsDone || thirdsCount < 8)) {
    const needGroups = !groupsDone
    return (
      <div className="flex flex-col items-center justify-center gap-5 py-16 text-center px-4">
        <span className="text-5xl">{needGroups ? '🗓️' : '🎯'}</span>
        <div>
          <p className="text-base font-bold text-gray-800">
            {needGroups ? 'Complete your groups first' : 'Pick your 8 third-place qualifiers'}
          </p>
          <p className="text-sm text-gray-500 mt-1.5 max-w-xs mx-auto">
            {needGroups
              ? 'Pick 1st, 2nd, and 3rd for all 12 groups before filling your bracket.'
              : `${8 - thirdsCount} more third-place team${8 - thirdsCount !== 1 ? 's' : ''} to go before your bracket unlocks.`}
          </p>
        </div>
        <button
          onClick={() => onNavigate(needGroups ? 'groups' : 'thirds')}
          className="bg-emerald-600 text-white text-sm font-bold px-6 py-3 rounded-xl active:scale-95 transition-all">
          {needGroups ? 'Go to Groups →' : 'Go to 3rd Place →'}
        </button>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs text-gray-500 mb-3">
        {knockoutMode
          ? 'Pick winners for each match. Teams are the confirmed Round-of-32 qualifiers.'
          : 'Pick winners for each match. Teams shown are from your group stage picks.'}
      </p>
      <div className="relative">
        {/* Right-edge fade — indicates horizontal scrollability; hidden once scrolled to the end */}
        {showRightFade && (
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-gray-50 to-transparent z-10" aria-hidden="true" />
        )}
        <div ref={scrollRef} className="overflow-x-auto"
          onScroll={e => {
            const el = e.currentTarget
            setShowRightFade(el.scrollLeft + el.clientWidth < el.scrollWidth - 8)
          }}>
        <div ref={treeRef} style={{ position: 'relative', width: TOTAL_W, height: TOTAL_H }}>

          {/* Round labels */}
          {ROUND_LABELS.map((lbl, ri) => (
            <div key={ri}
              style={{ position: 'absolute', top: 0, left: colX(ri), width: COL_W, height: LABEL_H }}
              className="flex flex-col items-center justify-center gap-px">
              <span className="text-[9px] font-bold text-gray-400 tracking-wider uppercase leading-none">{lbl}</span>
              <span className="text-[8px] text-gray-300 leading-none">{ROUND_DATES[ri]}</span>
            </div>
          ))}
          <div style={{ position: 'absolute', top: 0, left: TOTAL_W - CHAMP_W, width: CHAMP_W, height: LABEL_H }}
            className="flex items-center justify-center">
            <span className="text-[10px] font-bold text-amber-500 tracking-wider uppercase">Winner</span>
          </div>

          {/* ── Round of 32 (bracket-topology order; date shown above each card) ── */}
          {R32_MATCHES.map((m, i) => {
            const fx = koFixtures[m.key]
            const ko = fx?.kickoff_utc ?? null
            // Knockout mode: seed from real fixtures (placeholder → null = TBC).
            const homeTeam = knockoutMode ? realTeam(fx?.home) : resolveSlot(m.home)
            const awayTeam = knockoutMode ? realTeam(fx?.away) : resolveSlot(m.away)
            const homeDesc = knockoutMode ? (fx?.home ?? m.home) : m.home
            const awayDesc = knockoutMode ? (fx?.away ?? m.away) : m.away
            return (
              <div key={m.key} style={{ position: 'absolute', top: matchTY(0, i), left: colX(0), width: COL_W }}>
                {ko && (
                  <div className="absolute left-0 right-0 text-center text-[8px] font-semibold text-gray-400 leading-none"
                    style={{ top: -11 }}>
                    {fmtR32Date(ko)}
                  </div>
                )}
                <BracketMatchCard
                  matchKey={m.key}
                  homeTeam={homeTeam} awayTeam={awayTeam}
                  homeDesc={homeDesc} awayDesc={awayDesc}
                  winner={win(m.key)} savePick={pickHandler(m.key)}
                  locked={lockedSlot(m.key)}
                  overlay={pickNote(m.key)}
                />
              </div>
            )
          })}
          <BracketConnectors fromRoundIdx={0} fromCount={16} />

          {/* ── Round of 16 ── */}
          {BRACKET_TREE.r16.map((m, i) => (
            <div key={m.key} style={{ position: 'absolute', top: matchTY(1, i), left: colX(1), width: COL_W }}>
              <BracketMatchCard
                matchKey={m.key}
                homeTeam={advance(m.from[0])} awayTeam={advance(m.from[1])}
                homeDesc={m.from[0]}          awayDesc={m.from[1]}
                winner={win(m.key)}           savePick={pickHandler(m.key)}
                locked={lockedSlot(m.key)}
                overlay={pickNote(m.key)}
              />
            </div>
          ))}
          <BracketConnectors fromRoundIdx={1} fromCount={8} />

          {/* ── Quarter-finals ── */}
          {BRACKET_TREE.qf.map((m, i) => (
            <div key={m.key} style={{ position: 'absolute', top: matchTY(2, i), left: colX(2), width: COL_W }}>
              <BracketMatchCard
                matchKey={m.key}
                homeTeam={advance(m.from[0])} awayTeam={advance(m.from[1])}
                homeDesc={m.from[0]}          awayDesc={m.from[1]}
                winner={win(m.key)}           savePick={pickHandler(m.key)}
                locked={lockedSlot(m.key)}
                overlay={pickNote(m.key)}
              />
            </div>
          ))}
          <BracketConnectors fromRoundIdx={2} fromCount={4} />

          {/* ── Semi-finals ── */}
          {BRACKET_TREE.sf.map((m, i) => (
            <div key={m.key} style={{ position: 'absolute', top: matchTY(3, i), left: colX(3), width: COL_W }}>
              <BracketMatchCard
                matchKey={m.key}
                homeTeam={advance(m.from[0])} awayTeam={advance(m.from[1])}
                homeDesc={m.from[0]}          awayDesc={m.from[1]}
                winner={win(m.key)}           savePick={pickHandler(m.key)}
                locked={lockedSlot(m.key)}
                overlay={pickNote(m.key)}
              />
            </div>
          ))}
          <BracketConnectors fromRoundIdx={3} fromCount={2} />

          {/* ── 3rd Place Play-off ── */}
          <div style={{ position: 'absolute', top: TP_CARD_TOP, left: colX(4), width: COL_W }}>
            <div className="text-[8px] font-bold text-gray-400 tracking-wider uppercase text-center mb-1.5">
              3rd Place · Jul 19 · Miami
            </div>
            <BracketMatchCard
              matchKey={BRACKET_TREE.thirdPlace.key}
              homeTeam={tpHome}
              awayTeam={tpAway}
              homeDesc="SF1 loser"
              awayDesc="SF2 loser"
              winner={tpWinner}
              savePick={bracketPick}
              locked={lockedSlot(BRACKET_TREE.thirdPlace.key)}
              overlay={pickNote(BRACKET_TREE.thirdPlace.key)}
            />
          </div>

          {/* ── Final (locked until 3rd place is picked, so it isn't skipped) ── */}
          {(() => {
            const finalHome   = advance(BRACKET_TREE.final.from[0])
            const finalAway   = advance(BRACKET_TREE.final.from[1])
            const thirdPicked = !!tpWinner
            // Locked if the Final has kicked off / has a result, or the existing
            // 3rd-place-first gate applies.
            const finalLocked = lockedSlot(BRACKET_TREE.final.key) || (!!(finalHome && finalAway) && !thirdPicked)
            return (
              <div style={{ position: 'absolute', top: matchTY(4, 0) - 14, left: colX(4), width: COL_W }}>
                <div className="text-[8px] font-bold text-amber-500 tracking-wider uppercase text-center mb-1.5">
                  Final · Jul 20 · MetLife, NY
                </div>
                <div className={clsx('relative group', finalLocked && 'cursor-help')} title={finalLocked ? 'Pick the 3rd-place winner first' : undefined}>
                  <BracketMatchCard
                    matchKey={BRACKET_TREE.final.key}
                    homeTeam={finalHome}
                    awayTeam={finalAway}
                    homeDesc={BRACKET_TREE.final.from[0]}
                    awayDesc={BRACKET_TREE.final.from[1]}
                    winner={champion}
                    savePick={savePick}
                    isFinal
                    locked={finalLocked}
                    overlay={pickNote(BRACKET_TREE.final.key)}
                  />
                  {finalLocked && (
                    <div className="pointer-events-none absolute inset-x-0 -bottom-8 flex justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-amber-600 text-white text-[10px] rounded-full px-3 py-1.5 shadow-lg whitespace-nowrap">
                        🥉 Pick the 3rd-place winner first
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          {/* ── Champion ── */}
          {champion && (
            <div style={{
              position: 'absolute',
              top: LABEL_H + treeCY(4, 0) - 44,
              left: colX(4) + COL_W + 10,
              width: CHAMP_W - 10,
            }} className="flex flex-col items-center gap-1 bg-amber-50 border border-amber-200 rounded-xl px-2 py-2.5">
              <Flag team={champion} className="text-2xl rounded-sm" />
              <span className="text-[9px] font-bold text-amber-700 text-center leading-tight">{champion}</span>
              <span className="text-base leading-none">🏆</span>
            </div>
          )}
        </div>
        </div>{/* end scrollRef */}
      </div>{/* end relative wrapper */}
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

function BracketMatchCard({ matchKey, homeTeam, awayTeam, homeDesc, awayDesc, winner, savePick, isFinal, locked, overlay }: {
  matchKey: string
  homeTeam: string | null
  awayTeam: string | null
  homeDesc: string
  awayDesc: string
  winner: string | null
  savePick: (k: string, v: string | null) => void
  isFinal?: boolean
  locked?: boolean
  overlay?: React.ReactNode
}) {
  // A winner can only be chosen once BOTH competitors are known — otherwise a
  // lone qualifier (e.g. one semi-finalist while the other slot is still a
  // placeholder) could be crowned, skipping the unfinished side of the bracket.
  const bothPresent = !!homeTeam && !!awayTeam
  const pick = (team: string | null) => {
    if (!team || locked || !bothPresent) return
    savePick(matchKey, winner === team ? null : team)
  }

  return (
    <div className={clsx(
      'relative rounded-xl border bg-white shadow-sm overflow-hidden',
      isFinal ? 'border-amber-400 ring-1 ring-amber-300' : 'border-gray-200',
      locked && 'opacity-60'
    )} style={{ height: CARD_H }}>
      {locked && (
        <span
          className="absolute top-0.5 right-0.5 z-10 flex items-center justify-center rounded-full bg-white/90 p-0.5 shadow-sm"
          aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
            strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5 text-gray-500">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>
      )}
      {[
        { team: homeTeam, desc: homeDesc },
        { team: awayTeam, desc: awayDesc },
      ].map(({ team, desc }, i) => {
        const isWinner = !!team && winner === team
        const isLoser  = !!winner && !!team && winner !== team
        const competitorTbd = !!team && !bothPresent          // opponent slot still a placeholder
        const pickable      = !!team && bothPresent && !locked
        return (
          <button
            key={i}
            type="button"
            onClick={() => pick(team)}
            // aria-disabled (not native `disabled`) so the not-allowed cursor still
            // renders on hover — disabled buttons ignore CSS cursor. pick() guards the click.
            aria-disabled={!team || !bothPresent || locked}
            aria-label={team ? `Pick ${team}${isWinner ? ' (selected)' : ''}` : 'TBD'}
            aria-pressed={isWinner}
            style={{ height: CARD_H / 2 }}
            className={clsx(
              'w-full flex items-center gap-1 px-1.5 text-left transition-all',
              i === 0 ? '' : 'border-t border-gray-100',
              isWinner && 'bg-emerald-50',
              isLoser && 'opacity-40',
              !team && 'cursor-default',
              competitorTbd && 'cursor-not-allowed',   // not ready — opponent still TBD
              pickable && clsx('cursor-pointer', !isWinner && !isLoser && 'hover:bg-gray-50'),
              // when locked (both present — the Final's 3rd-place gate), the cursor-help
              // on the wrapper is inherited rather than overridden here
            )}>
            <span className="text-sm leading-none flex-shrink-0" aria-hidden="true">
              {team ? <Flag team={team} className="text-sm rounded-sm" /> : '·'}
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
      {overlay}
    </div>
  )
}
