import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const VALID_CATEGORIES = new Set(['bug', 'suggestion', 'other'])

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser()
    const body = await request.json().catch(() => null)
    const { category, message, page_url } = body ?? {}

    if (!VALID_CATEGORIES.has(category) || !message?.trim()) {
      return NextResponse.json({ error: 'category and message required' }, { status: 400 })
    }

    const admin = createAdminClient()
    await (admin.from('feedback') as any).insert({
      user_id:  user?.id ?? null,
      category,
      message:  message.trim(),
      page_url: page_url ?? null,
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 })
  }
}
