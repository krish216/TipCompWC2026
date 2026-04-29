import { type RoundId, getDefaultScoringConfig } from '@/types'

// Show each round as a separate row — tp (3rd place) and f (Final) have different scoring
const SCORING_ROWS: { rid: RoundId; label: string; badge?: string; highlight?: boolean }[] = [
  { rid: 'gs1',  label: 'Group stage' },
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
  { q: 'When do predictions lock?', a: '5 minutes before the first match in the round kicks off. You can edit predictions right up until that point.' },
  { q: "What if I haven't entered a prediction?", a: 'Unpredicted matches earn 0 points regardless of the result. There is no default — blank means 0.' },
  { q: 'Do knockout matches count more?', a: 'Yes — points increase with every round. A correct result in the final is worth 25 pts vs 3 pts in the group stage. Note: the 3rd place play-off has lower points than the semi-finals.' },
  { q: 'How does the Bonus Points team work?', a: 'Pick a Bonus Points team on the My Tips page. You earn double base points on any match involving that team in the Group Stage only. For example, a correct result (Home/Draw/Away) in the Group Stage earns 6 pts instead of 3.' },
  { q: 'What happens if the Bonus Points team I picked lost?', a: 'You earn double points if you pick the correct result regardless of whether your Bonus Team wins, draws or loses.' },
  { q: 'Can I change my Bonus Points team?', a: 'Yes — go to My Tips and update your Bonus Points team at any time before the tournament kicks off. The new team applies to all unscored matches going forward.' },
  { q: 'How are leaderboard ties broken?', a: 'Tied players are ranked by bonus score count, then base points earned, then alphabetically.' },
  { q: 'Can I see the leaderboard after each round?', a: 'Yes — the Leaderboard page has snapshot views showing standings after the Group Stage, Rd of 32, Rd of 16, Quarters, Semis, and Finals.' },
  { q: 'Can I be in multiple tribes?', a: 'No — you can only belong to one tribe at a time. Leave your current tribe to join another.' },
  { q: 'What happens to my tribe after the tournament?', a: "Tribes persist for future competitions. We'll add Premier League, Champions League and more after the World Cup." },
]

export default function RulesPage() {
  const scoringConfig = getDefaultScoringConfig()
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-lg font-semibold text-gray-900 mb-1">How to play</h1>
      <p className="text-sm text-gray-500 mb-6">
        Pick the winner or draw for every group stage and knockout match. For the Semi-finals, 3rd place play-off and Final, predict the exact score (for a bonus).
        Earn more points in later rounds. Pick a Bonus Points team for double base points in the Group Stage only.
      </p>

      {/* Scoring table */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Points by round</h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-[1fr_70px_64px_80px] text-[10px] font-semibold text-gray-500 uppercase tracking-wide px-4 py-2 bg-gray-50 border-b border-gray-200">
            <span>Round</span>
            <div className="text-center leading-tight"><span>Pick type</span></div>
            <div className="text-right leading-tight"><span className="text-green-700">Base</span><br/><span>pts</span></div>
            <div className="text-right leading-tight"><span className="text-amber-600">⚡</span><br/><span>Bonus pts</span></div>
          </div>
          {SCORING_ROWS.map(({ rid, label, badge, highlight }) => {
            // Drive display entirely from scoringConfig so it stays in sync with DB
            const sc          = scoringConfig?.rounds[rid]
            const isScore     = sc?.predict_mode === 'score'
            const exactBonus  = sc?.exact_bonus  ?? 0
            const penBonus    = sc?.pen_bonus     ?? 0
            const favBonus    = sc?.fav_team_2x   ?? false
            const hasBonus    = exactBonus > 0 || penBonus > 0 || favBonus
            return (
              <div key={rid} className={`grid grid-cols-[1fr_70px_64px_80px] px-4 py-3 border-b border-gray-100 last:border-0 ${highlight ? 'bg-amber-50' : ''}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-800">{label}</span>
                  {badge && <span className="text-[11px] font-medium px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded">{badge}</span>}
                </div>
                <div className="text-center">
                  <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${isScore ? 'bg-purple-100 text-purple-700' : 'bg-blue-50 text-blue-600'}`}>
                    {isScore ? 'Score' : '1/X/2'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold text-green-700">{sc?.result_pts ?? 0}</span>
                </div>
                <div className="text-right text-[11px] space-y-0.5">
                  {favBonus    && <div className="text-purple-600 font-semibold">2× ⭐ bonus team</div>}
                  {exactBonus > 0 && <div className="text-purple-600 font-semibold">+{exactBonus} exact score</div>}
                  {penBonus   > 0 && <div className="text-amber-600 font-medium">+{penBonus} correct pens</div>}
                  {!hasBonus      && <span className="text-gray-300">—</span>}
                </div>
              </div>
            )
          })}
        </div>r
        <div className="mt-3 flex gap-3 flex-wrap text-xs text-gray-500">
          <span><span className="font-medium text-blue-600">1/X/2</span> — Pick home win (1), draw (X), or away win (2)</span>
          <span><span className="font-medium text-green-700">Base pts</span> — points earned for a correct result prediction</span>
          <span><span className="font-medium text-purple-700">+Bonus</span> — extra pts for exact score, penalties &amp; Bonus Points team</span>
          <span><span className="font-medium text-gray-500">✗ Wrong</span> — 0 pts</span>
        </div>
        <p className="text-xs text-gray-400 mt-2">Semi-finals, 3rd place play-off and Final require a bonus score prediction. All other rounds use 1/X/2 outcome only.</p>
      </section>

      {/* Penalty shootout scoring */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Penalty shootout 🥅</h2>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm text-gray-700 mb-3">
            In all knockout rounds (Round of 32 onwards), matches cannot end in a draw. A penalty shootout winner must be picked for Semi-finals, 3rd Place play-off and Final when predicting a draw score.
            If you predict an equal scoreline, you must also pick which team wins on penalties.
          </p>
          <div className="space-y-2 mb-3">
            {[
              { scenario: 'Predict 1–1, pick correct penalty winner', result: 'Bonus score points', pts: true },
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
            The penalty pick appears automatically on the predict page when you enter an equal score for any knockout fixture (Round of 16 onwards).
          </p>
        </div>
      </section>

      {/* Bonus Points team bonus */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Bonus Points team ⭐</h2>
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <p className="text-sm text-gray-700 mb-1">Pick one team on the My Tips page. You earn <strong className="text-purple-700">double base points</strong> on any match involving your team when you tip the right result (H/D/A) — but only in the <strong>Group Stage</strong>.</p>
          <p className="text-xs text-gray-500 mb-3">The bonus does not apply from the Round of 32 onwards.</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Group stage correct result', normal: 3, bonus: 6  },
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
          <p className="text-xs text-gray-500 mt-3">You can change your Bonus Points team on the My Tips page at any time before the tournament starts.</p>
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
            { icon:'🔗', text:'Join a tribe from the My Tribe page' },
            { icon:'🏆', text:'Your tribe has its own private leaderboard updated in real time' },
            { icon:'💬', text:'Chat with your tribe — trash talk, predictions, and reactions' },
            { icon:'⭐', text:'Bonus Points team double points apply in tribe leaderboards too — use them wisely' },
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
