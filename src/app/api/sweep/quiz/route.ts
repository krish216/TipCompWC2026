import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const QUIZ = 'mc2026-problems'
const ANSWERS = ['cost_of_living', 'housing', 'economy', 'crime', 'melbourne_cup'] as const

const VoteSchema = z.object({
  voter_id: z.string().trim().min(8).max(64),
  answer:   z.enum(ANSWERS),
})

// Share of all votes per answer — the only thing this route ever reveals.
async function tallies(admin: any) {
  const { data } = await (admin.from('sweep_quiz_votes') as any).select('answer').eq('quiz', QUIZ)
  const counts: Record<string, number> = Object.fromEntries(ANSWERS.map(a => [a, 0]))
  for (const r of (data ?? []) as any[]) counts[r.answer] = (counts[r.answer] ?? 0) + 1
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  return { total, counts }
}

// GET /api/sweep/quiz — totals for the /melbourne-cup quiz (migration 198).
export async function GET() {
  return NextResponse.json(await tallies(createAdminClient()))
}

// POST /api/sweep/quiz — public. Body { voter_id, answer }. One vote per browser (voter_id is
// a random localStorage id); a repeat is ignored. Returns the updated totals.
export async function POST(request: NextRequest) {
  const parsed = VoteSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid vote' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await (admin.from('sweep_quiz_votes') as any).upsert(
    { quiz: QUIZ, voter_id: parsed.data.voter_id, answer: parsed.data.answer },
    { onConflict: 'quiz,voter_id', ignoreDuplicates: true },
  )
  if (error) {
    console.error('[sweep/quiz] vote failed:', error)
    return NextResponse.json({ error: 'Could not save your answer' }, { status: 500 })
  }
  return NextResponse.json(await tallies(admin))
}
