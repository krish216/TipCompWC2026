import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase'
import { resolveBracketChallenge, challengeClosesAt } from '@/lib/bracket/challenge'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Phase 3 — guest → account conversion funnel for the Bracket Challenge.
//
// A guest fills a bracket (held in this browser's localStorage), then enters the
// prize draw with email + name + consent. The flow is secure-by-construction on
// the email-collision case:
//   • New email      → create a passwordless account, persist their bracket +
//                       entry immediately (they're in the draw), email a login
//                       link to claim the account.
//   • Existing email → create/write NOTHING (an unauthenticated form must never
//                       touch an existing account). Email a magic login link;
//                       once they prove ownership and land back logged-in, their
//                       localStorage bracket migrates and the stashed entry
//                       replays — so they still get entered, just verified.

const SLOT_RE = /^(grp:[A-L]:[123]|third:[A-L]|r32:(1[0-6]|[1-9])|r16:[1-8]|qf:[1-4]|sf:[12]|final|tp)$/

async function activeTournamentId(admin: any): Promise<string | null> {
  const { data } = await admin.from('tournaments').select('id').eq('is_active', true).maybeSingle()
  return (data as any)?.id ?? null
}


// Anon client used purely to dispatch the passwordless login email (service-role
// can't send auth emails). shouldCreateUser:false — the account already exists
// (we just made it, or the collision case already had one).
function sendLoginLink(email: string, origin: string, next: string) {
  const anon = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  // Land directly on the destination — mirrors the app's existing magic-login
  // (login page), where the browser client detects the session from the URL.
  return anon.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}${next}` },
  })
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

  // ── Email collision: existing account → don't touch it, bounce to a login link ─
  const { data: existing } = await admin.from('users').select('id').ilike('email', email).maybeSingle()
  if (existing) {
    // → /bracket so the page migrates their localStorage bracket and replays the entry.
    await sendLoginLink(email, origin, '/bracket').catch(() => {})
    return NextResponse.json({
      status: 'existing',
      message: 'You already have a TribePicks account — we’ve emailed you a link to log in and finish entering.',
    })
  }

  // ── New email: create a passwordless account, then persist bracket + entry ──
  const { data: created, error: createErr } = await (admin.auth.admin as any).createUser({
    email,
    email_confirm: false,                        // unverified until they click the login link
    user_metadata: { display_name: displayName, signup_flow: 'bracket_guest' },
  })
  if (createErr || !created?.user?.id) {
    // Treat a duplicate (race with the lookup above) as the existing-email path.
    if ((createErr?.message ?? '').toLowerCase().includes('already')) {
      await sendLoginLink(email, origin, '/bracket').catch(() => {})
      return NextResponse.json({
        status: 'existing',
        message: 'You already have a TribePicks account — we’ve emailed you a link to log in and finish entering.',
      })
    }
    return NextResponse.json({ error: 'Could not create your account — please try again.' }, { status: 500 })
  }
  const userId = created.user.id as string
  const now = new Date().toISOString()

  // users row — mirrors the signup page's fields; email_verified flips true when
  // they click the login link (/auth/callback marks it).
  await (admin.from('users') as any).upsert({
    id:                  userId,
    email,
    display_name:        displayName,
    first_name:          typeof body.first_name === 'string' && body.first_name.trim() ? body.first_name.trim() : null,
    timezone:            typeof body.timezone === 'string' && body.timezone ? body.timezone : 'UTC',
    onboarding_complete: false,
    email_verified:      false,
    role:                'tipster',
    signup_flow:         'bracket_guest',
    ...(typeof body.source === 'string' && body.source ? { ref_source: body.source } : {}),
  }, { onConflict: 'id', ignoreDuplicates: false })

  // Persist the bracket under the new user_id (validated slot keys only).
  const pickRows = Object.entries(rawPicks)
    .filter(([slot, team]) => SLOT_RE.test(slot) && typeof team === 'string' && team)
    .map(([slot_key, team_name]) => ({ user_id: userId, tournament_id: tid, slot_key, team_name, updated_at: now }))
  if (pickRows.length)
    await (admin.from('bracket_picks') as any).upsert(pickRows, { onConflict: 'user_id,tournament_id,slot_key' })

  // The prize entry.
  const { error: entryErr } = await (admin.from('bracket_entries') as any).upsert({
    user_id:           userId,
    tournament_id:     tid,
    challenge_id:      challenge.id,
    final_goals:       finalGoals,
    tp_goals:          tpGoals,
    phone:             typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null,
    consent_terms:     true,
    consent_marketing: true,
    source:            'guest',
    updated_at:        now,
  }, { onConflict: 'user_id,challenge_id' })
  if (entryErr) return NextResponse.json({ error: entryErr.message }, { status: 500 })

  // Funnel analytics row (best-effort) — attribute the champion/runner-up capture.
  if (typeof body.session_id === 'string' && body.session_id) {
    await (admin.from('bracket_predictions') as any).upsert({
      user_id:       userId,
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

  // Send the claim/login link. → leaderboard: their bracket + entry are already saved.
  const { error: mailErr } = await sendLoginLink(email, origin, '/bracket/leaderboard')

  return NextResponse.json({
    status: 'created',
    email_sent: !mailErr,
    message: mailErr
      ? 'You’re in the draw! We couldn’t send your login email just now — use “Log in” with this address to access your account.'
      : 'You’re in the draw! Check your email for a link to claim your account and track your bracket.',
  })
}
