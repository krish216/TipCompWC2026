import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/auth/verify-email?token=<uuid>
// Validates a custom verification token, marks email_verified=true in both the
// users table and Supabase auth user_metadata (so middleware can read it from
// the JWT without a DB round-trip), then redirects to /auth/confirmed.
// Bypasses Supabase magic links entirely — no hash-based redirect issues.
export async function GET(req: NextRequest) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.tribepicks.com').replace(/\/$/, '')
  const token  = req.nextUrl.searchParams.get('token')

  if (!token) {
    return NextResponse.redirect(`${appUrl}/auth/confirmed?error=missing_token`)
  }

  const admin = createAdminClient()
  const { data: user, error } = await (admin.from('users') as any)
    .select('id, email_verify_token_expires_at')
    .eq('email_verify_token', token)
    .maybeSingle()

  if (error) {
    console.error('[verify-email] DB lookup error:', error.message)
    return NextResponse.redirect(`${appUrl}/auth/confirmed?error=server_error`)
  }

  if (!user) {
    return NextResponse.redirect(`${appUrl}/auth/confirmed?error=invalid_token`)
  }

  const expiresAt = user.email_verify_token_expires_at
    ? new Date(user.email_verify_token_expires_at)
    : null

  if (!expiresAt || expiresAt < new Date()) {
    return NextResponse.redirect(`${appUrl}/auth/confirmed?error=expired_token`)
  }

  const { error: updateError } = await (admin.from('users') as any)
    .update({
      email_verified:                true,
      email_verify_token:            null,
      email_verify_token_expires_at: null,
    })
    .eq('id', user.id)

  if (updateError) {
    console.error('[verify-email] DB update error:', updateError.message)
    return NextResponse.redirect(`${appUrl}/auth/confirmed?error=server_error`)
  }

  // Sync to auth user_metadata so the middleware can read email_verified from
  // the JWT (avoids a DB query on every /login visit for logged-in users).
  try {
    await (admin.auth as any).admin.updateUserById(user.id, {
      user_metadata: { email_verified: true },
    })
  } catch (e: any) {
    console.warn('[verify-email] user_metadata sync failed:', e?.message)
  }

  // Redirect straight to homepage with ?verified=1 so the app can celebrate
  // inline — avoids the full-page /auth/confirmed detour.
  return NextResponse.redirect(`${appUrl}/?verified=1`)
}
