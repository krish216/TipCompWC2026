// CompChief Pro — automated tip reminders. For each comp that switched on
// `auto_reminder` AND is Pro (an admin paid is_premium this tournament), email the
// members who haven't tipped the open round, at the configured lead window(s) before
// it locks. Reuses untippedForOpenRound; deduped per (comp, round, window) so each
// member gets each reminder at most once. Runs best-effort off the 5-min scores cron.

import { untippedForOpenRound } from '@/lib/untipped'
import { Resend } from 'resend'

const FROM = process.env.RESEND_FROM ?? 'TribePicks <noreply@mail.tribepicks.com>'
const GRACE_H = 2.5   // only fire just after a window is crossed (covers cron jitter / late enable)

// auto_reminder is a comma list of lead hours, e.g. '48,24,3' / '24,3' / 'off'.
// Stays back-compatible with the old enum ('both' → 24+3, '24h'/'3h'/'48h' singles).
function windowsFor(pref: string): number[] {
  if (!pref || pref === 'off') return []
  if (pref === 'both') return [24, 3]
  return pref.split(',').map(s => parseInt(s, 10)).filter(n => [48, 24, 3].includes(n))
}

export async function sendDueAutoReminders(admin: any): Promise<{ comps: number; emails: number }> {
  const { data: comps } = await (admin.from('comps') as any)
    .select('id, name, tournament_id, auto_reminder').neq('auto_reminder', 'off')
  if (!comps?.length) return { comps: 0, emails: 0 }

  // Pro = a comp admin with is_premium for the comp's tournament.
  const compIds = comps.map((c: any) => c.id)
  const { data: cas } = await (admin.from('comp_admins') as any).select('comp_id, user_id').in('comp_id', compIds)
  const adminIds = [...new Set((cas ?? []).map((r: any) => r.user_id))]
  const { data: prem } = adminIds.length
    ? await (admin.from('user_tournaments') as any).select('user_id, tournament_id').eq('is_premium', true).in('user_id', adminIds)
    : { data: [] }
  const premSet = new Set((prem ?? []).map((r: any) => `${r.user_id}:${r.tournament_id}`))
  const proComps = new Set<string>()
  for (const r of cas ?? []) {
    const c = comps.find((x: any) => x.id === r.comp_id)
    if (c && premSet.has(`${r.user_id}:${c.tournament_id}`)) proComps.add(r.comp_id)
  }

  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
  const now = Date.now()
  let compsHit = 0, emails = 0

  for (const c of comps) {
    if (!proComps.has(c.id)) continue
    const r = await untippedForOpenRound(admin, c.id)
    if (!r.round_code || !r.deadline || !r.untipped.length) continue
    const hrs = (new Date(r.deadline).getTime() - now) / 3_600_000
    if (hrs <= 0) continue
    const roundName = r.round_name ?? 'this round'

    for (const w of windowsFor(c.auto_reminder)) {
      if (!(hrs <= w && hrs > w - GRACE_H)) continue   // only the window we just crossed
      const { data: already } = await (admin.from('comp_reminders_sent') as any)
        .select('id').eq('comp_id', c.id).eq('round_code', r.round_code).eq('window_hours', w).maybeSingle()
      if (already) continue

      if (resend) {
        for (const m of r.untipped) {
          if (!m.email) continue
          await resend.emails.send({
            from: FROM, to: m.email,
            subject: `⏰ ${roundName} tips for ${c.name} lock soon`,
            html: reminderHtml(c.name, roundName, m.display_name),
          }).catch(() => {})
          emails++
        }
      }
      await (admin.from('comp_reminders_sent') as any).upsert(
        { comp_id: c.id, round_code: r.round_code, window_hours: w, sent_count: r.untipped.length, sent_at: new Date().toISOString() },
        { onConflict: 'comp_id,round_code,window_hours' })
    }
    compsHit++
  }
  return { comps: compsHit, emails }
}

function reminderHtml(compName: string, roundName: string, name: string): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.tribepicks.com').replace(/\/$/, '')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#ffffff;">
  <div style="text-align:center;margin-bottom:20px;"><img src="https://tribepicks.com/logo.png" alt="TribePicks" height="80"/></div>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 22px;"/>
  <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#111827;">⏰ Don't miss out, ${name}!</p>
  <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#374151;">
    Your <strong>${roundName}</strong> tips for <strong>${compName}</strong> are still missing — and they lock soon. Lock them in before kick-off so you don't drop points.</p>
  <div style="text-align:center;margin-bottom:22px;">
    <a href="${appUrl}/predict" style="display:inline-block;padding:12px 32px;background:#16a34a;color:#fff;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;">Get my tips in →</a></div>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 14px;"/>
  <p style="font-size:11px;color:#9ca3af;margin:0;">You're getting this because you're a member of <strong>${compName}</strong> on <a href="${appUrl}" style="color:#6b7280;">TribePicks</a>. Manage reminders in your notification settings.</p>
</body></html>`
}
