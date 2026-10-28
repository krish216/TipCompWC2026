import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'

// /rules with no tournament slug — send the visitor to whichever tournament is actually
// active, instead of a hardcoded one that goes stale the moment a new tournament
// launches (this was still pointing at wc2026 after EPL became the active tournament).
export default async function RulesIndex() {
  const admin = createAdminClient()
  const { data } = await (admin.from('tournaments') as any)
    .select('slug').eq('is_active', true).order('start_date', { ascending: true }).limit(1).maybeSingle()
  redirect(`/rules/${data?.slug ?? 'wc2026'}`)
}
