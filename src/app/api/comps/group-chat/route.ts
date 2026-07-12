import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Known community-chat hosts. A group link must resolve to one of these (https only) —
// stops a Chief pasting an arbitrary/malicious URL that members would tap.
const ALLOWED = [
  { host: /^chat\.whatsapp\.com$/i,          platform: 'whatsapp' },
  { host: /^(t|telegram)\.me$/i,             platform: 'telegram' },
  { host: /^(www\.)?discord\.(gg|com)$/i,    platform: 'discord'  },
]

function classify(raw: string): { url: string; platform: string } | null {
  try {
    const u = new URL(raw.trim())
    if (u.protocol !== 'https:') return null
    const match = ALLOWED.find(a => a.host.test(u.hostname))
    if (!match) return null
    return { url: u.toString(), platform: match.platform }
  } catch { return null }
}

function platformOf(raw: string | null): string | null {
  if (!raw) return null
  return classify(raw)?.platform ?? 'chat'
}

async function isMember(admin: any, compId: string, userId: string): Promise<boolean> {
  const [{ data: m }, { data: a }] = await Promise.all([
    (admin.from('user_comps') as any).select('user_id').eq('comp_id', compId).eq('user_id', userId).maybeSingle(),
    (admin.from('comp_admins') as any).select('comp_id').eq('comp_id', compId).eq('user_id', userId).maybeSingle(),
  ])
  return !!m || !!a
}

// GET /api/comps/group-chat?comp_id=<id>
// Member-gated: returns the group-chat link ONLY to a comp member/admin (never to
// strangers on a public open-comp page). { url, platform } or { url: null }.
export async function GET(request: NextRequest) {
  const compId = new URL(request.url).searchParams.get('comp_id')
  if (!compId) return NextResponse.json({ error: 'comp_id required' }, { status: 400 })

  const user = await getSessionUser()
  if (!user) return NextResponse.json({ url: null })

  const admin = createAdminClient()
  if (!(await isMember(admin, compId, user.id))) return NextResponse.json({ url: null })

  const { data } = await (admin.from('comps') as any).select('group_chat_url').eq('id', compId).maybeSingle()
  const url = (data as any)?.group_chat_url ?? null
  return NextResponse.json({ url, platform: platformOf(url) })
}

// PATCH /api/comps/group-chat  { comp_id, url }
// Comp admin sets/clears the link. Validates the host; empty string clears it.
export async function PATCH(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { comp_id, url } = await request.json().catch(() => ({}))
  if (!comp_id) return NextResponse.json({ error: 'comp_id required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: adminRow } = await (admin.from('comp_admins') as any)
    .select('comp_id').eq('comp_id', comp_id).eq('user_id', user.id).maybeSingle()
  if (!adminRow) return NextResponse.json({ error: 'Comp admin only' }, { status: 403 })

  let toStore: string | null = null
  if (url && url.trim()) {
    const parsed = classify(url)
    if (!parsed) return NextResponse.json({ error: 'Enter a valid WhatsApp, Telegram or Discord invite link (https).' }, { status: 400 })
    toStore = parsed.url
  }

  const { error } = await (admin.from('comps') as any).update({ group_chat_url: toStore }).eq('id', comp_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ url: toStore, platform: platformOf(toStore) })
}
