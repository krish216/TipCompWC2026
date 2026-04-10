import { SCORING, type RoundId } from '@/types'

// Show each round as a separate row — tp (3rd place) and f (Final) have different scoring
const SCORING_ROWS: { rid: RoundId; label: string; badge?: string; highlight?: boolean }[] = [
  { rid: 'gs',  label: 'Group stage' },
  { rid: 'r32', label: 'Round of 32' },
  { rid: 'r16', label: 'Round of 16' },
  { rid: 'qf',  label: 'Quarter-finals' },
  { rid: 'sf',  label: 'Semi-finals' },
  { rid: 'tp',  label: '3rd place play-off', badge: '🥉' },
  { rid: 'f',   label: 'Final', badge: '🏆', highlight: true },
]

const FORMAT_STEPS = [
  { label: 'Group stage',     detail: '72 matches · 12 groups of 4 · Top 2 + 8 best 3rd-place teams advance' },
  { label: 'Round of 32',    detail: '16 matches · 32 teams remaining · Single elimination begins' },
  { label: 'Round of 16',    detail: '8 matches · One result separates 16 teams from the quarter-finals' },
  { label: 'Quarter-finals', detail: '4 matches · The last 8 fight for a semi-final place' },
  { label: 'Semi-finals',    detail: '2 matches · Four teams, two spots in the final' },
  { label: '3rd place play-off', detail: '1 match · Bronze medal · Miami, Jul 18, 2026' },
  { label: 'Final',          detail: '1 match · MetLife Stadium, New York/NJ · Jul 19, 2026' },
]

const FAQS = [
  { q: 'When do predictions lock?', a: '5 minutes before each match kicks off. You can edit predictions right up until that point.' },
  { q: "What if I haven't entered a prediction?", a: 'Unpredicted matches earn 0 points regardless of the result. There is no default — blank means 0.' },
  { q: 'Do knockout matches count more?', a: 'Yes — points increase with every round. A correct result in the final is worth 25 pts vs 3 pts in the group stage. Note: the 3rd place play-off has lower points than the semi-finals.' },
  { q: 'How does the favourite team bonus work?', a: 'Pick a favourite team at registration or in Settings. You earn double points on any match involving that team in the Group Stage and Round of 32 only. For example, a correct result in the group stage earns 6 pts instead of 3, and an exact score earns 10 pts instead of 5.' },
  { q: 'Can I change my favourite team?', a: 'Yes — go to Settings and update your favourite team at any time. The new team applies to all unscored matches going forward.' },
  { q: 'How are leaderboard ties broken?', a: 'Tied players are ranked by exact score count, then correct result count, then alphabetically.' },
  { q: 'Can I see the leaderboard after each round?', a: 'Yes — the Leaderboard page has snapshot views showing standings after the Group Stage, Rd of 32, Rd of 16, Quarters, Semis, and Finals.' },
  { q: 'Can I be in multiple tribes?', a: 'No — you can only belong to one tribe at a time. Leave your current tribe to join another.' },
  { q: 'What happens to my tribe after the tournament?', a: "Tribes persist for future competitions. We'll add Premier League, Champions League and more after the World Cup." },
]

