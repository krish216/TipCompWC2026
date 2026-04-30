import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'

// PATCH /api/users/display-name — update current user's display name
// Body: { display_name: string, comp_id?: string }
// Uniqueness is checked within the comp when comp_id is provided.
export async function PATCH(request: NextRequest) {
  const adminClient = createAdminClient()
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const rawName: string = (body?.display_name ?? '').trim()
  const compId: string | null = body?.comp_id ?? null

  if (!rawName || rawName.length < 2 || rawName.length > 30) {
    return NextResponse.json({ error: 'Display name must be 2–30 characters' }, { status: 422 })
  }

  // Comp-scoped uniqueness check
  if (compId) {
    const { data: compMembers } = await (adminClient.from('user_comps') as any)
      .select('user_id').eq('comp_id', compId)
    const memberIds: string[] = (compMembers ?? []).map((r: any) => r.user_id).filter((id: string) => id !== user.id)

    if (memberIds.length > 0) {
      const { data: conflict } = await (adminClient.from('users') as any)
        .select('id').ilike('display_name', rawName).in('id', memberIds).limit(1).maybeSingle()
      if (conflict) {
        return NextResponse.json({ error: 'That name is already taken in this comp — try another' }, { status: 409 })
      }
    }
  }

  const { error } = await (adminClient.from('users') as any)
    .update({ display_name: rawName }).eq('id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Keep auth metadata in sync
  await adminClient.auth.admin.updateUserById(user.id, {
    user_metadata: { display_name: rawName },
  })

  return NextResponse.json({ success: true, display_name: rawName })
}
