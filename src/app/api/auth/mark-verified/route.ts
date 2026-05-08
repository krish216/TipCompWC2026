import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'

// POST /api/auth/mark-verified
// Belt-and-suspenders: marks the current user's email_verified = true via the
// admin client (bypasses RLS). Called from /auth/confirmed as a fallback in case
// the auth/callback server-side update didn't run (e.g. hash-based redirect flow).
export async function POST() {
  const user = await getSessionUser()
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { error } = await (admin.from('users') as any)
    .update({ email_verified: true })
    .eq('id', user.id)

  if (error) {
    console.error('[mark-verified] update failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Sync to auth user_metadata so middleware can read email_verified from JWT
  try {
    await (admin.auth as any).admin.updateUserById(user.id, {
      user_metadata: { email_verified: true },
    })
  } catch (e: any) {
    console.warn('[mark-verified] user_metadata sync failed:', e?.message)
  }

  return NextResponse.json({ success: true })
}
