import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'
import { resolveBracketChallenge, challengeClosesAt, ensureGlobalEntry } from '@/lib/bracket/challenge'
import { sendEntryConfirmation } from '@/lib/bracket/entry-confirmation'
import { resolveActiveCampaign } from '@/lib/sponsors/resolver'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

async function hasChampion(admin: any, userId: string, tid: string): Promise<boolean> {
  const { data } = await admin.from('bracket_picks')
    .select('team_name').eq('user_id', userId).eq('tournament_id', tid).eq('slot_key', 'final')
    .not('team_name', 'is', null).maybeSingle()
  return !!data
}

// GET /api/bracket/enter?challenge=<slug> — the caller's entry status for one
// challenge (drives the Enter CTA). No ?challenge → the default bracket challenge.
export async function GET(request: NextRequest) {
  const user = await getSessionUser().catch(() => null)
  const admin = createAdminClient()
  const slug = new URL(request.url).searchParams.get('challenge')
  const challenge = await resolveBracketChallenge(admin, { slug })
  if (!challenge) return NextResponse.json({ available: false, logged_in: !!user })

  const tid = challenge.tournament_id
  const closes_at = await challengeClosesAt(admin, challenge)
  const locked = closes_at ? Date.now() >= new Date(closes_at).getTime() : false
  const challengeInfo = { slug: challenge.slug, name: challenge.name }

  if (!user) return NextResponse.json({ available: true, logged_in: false, closes_at, locked, challenge: challengeInfo })

  const has_bracket = await hasChampion(admin, user.id, tid)

  // Entry row — gracefully report unavailable if the table isn't migrated yet.
  let entry: any = null, available = true
  const { data, error } = await admin.from('bracket_entries')
    .select('final_goals, tp_goals, phone, postcode, consent_marketing, entered_at')
    .eq('user_id', user.id).eq('challenge_id', challenge.id).maybeSingle()
  if (error) available = false
  else entry = data

  return NextResponse.json({
    available, logged_in: true, has_bracket, entered: !!entry, entry, closes_at, locked, challenge: challengeInfo,
  })
}

// POST /api/bracket/enter — member enters one challenge's prize comp.
// Body: { final_goals, tp_goals, consent_terms, consent_marketing, phone?, challenge? }
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Sign in to enter' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const finalGoals = Number(body.final_goals)
  const tpGoals    = Number(body.tp_goals)
  if (body.consent_terms !== true) return NextResponse.json({ error: 'Please accept the terms to enter.' }, { status: 400 })
  if (body.consent_marketing !== true) return NextResponse.json({ error: 'You must agree to share your details with the prize sponsor to enter.' }, { status: 400 })
  if (!Number.isInteger(finalGoals) || finalGoals < 0 || finalGoals > 20 ||
      !Number.isInteger(tpGoals)    || tpGoals    < 0 || tpGoals    > 20)
    return NextResponse.json({ error: 'Enter your tie-break goal totals (0–20).' }, { status: 422 })

  const admin = createAdminClient()
  // `challenge` may be a slug (current UI) or, for replayed legacy entries, absent
  // → the default bracket challenge. (`tournament_id` in old stashes is ignored;
  // the challenge carries its own tournament.)
  const challenge = await resolveBracketChallenge(admin, { slug: body.challenge ?? null })
  if (!challenge) return NextResponse.json({ error: 'No active bracket challenge' }, { status: 400 })
  const tid = challenge.tournament_id

  const closes_at = await challengeClosesAt(admin, challenge)
  if (closes_at && Date.now() >= new Date(closes_at).getTime())
    return NextResponse.json({ error: 'Entries are closed for this challenge.' }, { status: 409 })

  if (!(await hasChampion(admin, user.id, tid)))
    return NextResponse.json({ error: 'Complete your bracket (pick a champion) before entering.' }, { status: 400 })

  // Sponsored (prize) challenges capture the entrant's postcode — lead data for the
  // sponsor, covered by the marketing consent. Required for those; never for generic
  // challenges. Resolve once and reuse for the confirmation email below.
  const sponsorCfg = await resolveActiveCampaign(admin, { challengeType: 'bracket', challengeId: challenge.id })
  const hasPrize = !!(sponsorCfg.enabled && sponsorCfg.prize)
  const postcode = typeof body.postcode === 'string' ? body.postcode.trim() : ''
  if (hasPrize && !/^\d{4}$/.test(postcode))
    return NextResponse.json({ error: 'Enter your 4-digit postcode to go in the prize draw.' }, { status: 422 })
  // AU prize promotions require entrants to be 18+.
  if (hasPrize && body.consent_over18 !== true)
    return NextResponse.json({ error: 'You must confirm you are 18 or older to enter the prize draw.' }, { status: 422 })

  // First entry vs edit — drives the one-time confirmation email below.
  const { data: prior } = await admin.from('bracket_entries')
    .select('user_id').eq('user_id', user.id).eq('challenge_id', challenge.id).maybeSingle()
  const isNewEntry = !prior

  const { error } = await (admin.from('bracket_entries') as any).upsert({
    user_id:           user.id,
    tournament_id:     tid,
    challenge_id:      challenge.id,
    final_goals:       finalGoals,
    tp_goals:          tpGoals,
    phone:             typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null,
    postcode:          postcode || null,
    consent_terms:     true,
    consent_marketing: body.consent_marketing === true,
    consent_over18:    body.consent_over18 === true,
    source:            'member',
    updated_at:        new Date().toISOString(),
  }, { onConflict: 'user_id,challenge_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // "Global = everyone" — entering any sponsor challenge also enrols you in the
  // tournament's Global board (if you're not already in), reusing this bracket.
  await ensureGlobalEntry(admin, {
    userId: user.id, tournamentId: tid, enteredChallengeId: challenge.id,
    finalGoals, tpGoals,
    phone: typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null,
    postcode: postcode || null,
    consentMarketing: body.consent_marketing === true,
  })

  // Branded "you're entered" confirmation — first entry only, and only when a
  // prize is on the line. A logged-in member entering the no-prize Global already
  // saw the in-app confirmation, so an email there is just noise; for a prize
  // (sponsored) challenge it's a useful "you're in the draw to win X" receipt.
  if (isNewEntry) {
    if (sponsorCfg.enabled && sponsorCfg.prize) {
      const origin = new URL(request.url).origin
      const { data: profile } = await admin.from('users').select('email, display_name').eq('id', user.id).maybeSingle()
      const email = (profile as any)?.email
      if (email) {
        sendEntryConfirmation(admin, {
          email, name: (profile as any)?.display_name ?? null,
          challenge: { id: challenge.id, slug: challenge.slug, name: challenge.name },
          closesAt: closes_at, origin, userId: user.id, tournamentId: tid,
        }).catch(() => {})
      }
    }
  }

  return NextResponse.json({ ok: true, challenge: { slug: challenge.slug, name: challenge.name } })
}

// DELETE /api/bracket/enter?challenge=<slug> — caller withdraws from the draw.
// Removes their own entry for this challenge (and the consent to share details);
// their bracket picks are kept. Allowed any time — it's the user's own data.
export async function DELETE(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Sign in to manage your entry' }, { status: 401 })

  const admin = createAdminClient()
  const slug = new URL(request.url).searchParams.get('challenge')
  const challenge = await resolveBracketChallenge(admin, { slug })
  if (!challenge) return NextResponse.json({ error: 'No active bracket challenge' }, { status: 400 })

  const { error } = await (admin.from('bracket_entries') as any)
    .delete().eq('user_id', user.id).eq('challenge_id', challenge.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
