import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { resolveBracketChallenge, challengeClosesAt, ensureGlobalEntry } from '@/lib/bracket/challenge'
import { sendBracketClaimEmail } from '@/lib/bracket/guest-claim-email'
import { sendEntryConfirmation } from '@/lib/bracket/entry-confirmation'
import { establishSessionFor } from '@/lib/bracket/establish-session'
import { resolveActiveCampaign } from '@/lib/sponsors/resolver'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Phase 3 — guest → account conversion funnel for the Bracket Challenge.
//
// A guest fills a bracket (held in this browser's localStorage), verifies their
// email with a 6-digit code, then enters with name + consent. Because the code
// proves email ownership, we can finish the whole thing in one request — no
// "claim your account" round-trip:
//   1. Find-or-create the account (new accounts are created email-verified).
//      Existing accounts: we never touch their password or profile, and we keep
//      their existing bracket if they already have one.
//   2. Persist the bracket + the prize entry.
//   3. Sign them into THIS browser (mint+redeem a magic-link token server-side)
//      so they finish as a real logged-in user, and email a plain confirmation.
//   If the session can't be established for any reason, we fall back to emailing
//   a branded sign-in link so the user is never locked out.

const SLOT_RE = /^(grp:[A-L]:[123]|third:[A-L]|r32:(1[0-6]|[1-9])|r16:[1-8]|qf:[1-4]|sf:[12]|final|tp)$/

async function activeTournamentId(admin: any): Promise<string | null> {
  const { data } = await admin.from('tournaments').select('id').eq('is_active', true).maybeSingle()
  return (data as any)?.id ?? null
}


