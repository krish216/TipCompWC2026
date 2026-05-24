import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const VALID_CATEGORIES = new Set(['bug', 'suggestion', 'other'])

export async function POST(request: NextRequest) {
  try {
    // Prefer the bearer token sent by the client (in-memory, always fresh).
    // Fall back to cookie-based session for any caller that doesn't send a token.
    const admin = createAdminClient()
    let userId: string | null = null

    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

    if (token) {
      const { data: { user } } = await admin.auth.getUser(token)
      userId = user?.id ?? null
    } else {
      const user = await getSessionUser()
      userId = user?.id ?? null
    }

    const body = await request.json().catch(() => null)
    const { category, message, page_url, contact_email } = body ?? {}

    if (!VALID_CATEGORIES.has(category) || !message?.trim()) {
      return NextResponse.json({ error: 'category and message required' }, { status: 400 })
    }

    await (admin.from('feedback') as any).insert({
      user_id:       userId,
      category,
      message:       message.trim(),
      page_url:      page_url ?? null,
      contact_email: userId ? null : (contact_email?.trim() || null),
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 })
  }
}
