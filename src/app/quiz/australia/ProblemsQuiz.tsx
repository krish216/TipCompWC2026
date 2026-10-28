'use client'

import { useEffect, useState } from 'react'

type Answer = 'cost_of_living' | 'housing' | 'economy' | 'crime' | 'melbourne_cup'
type Tallies = { total: number; counts: Record<Answer, number> }

// Real Ipsos Issues Monitor figures (national, June 2026) — the joke is about the Cup, never
// about these, so each "wrong" reveal still states the real number.
const OPTIONS: { id: Answer; label: string; stat?: string }[] = [
  { id: 'cost_of_living', label: 'Cost of living', stat: '62%' },
  { id: 'housing',        label: 'Housing',        stat: '42%' },
  { id: 'economy',        label: 'The economy',    stat: '26%' },
  { id: 'crime',          label: 'Crime',          stat: '23%' },
  // No emoji: it'd make this the one option that looks different, and give the joke away.
  { id: 'melbourne_cup',  label: 'The Melbourne Cup' },
]

const VOTER_KEY = 'tp_mc_quiz_voter'
const ANSWER_KEY = 'tp_mc_quiz_answer'

function storage(): Storage | null {
  try { return window.localStorage } catch { return null }
}

// "What's the biggest problem facing Australia?" — until the jump (3pm AEDT, Tue 3 Nov) the
// only right answer is the race that stops a nation. After it, the Cup is wrong and the real
// #1, cost of living, is right — so the page stays sensible once the race is run.
export function ProblemsQuiz({ raceStartAt, src }: { raceStartAt: string; src?: string | null }) {
  const [picked, setPicked] = useState<Answer | null>(null)
  const [tallies, setTallies] = useState<Tallies | null>(null)
  const raceRun = Date.now() >= new Date(raceStartAt).getTime()
  const correct: Answer = raceRun ? 'cost_of_living' : 'melbourne_cup'

  // Coming back after answering → show their result again, with fresh totals.
  useEffect(() => {
    const prev = storage()?.getItem(ANSWER_KEY) as Answer | null
    if (prev && OPTIONS.some(o => o.id === prev)) {
      setPicked(prev)
      fetch('/api/sweep/quiz').then(r => r.json()).then(t => t.counts && setTallies(t)).catch(() => {})
    }
  }, [])

  async function choose(a: Answer) {
    if (picked) return
    setPicked(a)
    const s = storage()
    let voter = s?.getItem(VOTER_KEY) ?? null
    if (!voter) {
      voter = (crypto as any).randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
      s?.setItem(VOTER_KEY, voter!)
    }
    s?.setItem(ANSWER_KEY, a)
    const t = await fetch('/api/sweep/quiz', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voter_id: voter, answer: a }),
    }).then(r => r.json()).catch(() => null)
    if (t?.counts) setTallies(t)
  }

  const pickedOpt = OPTIONS.find(o => o.id === picked)
  const right = picked === correct

  let verdict = ''
  if (picked && !raceRun) {
    verdict = right
      ? "✅ Correct! Until 3pm on Tuesday, nothing else matters — the whole nation stops for one race."
      : `❌ Not today! ${pickedOpt?.label} is a real worry — ${pickedOpt?.stat} of Australians rank it a top issue — but until 3pm on Tuesday, the whole nation stops for one thing. 🐎`
  } else if (picked) {
    verdict = picked === 'melbourne_cup'
      ? "❌ The race is run! Back to reality — cost of living is the #1 issue for 62% of Australians."
      : right
        ? "✅ Correct — cost of living is the #1 issue, named by 62% of Australians."
        : `❌ Close — ${pickedOpt?.label} is a top issue for ${pickedOpt?.stat} of Australians, but cost of living leads at 62%.`
  }

  return (
    <div className="border border-gray-200 rounded-2xl p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Quick quiz</p>
      <h2 className="text-lg font-black text-gray-900 mt-0.5">What's the biggest problem facing Australia right now?</h2>

      <div className="mt-4 space-y-2">
        {OPTIONS.map(o => {
          const pct = tallies && tallies.total > 0 ? Math.round((tallies.counts[o.id] ?? 0) / tallies.total * 100) : null
          const isPicked = picked === o.id
          const isCorrect = picked && o.id === correct
          return (
            <button key={o.id} onClick={() => choose(o.id)} disabled={!!picked}
              className={`relative w-full overflow-hidden text-left text-sm font-semibold px-4 py-2.5 rounded-xl border transition-colors ${
                isCorrect ? 'border-emerald-400 text-emerald-900'
                  : isPicked ? 'border-red-300 text-red-800'
                  : picked ? 'border-gray-200 text-gray-500'
                  : 'border-gray-300 text-gray-800 hover:border-emerald-400 hover:bg-emerald-50'
              }`}>
              {/* Share of visitors, drawn behind the label once they've answered. */}
              {pct != null && (
                <span aria-hidden className={`absolute inset-y-0 left-0 ${isCorrect ? 'bg-emerald-100' : isPicked ? 'bg-red-50' : 'bg-gray-100'}`}
                  style={{ width: `${pct}%` }} />
              )}
              <span className="relative flex items-center justify-between gap-3">
                <span>{o.label}{isCorrect ? ' ✓' : ''}</span>
                {pct != null && <span className="text-xs font-bold tabular-nums">{pct}%</span>}
              </span>
            </button>
          )
        })}
      </div>

      {picked && (
        <div className="mt-4">
          <p className={`text-sm ${right ? 'text-emerald-800' : 'text-gray-700'}`}>{verdict}</p>
          {tallies && tallies.total > 0 && (
            <p className="text-[11px] text-gray-400 mt-1">Bars show what {tallies.total.toLocaleString()} visitor{tallies.total === 1 ? '' : 's'} picked.</p>
          )}
          {/* Tags any sign-up that came through the quiz (sweep_eoi.source): quiz, or
              quiz-<tag> when the quiz link itself carried ?src=<tag>. */}
          <a href={`/melbourne-cup?src=${src ? `quiz-${src}` : 'quiz'}#register`}
            className="block text-center mt-4 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4 py-2.5 rounded-lg">
            {raceRun ? 'See Melbourne Cup sweeps on TribePicks →' : '🐎 Get your Melbourne Cup sweep sorted →'}
          </a>
        </div>
      )}

      <p className="text-[11px] text-gray-400 mt-4">
        Real figures: share of Australians naming each as a top issue —{' '}
        <a href="https://www.ipsos.com/en-au/issues-monitor" target="_blank" rel="noreferrer" className="underline">Ipsos Issues Monitor</a>, June 2026.
      </p>
    </div>
  )
}