export async function POST(request: NextRequest) {
  const origin = new URL(request.url).origin
  const body = await request.json().catch(() => ({} as any))

  // ── Validate the form ──────────────────────────────────────────────────────
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })

  const displayName = typeof body.name === 'string' ? body.name.trim() : ''
  if (displayName.length < 2)
    return NextResponse.json({ error: 'Enter your name.' }, { status: 400 })

  if (body.consent_terms !== true)
    return NextResponse.json({ error: 'Please accept the terms to enter.' }, { status: 400 })
  if (body.consent_marketing !== true)
    return NextResponse.json({ error: 'You must agree to share your details with the prize sponsor to enter.' }, { status: 400 })

  const finalGoals = Number(body.final_goals)
  const tpGoals    = Number(body.tp_goals)
  if (!Number.isInteger(finalGoals) || finalGoals < 0 || finalGoals > 20 ||
      !Number.isInteger(tpGoals)    || tpGoals    < 0 || tpGoals    > 20)
    return NextResponse.json({ error: 'Enter your tie-break goal totals (0–20).' }, { status: 422 })

  // The guest's bracket, slot_key → team_name (from localStorage). Must include a champion.
  const rawPicks = (body.picks && typeof body.picks === 'object') ? body.picks as Record<string, unknown> : {}
  const champion = typeof rawPicks['final'] === 'string' ? (rawPicks['final'] as string) : null
  if (!champion)
    return NextResponse.json({ error: 'Complete your bracket (pick a champion) before entering.' }, { status: 400 })

  const admin = createAdminClient()

  // ── Verify the emailed code before doing anything (only verified emails enter) ─
  const code = typeof body.code === 'string' ? body.code.trim() : ''
  const { data: codeRow } = await (admin.from('email_codes') as any).select('code, expires_at, attempts').eq('email', email).maybeSingle()
  if (!codeRow) return NextResponse.json({ error: 'Request a verification code first.' }, { status: 400 })
  if (new Date((codeRow as any).expires_at).getTime() < Date.now())
    return NextResponse.json({ error: 'Your code expired — request a new one.' }, { status: 400 })
  if ((codeRow as any).attempts >= 5)
    return NextResponse.json({ error: 'Too many tries — request a new code.' }, { status: 429 })
  if (!code || code !== (codeRow as any).code) {
    await (admin.from('email_codes') as any).update({ attempts: ((codeRow as any).attempts ?? 0) + 1 }).eq('email', email)
    return NextResponse.json({ error: 'That code isn’t right — check your email and try again.' }, { status: 401 })
  }
  // Verified — consume the code so it can't be reused.
  await (admin.from('email_codes') as any).delete().eq('email', email)

  // The challenge being entered: a slug (current UI) or the default bracket
  // challenge for the (hinted) tournament. The challenge carries the tournament.
  const tournamentHint = typeof body.tournament_id === 'string' && body.tournament_id ? body.tournament_id : null
  const challenge = await resolveBracketChallenge(admin, { slug: body.challenge ?? null, tournamentId: tournamentHint })
  const tid = challenge?.tournament_id ?? tournamentHint ?? await activeTournamentId(admin)
  if (!tid) return NextResponse.json({ error: 'No active tournament' }, { status: 400 })
  if (!challenge) return NextResponse.json({ error: 'No active bracket challenge' }, { status: 400 })

  const closes_at = challenge ? await challengeClosesAt(admin, challenge) : null
  if (closes_at && Date.now() >= new Date(closes_at).getTime())
    return NextResponse.json({ error: 'Entries are closed — the knockouts have started.' }, { status: 409 })

  // Only call it a "prize draw" when a sponsor with a live prize is attached.
  const sponsorCfg = await resolveActiveCampaign(admin, { challengeType: 'bracket', challengeId: challenge.id })
  const hasPrize = !!(sponsorCfg.enabled && sponsorCfg.prize)
  const inLine = hasPrize ? 'You’re in the draw!' : 'You’re entered!'

  // Sponsored (prize) challenges capture the entrant's postcode (lead data for the
  // sponsor, per the marketing consent). Required for those; never for generic ones.
  const postcode = typeof body.postcode === 'string' ? body.postcode.trim() : ''
  if (hasPrize && !/^\d{4}$/.test(postcode))
    return NextResponse.json({ error: 'Enter your 4-digit postcode to go in the prize draw.' }, { status: 422 })

  const now = new Date().toISOString()

  // ── Resolve the account ─────────────────────────────────────────────────────
  // The 6-digit code already proved the user owns this email, so we're authorised
  // to act on the account whether it's new or existing (email ownership = a valid
  // passwordless login). Existing accounts: we NEVER touch their password or
  // profile — only add their entry.
  const { data: existing } = await admin.from('users').select('id').ilike('email', email).maybeSingle()
  const isExisting = !!existing
  let userId = (existing as any)?.id as string | undefined

  if (!userId) {
    // New account — created already email-verified (the code is the proof).
    const { data: created, error: createErr } = await (admin.auth.admin as any).createUser({
      email,
      email_confirm: true,
      user_metadata: { display_name: displayName, signup_flow: 'bracket_guest' },
    })
    if (createErr || !created?.user?.id) {
      // Race: someone created the account between our lookup and now → treat as existing.
      if ((createErr?.message ?? '').toLowerCase().includes('already')) {
        const { data: raced } = await admin.from('users').select('id').ilike('email', email).maybeSingle()
        userId = (raced as any)?.id
      }
      if (!userId)
        return NextResponse.json({ error: 'Could not create your account — please try again.' }, { status: 500 })
    } else {
      userId = created.user.id as string
      // Profile row — only on creation, so we never overwrite a returning user's data.
      await (admin.from('users') as any).upsert({
        id:                  userId,
        email,
        display_name:        displayName,
        first_name:          typeof body.first_name === 'string' && body.first_name.trim() ? body.first_name.trim() : null,
        timezone:            typeof body.timezone === 'string' && body.timezone ? body.timezone : 'UTC',
        onboarding_complete: false,
        email_verified:      true,
        role:                'tipster',
        signup_flow:         'bracket_guest',
        ...(typeof body.source === 'string' && body.source ? { ref_source: body.source } : {}),
      }, { onConflict: 'id', ignoreDuplicates: false })
    }
  }

  // ── Persist the bracket ─────────────────────────────────────────────────────
  // For a returning user who already has a bracket for this tournament, keep
  // theirs (don't clobber a carefully-built bracket with this device's guest one).
  // Otherwise save the bracket they just built.
  let hasExistingBracket = false
  let existingChampion: string | null = null
  if (isExisting) {
    const { count } = await admin.from('bracket_picks')
      .select('slot_key', { count: 'exact', head: true })
      .eq('user_id', userId).eq('tournament_id', tid)
    hasExistingBracket = (count ?? 0) > 0
    if (hasExistingBracket) {
      const { data: f } = await admin.from('bracket_picks')
        .select('team_name').eq('user_id', userId).eq('tournament_id', tid).eq('slot_key', 'final').maybeSingle()
      existingChampion = (f as any)?.team_name ?? null
    }
  }
  // The account already has a DIFFERENT bracket than the one just built → land them
  // on /bracket so they can choose which to keep, instead of the leaderboard.
  const bracketConflict = !!(hasExistingBracket && existingChampion && champion && existingChampion !== champion)
  if (!hasExistingBracket) {
    const pickRows = Object.entries(rawPicks)
      .filter(([slot, team]) => SLOT_RE.test(slot) && typeof team === 'string' && team)
      .map(([slot_key, team_name]) => ({ user_id: userId!, tournament_id: tid, slot_key, team_name, updated_at: now }))
    if (pickRows.length)
      await (admin.from('bracket_picks') as any).upsert(pickRows, { onConflict: 'user_id,tournament_id,slot_key' })
  }

  // ── The prize entry ─────────────────────────────────────────────────────────
  const { error: entryErr } = await (admin.from('bracket_entries') as any).upsert({
    user_id:           userId!,
    tournament_id:     tid,
    challenge_id:      challenge.id,
    final_goals:       finalGoals,
    tp_goals:          tpGoals,
    phone:             typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null,
    postcode:          postcode || null,
    consent_terms:     true,
    consent_marketing: true,
    source:            'guest',
    updated_at:        now,
  }, { onConflict: 'user_id,challenge_id' })
  if (entryErr) return NextResponse.json({ error: entryErr.message }, { status: 500 })

  // "Global = everyone" — a guest entering a sponsor challenge also lands on the
  // tournament's Global board (if not already in), reusing this bracket.
  await ensureGlobalEntry(admin, {
    userId: userId!, tournamentId: tid, enteredChallengeId: challenge.id,
    finalGoals, tpGoals,
    phone: typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null,
    consentMarketing: true,
  })

  // Funnel analytics row (best-effort) — attribute the champion/runner-up capture.
  if (typeof body.session_id === 'string' && body.session_id) {
    await (admin.from('bracket_predictions') as any).upsert({
      user_id:       userId!,
      session_id:    body.session_id,
      tournament_id: tid,
      champion,
      runner_up:     typeof body.runner_up === 'string' ? body.runner_up : null,
      source:        typeof body.source === 'string' ? body.source : null,
      device:        typeof body.device === 'string' ? body.device : null,
      updated_at:    now,
    }, { onConflict: 'user_id,tournament_id' }).then(() => {}, () => {})
  }

  // Enrol in the tournament so they're a fully tracked player (fire-and-forget).
  fetch(`${origin}/api/user-tournaments/enrol`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, tournament_id: tid }),
  }).catch(() => {})

  // ── Sign them straight in (the code already verified the email) ──────────────
  const signedIn = await establishSessionFor(admin, email)

  if (signedIn) {
    // They're now a real session on this device → just confirm the entry by email
    // (no claim link needed). Land them on the leaderboard.
    sendEntryConfirmation(admin, {
      email, name: displayName, challenge: { id: challenge.id, slug: challenge.slug, name: challenge.name },
      closesAt: closes_at, origin, userId, tournamentId: tid,
    }).catch(() => {})
    return NextResponse.json({
      status: 'signed_in',
      redirect: bracketConflict ? '/bracket' : `/bracket/leaderboard/${challenge.slug}`,
      message: `${inLine} You’re signed in — taking you to the leaderboard.`,
    })
  }

  // Session couldn't be established — fall back to the branded claim/sign-in email
  // so the user is never locked out.
  await sendBracketClaimEmail(admin, {
    email, name: displayName, challenge: { id: challenge.id, slug: challenge.slug, name: challenge.name },
    closesAt: closes_at, origin, next: `/bracket/leaderboard/${challenge.slug}`, existing: isExisting,
  }).catch(() => {})
  return NextResponse.json({
    status: isExisting ? 'existing' : 'created',
    email_sent: true,
    message: `${inLine} Check your email — we’ve sent a link to sign in and track your bracket.`,
  })
}
