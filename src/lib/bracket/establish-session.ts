import type { EmailOtpType } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// Signs an already-email-verified user into THIS request's browser by minting a
// one-time magic-link token (admin API) and immediately redeeming it on a
// cookie-bound server client — which writes the Supabase auth cookies onto the
// outgoing response. No email is sent and no password is touched; this is exactly
// equivalent to the user completing a passwordless magic-link login, which is
// authorised because the 6-digit code already proved they own the address.
//
// Returns true when the session cookies were set. On any failure the caller should
// fall back to emailing a login link so the user is never left without a way in.
export async function establishSessionFor(admin: any, email: string): Promise<boolean> {
  try {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    const tokenHash = (data as any)?.properties?.hashed_token
    if (error || !tokenHash) return false

    // generateLink reports the matching verify type (e.g. 'magiclink'); fall back
    // to 'email' which supabase-js treats as the unified email-OTP type.
    const type = ((data as any)?.properties?.verification_type ?? 'magiclink') as EmailOtpType

    const server = createServerSupabaseClient()
    const { error: verifyErr } = await server.auth.verifyOtp({ token_hash: tokenHash, type })
    return !verifyErr
  } catch {
    return false
  }
}
