import { createAdminClient } from '@/lib/supabase'

export type NotificationType =
  | 'round_deadline'
  | 'score_update'
  | 'leaderboard_move'
  | 'comp_announcement'
  | 'member_joined'
  | 'member_milestone'
  | 'low_tipping_alert'
  | 'round_complete'
  | 'weekly_report'
  | 'feedback_reply'
  | 'sponsor_lead'

export interface CreateNotificationParams {
  user_id:  string
  type:     NotificationType
  title:    string
  body?:    string
  data?:    Record<string, unknown>
}

// Inserts one or more notifications via the service-role client (bypasses RLS).
// Silent no-op on error — notifications are non-critical and must never break
// the calling flow.
export async function createNotifications(
  notifications: CreateNotificationParams | CreateNotificationParams[]
): Promise<void> {
  const rows = Array.isArray(notifications) ? notifications : [notifications]
  if (rows.length === 0) return

  const admin = createAdminClient()
  const { error } = await (admin.from('notifications') as any).insert(rows)
  if (error) console.error('[notifications] insert failed:', error.message)
}
