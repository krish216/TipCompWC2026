import { createNotifications } from '@/lib/notifications'

// Shared logic for the Weekly Intelligence Report funnel: posting the report
// link into a tribe's chat as a system message AND notifying members via the
// bell. Used by both the weekly cron and the comp-admin "Post weekly report"
// button so the two paths can't drift.

export const MIN_TRIBE_MEMBERS = 4
export const REPORT_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://tribepicks.com'

// Monday (UTC) of the week containing d, as YYYY-MM-DD.
export function mondayOf(d: Date): string {
  const day  = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff))
  return m.toISOString().slice(0, 10)
}

export function reportLink(siteUrl: string, tribeId: string): string {
  return `${siteUrl}/tribe/report?tribe_id=${tribeId}`
}

// All member user_ids of a tribe — union of tribe_members and users.tribe_id, so
// nobody is missed regardless of which membership record they have.
async function tribeMemberIds(admin: any, tribeId: string): Promise<string[]> {
  const [{ data: tm }, { data: us }] = await Promise.all([
    admin.from('tribe_members').select('user_id').eq('tribe_id', tribeId),
    admin.from('users').select('id').eq('tribe_id', tribeId),
  ])
  const set = new Set<string>()
  for (const r of (tm ?? [])) if (r.user_id) set.add(r.user_id)
  for (const r of (us ?? [])) if (r.id) set.add(r.id)
  return [...set]
}

// Create one bell notification per tribe member, deep-linking to the tribe chat.
export async function notifyTribeReport(admin: any, tribeId: string): Promise<number> {
  const ids = await tribeMemberIds(admin, tribeId)
  if (!ids.length) return 0
  await createNotifications(ids.map(uid => ({
    user_id: uid,
    type:    'weekly_report' as const,
    title:   "📋 This week's tribe intel is in",
    body:    "See who's under investigation 👀 — tap to open your tribe chat.",
    data:    { href: '/tribe?tab=chat', tribe_id: tribeId },
  })))
  return ids.length
}

// Post the report system message into a tribe's chat, notify members, and record
// the weekly dedupe row. Throws if the chat insert fails.
export async function postReportToTribe(admin: any, tribeId: string, siteUrl: string): Promise<{ notified: number }> {
  const content = `📋 This week's TribePicks Intelligence Report is in 👀 (members only)\n${reportLink(siteUrl, tribeId)}`
  const { error } = await admin.from('chat_messages')
    .insert({ tribe_id: tribeId, user_id: null, is_system: true, content, round_code: null })
  if (error) throw new Error(error.message)

  const notified = await notifyTribeReport(admin, tribeId)
  await admin.from('weekly_report_posts').upsert({ tribe_id: tribeId, week_start: mondayOf(new Date()) })
  return { notified }
}
