'use client'

// Satirical, auto-generated "Weekly Intelligence Report" for comp admins.
// Pure presentation — all data comes from /api/comp-analytics/report.

interface Leader  { name: string; points: number; correct: number }
interface Laggard { name: string; points: number }
export interface ReportData {
  comp_name:    string
  member_count: number
  leaders:      Leader[]
  laggards:     Laggard[]
  ghosts:       { count: number; names: string[] }
  stats:        { total_members: number; scored_count: number; avg_points: number; top_score: number; bonus_team_pct: number }
}

// Rotating "charges" so each suspect reads a little differently (index-stable).
const CHARGES = [
  (l: Leader) => `${l.points} pts (${l.correct} correct). A hit-rate that, frankly, raises eyebrows.`,
  (_l: Leader) => `Suspected of watching the actual matches prior to predicting them.`,
  (_l: Leader) => `Found in possession of an unexplained crystal ball. Pending forensic review.`,
  (l: Leader) => `${l.points} pts — statistically improbable without a time machine.`,
]
const PIP_LINES = [
  (l: Laggard) => `${l.points} pts. Rating: "meets some expectations." PIP issued.`,
  (l: Laggard) => `Currently exceeding only the expectations of their rivals (${l.points} pts).`,
  (l: Laggard) => `${l.points} pts. A motivational poster has been dispatched.`,
]

function Stamp() {
  return (
    <span className="inline-block border-2 border-red-500/70 text-red-500/80 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm -rotate-6 select-none">
      Confidential
    </span>
  )
}

export function WeeklyIntelligenceReport({ data }: { data: ReportData }) {
  const today = new Date()
  const dateStr = today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const ref = `TP/${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
  const { leaders, laggards, ghosts, stats } = data

  return (
    <div className="font-mono text-[12px] leading-relaxed text-gray-800 bg-[#fbfaf6] border-2 border-gray-800 rounded-lg overflow-hidden shadow-sm">
      {/* Letterhead */}
      <div className="border-b-2 border-gray-800 px-4 py-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500">TribePicks · Office of Competitive Integrity</p>
          <p className="text-sm font-bold tracking-wide">WEEKLY INTELLIGENCE REPORT</p>
          <p className="text-[11px] text-gray-600">Re: {data.comp_name} · {data.member_count} registered operatives</p>
        </div>
        <div className="text-right flex-shrink-0 space-y-1">
          <Stamp />
          <p className="text-[10px] text-gray-500">CASE {ref}</p>
          <p className="text-[10px] text-gray-500">{dateStr}</p>
        </div>
      </div>

      <div className="px-4 py-3 space-y-4">
        {/* 1. Compliance */}
        <section>
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-700 border-b border-dashed border-gray-300 pb-1 mb-2">
            § 1 — Compliance · Insider-Trading Investigation
          </p>
          {leaders.length === 0 ? (
            <p className="text-gray-500 italic">No suspects identified yet. The investigation continues.</p>
          ) : (
            <ol className="space-y-1.5">
              {leaders.map((l, i) => (
                <li key={l.name} className="flex gap-2">
                  <span className="text-red-600 font-bold flex-shrink-0">⚠ {String(i + 1).padStart(2, '0')}</span>
                  <span><strong>{l.name}</strong> — {CHARGES[i % CHARGES.length](l)} <span className="text-red-600 font-semibold">[UNDER INVESTIGATION]</span></span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* 2. People & Culture */}
        <section>
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-700 border-b border-dashed border-gray-300 pb-1 mb-2">
            § 2 — People &amp; Culture · Performance Management
          </p>
          {laggards.length === 0 && ghosts.count === 0 ? (
            <p className="text-gray-500 italic">No performance concerns on file. Suspicious in itself.</p>
          ) : (
            <ul className="space-y-1.5">
              {laggards.map((l, i) => (
                <li key={l.name} className="flex gap-2">
                  <span className="text-amber-600 flex-shrink-0">▸</span>
                  <span><strong>{l.name}</strong> — {PIP_LINES[i % PIP_LINES.length](l)}</span>
                </li>
              ))}
              {ghosts.count > 0 && (
                <li className="flex gap-2">
                  <span className="text-amber-600 flex-shrink-0">▸</span>
                  <span>
                    <strong>{ghosts.count}</strong> operative{ghosts.count !== 1 ? 's' : ''} unaccounted for
                    {ghosts.names.length ? <> ({ghosts.names.join(', ')}{ghosts.count > ghosts.names.length ? ', et al.' : ''})</> : null}.
                    Last seen near the &ldquo;Pick a team&rdquo; button.
                  </span>
                </li>
              )}
            </ul>
          )}
        </section>

        {/* 3. Business-as-usual */}
        <section>
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-700 border-b border-dashed border-gray-300 pb-1 mb-2">
            § 3 — Business-as-usual <span className="font-normal normal-case text-gray-400">(low priority)</span>
          </p>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <li>📊 On the board: <strong>{stats.scored_count}/{stats.total_members}</strong></li>
            <li>📈 Avg points: <strong>{stats.avg_points}</strong></li>
            <li>🏆 Top score: <strong>{stats.top_score}</strong></li>
            <li>⭐ Bonus-team uptake: <strong>{stats.bonus_team_pct}%</strong></li>
          </ul>
        </section>
      </div>

      {/* Footer */}
      <div className="border-t-2 border-gray-800 px-4 py-2 text-[10px] text-gray-500 flex items-center justify-between">
        <span>Distributed to Comp Leadership only. Shred after reading.</span>
        <span>⚽ TRIBEPICKS</span>
      </div>
    </div>
  )
}
