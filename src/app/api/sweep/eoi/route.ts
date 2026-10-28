import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const EoiSchema = z.object({
  tournament_id: z.string().uuid(),
  intent:        z.enum(['organise', 'join']),
  name:          z.string().trim().min(1).max(80),
  email:         z.string().trim().toLowerCase().email().max(120),
  organisation:  z.string().trim().max(120).optional(),
  group_size:    z.number().int().min(1).max(10000).optional(),
  pools:         z.number().int().min(1).max(5).optional(),
  tickets:       z.number().int().min(1).max(24).optional(),
  notes:         z.string().trim().max(500).optional(),
  source:        z.string().trim().max(60).optional(),
  website:       z.string().optional(),   // honeypot — real people never see it
})

// POST /api/sweep/eoi — public. Records an expression of interest from /melbourne-cup
// (migration 197). Upserts on (tournament, intent, email) so a resubmit updates rather
// than duplicates. Signed-in callers get their user_id attached.
export async function POST(request: NextRequest) {
  const parsed = EoiSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Please add your name and a valid email.' }, { status: 400 })
  }
  const d = parsed.data
  // Bots fill every field; pretend it worked so they don't retry.
  if (d.website) return NextResponse.json({ ok: true })

  const admin = createAdminClient()
  const { data: tourn } = await (admin.from('tournaments') as any)
    .select('id, format').eq('id', d.tournament_id).maybeSingle()
  if ((tourn as any)?.format !== 'sweep') return NextResponse.json({ error: 'Unknown sweep' }, { status: 400 })

  const user = await getSessionUser().catch(() => null)
  const organise = d.intent === 'organise'
  const { error } = await (admin.from('sweep_eoi') as any).upsert({
    tournament_id: d.tournament_id,
    intent:        d.intent,
    name:          d.name,
    email:         d.email,
    organisation:  organise ? d.organisation || null : null,
    group_size:    organise ? d.group_size ?? null : null,
    pools:         organise ? d.pools ?? null : null,
    tickets:       organise ? null : d.tickets ?? null,
    notes:         d.notes || null,
    user_id:       user?.id ?? null,
    source:        d.source || null,
    updated_at:    new Date().toISOString(),
  }, { onConflict: 'tournament_id,intent,email' })
  if (error) {
    console.error('[sweep/eoi] upsert failed:', error)
    return NextResponse.json({ error: 'Something went wrong — please try again.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
