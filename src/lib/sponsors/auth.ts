// Sponsor Campaigns module — admin gate shared by the CRUD routes.
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'

export interface AdminGate { admin: any; userId: string | null; ok: boolean }

// Resolves the session user and confirms they're a global admin. Routes do:
//   const g = await requireAdmin(); if (!g.ok) return forbidden(g)
export async function requireAdmin(): Promise<AdminGate> {
  const admin = createAdminClient()
  const user  = await getSessionUser().catch(() => null)
  if (!user) return { admin, userId: null, ok: false }
  const { data } = await (admin.from('admin_users') as any)
    .select('user_id').eq('user_id', user.id).maybeSingle()
  return { admin, userId: user.id, ok: !!data }
}
