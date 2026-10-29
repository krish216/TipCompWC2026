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
  | 'comp_full_request'   // someone tried to join a comp with no tribe room left and pool creation closed/capped
  | 'sweep_payment_request' // a buyer submitted a cash/bank-transfer ticket request needing the organiser's review
  | 'sweep_results_ready'   // a tribe's podium is fully determined — results are in for its members
  | 'sweep_request_approved' // the buyer's ticket request was approved — they can spin
  | 'sweep_request_rejected' // the buyer's ticket request was rejected
  | 'sweep_payment_reminder' // a buyer nudged the organiser about an overdue request
  | 'sweep_draw_open'        // the final field is in (or it's race morning) — you've tickets to spin

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
