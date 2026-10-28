import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getPrimaryTournament } from '@/lib/content/wc'
import { sendWelcomeIfNeeded } from '@/lib/welcome-email'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// POST /api/auth/register-invited — the one path that still skips OTP verification:
// someone registering via a comp invite link whose email is already in that comp's
// comp_invitations (proof of ownership via the invite itself). Creates the account
// through the Admin API with email_confirm: true, so Supabase marks it confirmed at
// creation — no code ever sent or required. Client signs in immediately after with the
// same credentials to get a session (Admin-created users have none by default).
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const email       = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password    = typeof body?.password === 'string' ? body.password : ''
  const displayName = typeof body?.display_name === 'string' ? body.display_name.trim() : ''
  const inviteCompName = typeof body?.invite_comp_name === 'string' ? body.invite_comp_name : undefined
  const tournamentId   = typeof body?.tournament_id === 'string' ? body.tournament_id : null

  if (!email || !password || !displayName) {
    return NextResponse.json({ error: 'email, password and display_name required' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: {
      display_name:   displayName,
      email_verified: true,
      ...(inviteCompName ? { invite_comp_name: inviteCompName } : {}),
    },
  })
  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('already registered') || msg.includes('already been registered') || msg.includes('duplicate'))
      return NextResponse.json({ error: 'This email is already registered — use Sign in or Reset password.' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const userId = created.user?.id
  if (!userId) return NextResponse.json({ error: 'Account creation failed' }, { status: 500 })

  // Welcome email — the OTP path's /api/auth/verify-signup sends it at the equivalent
  // moment (proof of email ownership); this path proves ownership via the invite itself,
  // so send it right here instead, same as /auth/callback does for OAuth/magic-link.
  const tid = tournamentId ?? (await getPrimaryTournament(admin).then((t: any) => t?.id).catch(() => null))
  if (tid) {
    await (admin.from('user_tournaments') as any)
      .upsert({ user_id: userId, tournament_id: tid }, { onConflict: 'user_id,tournament_id', ignoreDuplicates: true })
    await sendWelcomeIfNeeded(userId, tid).catch(() => {})
  }

  return NextResponse.json({ ok: true, user_id: userId })
}