export default function RulesPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-lg font-semibold text-gray-900 mb-1">How to play</h1>
      <p className="text-sm text-gray-500 mb-6">
        Predict every match of the 2026 FIFA World Cup. Earn points for correct results and exact scores.
        Pick a favourite team for double points. Compete with your tribe across all 7 rounds.
      </p>

      {/* Scoring table */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Points by round</h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-[1fr_72px_72px_80px] text-[10px] font-semibold text-gray-500 uppercase tracking-wide px-4 py-2 bg-gray-50 border-b border-gray-200">
            <span>Round</span>
            <div className="text-right leading-tight">
              <span className="text-purple-600">★</span><br/>
              <span>Exact</span>
            </div>
            <div className="text-right leading-tight">
              <span className="text-blue-600">✓</span><br/>
              <span>Result</span>
            </div>
            <div className="text-right leading-tight">
              <span className="text-amber-600">🥅</span><br/>
              <span>Draw+pens</span>
            </div>
          </div>
          {SCORING_ROWS.map(({ rid, label, badge, highlight }, i) => {
            const sc = SCORING[rid]
            const isKnockout = ['r32','r16','qf','sf','tp','f'].includes(rid)
            return (
              <div key={rid} className={`grid grid-cols-[1fr_72px_72px_80px] px-4 py-3 border-b border-gray-100 last:border-0 ${highlight ? 'bg-amber-50' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800">{label}</span>
                  {badge && <span className="text-[11px] font-medium px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded">{badge}</span>}
                  {isKnockout && <span className="text-[10px] font-medium px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded">🥅 pens</span>}
                </div>
                <div className="text-right"><span className="text-sm font-semibold text-purple-700">★ {sc.exact}</span></div>
                <div className="text-right"><span className="text-sm font-semibold text-blue-700">✓ {sc.result}</span></div>
                <div className="text-right">
                  {isKnockout
                    ? <span className="text-sm font-semibold text-amber-600">🥅 {sc.exact}</span>
                    : <span className="text-sm text-gray-300">—</span>
                  }
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-3 flex gap-3 flex-wrap text-xs text-gray-500">
          <span><span className="font-medium text-purple-700">★ Exact</span> — correct scoreline</span>
          <span><span className="font-medium text-blue-700">✓ Result</span> — right outcome, wrong score</span>
          <span><span className="font-medium text-amber-600">🥅 Draw + pens ✓</span> — predicted draw + correct penalty winner</span>
          <span><span className="font-medium text-gray-500">✗ Wrong</span> — 0 pts</span>
        </div>
        <p className="text-xs text-gray-400 mt-2">Note: the 3rd place play-off (🥉) has lower points than the semi-finals — it is a consolation match.</p>
      </section>

      {/* Penalty shootout scoring */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Penalty shootout 🥅</h2>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm text-gray-700 mb-3">
            In all knockout rounds (Round of 32, Round of 16, Quarter-finals, Semi-finals, 3rd place play-off and Final), matches cannot end in a draw.
            If you predict an equal scoreline, you must also pick which team wins on penalties.
          </p>
          <div className="space-y-2 mb-3">
            {[
              { scenario: 'Predict 1–1, pick correct penalty winner', result: 'Exact score points', pts: true },
              { scenario: 'Predict 1–1, pick wrong penalty winner',   result: 'Correct result points only', pts: false },
              { scenario: 'Predict 1–1, actual result is 2–1',        result: '0 points', pts: false },
            ].map(ex => (
              <div key={ex.scenario} className="flex items-start gap-3 bg-white rounded-lg border border-blue-100 px-3 py-2">
                <span className="text-base flex-shrink-0">{ex.pts ? '✅' : '➖'}</span>
                <div>
                  <p className="text-xs font-medium text-gray-800">{ex.scenario}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{ex.result}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500">
            The penalty pick appears automatically on the predict page when you enter an equal score for a knockout fixture.
          </p>
        </div>
      </section>

      {/* Favourite team bonus */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Favourite team bonus ⭐</h2>
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <p className="text-sm text-gray-700 mb-1">Pick one team as your favourite at registration or in Settings. You earn <strong className="text-purple-700">double points</strong> on any match involving your team — but only in the <strong>Group Stage</strong> and <strong>Round of 32</strong>.</p>
          <p className="text-xs text-gray-500 mb-3">The bonus does not apply from the Round of 16 onwards.</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Group stage correct result', normal: 3, bonus: 6  },
              { label: 'Group stage exact score',    normal: 5, bonus: 10 },
              { label: 'Round of 32 correct result', normal: 5, bonus: 10 },
              { label: 'Round of 32 exact score',    normal: 8, bonus: 16 },
            ].map(ex => (
              <div key={ex.label} className="bg-white rounded-lg border border-purple-100 p-3">
                <p className="text-[11px] text-gray-500 mb-1.5">{ex.label}</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm line-through text-gray-400">{ex.normal}pts</span>
                  <span className="text-sm font-bold text-purple-700">{ex.bonus}pts ⭐</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-3">You can change your favourite team in Settings at any time — the bonus applies from the next unscored match.</p>
        </div>
      </section>

      {/* Tournament format */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Tournament format</h2>
        <div className="relative">
          <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-gray-200" />
          {FORMAT_STEPS.map((step, i) => (
            <div key={step.label} className="relative flex gap-3 mb-4 last:mb-0">
              <div className="w-8 h-8 rounded-full bg-white border-2 border-green-500 flex items-center justify-center text-[10px] font-bold text-green-700 flex-shrink-0 z-10">{i+1}</div>
              <div className="pt-1">
                <p className="text-sm font-medium text-gray-800">{step.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{step.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Tribes */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Tribes</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          {[
            { icon:'🔗', text:'Join a tribe using your organisation\'s invite code — or enter a tribe code directly' },
            { icon:'🏆', text:'Your tribe has its own private leaderboard updated in real time' },
            { icon:'💬', text:'Chat with your tribe — trash talk, predictions, and reactions' },
            { icon:'⭐', text:'Favourite team bonuses apply in tribe leaderboards too — use them wisely' },
          ].map(item => (
            <div key={item.icon} className="flex gap-3 items-start">
              <span className="text-base flex-shrink-0">{item.icon}</span>
              <p className="text-sm text-gray-600">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">FAQ</h2>
        <div className="space-y-3">
          {FAQS.map(faq => (
            <div key={faq.q} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm font-medium text-gray-800 mb-1">{faq.q}</p>
              <p className="text-sm text-gray-500">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
