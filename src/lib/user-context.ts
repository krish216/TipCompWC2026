// lib/user-context.ts
// Shared helper — resolves active tournament_id and comp_id for a user
// Used by fixtures, predictions, leaderboard, tribes APIs
// Priority: user_preferences table → first active tournament in DB

import { SupabaseClient } from '@supabase/supabase-js'

export async function getUserContext(
  supabase: SupabaseClient,
  userId: string
): Promise<{ tournament_id: string | null; comp_id: string | null }> {
  // 1. Check user_preferences
  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('tournament_id, comp_id')
    .eq('user_id', userId)
    .single()

  let tournament_id = (prefs as any)?.tournament_id ?? null
  const comp_id     = (prefs as any)?.comp_id ?? null

  // 2. If no tournament preference, fall back to first active tournament
  if (!tournament_id) {
    const { data: activeTourns } = await supabase
      .from('tournaments')
      .select('id')
      .eq('status', 'active')
      .order('start_date', { ascending: true })
      .limit(1)

    tournament_id = (activeTourns as any)?.[0]?.id ?? null
  }

  return { tournament_id, comp_id }
}
