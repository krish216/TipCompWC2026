import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

// Called by Vercel Cron every 15 minutes
// vercel.json: { "crons": [{ "path": "/api/notifications/reminders", "schedule": "*/15 * * * *" }] }
export async function GET(request: NextRequest) {
  // Verify cron secret to prevent abuse
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()

  // Find fixtures kicking off in ~24h, ~12h, ~1h that have unpredicted users
  const WINDOWS = [
    { label: '24h', minMins: 23 * 60 + 45, maxMins: 24 * 60 + 15 },
    { label: '12h', minMins: 11 * 60 + 45, maxMins: 12 * 60 + 15 },
    { label: '1h',  minMins: 45,            maxMins: 75            },
  ]

  let totalSent = 0

  for (const window of WINDOWS) {
    const from = new Date(now.getTime() + window.minMins * 60000)
    const to   = new Date(now.getTime() + window.maxMins * 60000)

    // Get fixtures in this window
    const { data: fixtures } = await supabase
      .from('fixtures')
      .select('id, home, away, kickoff_utc')
      .gte('kickoff_utc', from.toISOString())
      .lte('kickoff_utc', to.toISOString())
      .is('home_score', null) // not yet played

    if (!fixtures?.length) continue

    const fixtureIds = fixtures.map(f => f.id)

    // Get all users who have NOT predicted these fixtures
    const { data: allUsers } = await supabase
      .from('users')
      .select('id, email, display_name, notification_prefs!left(push_enabled, email_enabled)')

    if (!allUsers?.length) continue

    for (const user of allUsers) {
      const prefs = (user as any).notification_prefs?.[0]
      if (!prefs?.email_enabled && !prefs?.push_enabled) continue

      // Check which fixtures this user hasn't predicted
      const { data: existingPreds } = await supabase
        .from('predictions')
        .select('fixture_id')
        .eq('user_id', user.id)
        .in('fixture_id', fixtureIds)

      const predictedIds = new Set(existingPreds?.map(p => p.fixture_id) ?? [])
      const unpredicted = fixtures.filter(f => !predictedIds.has(f.id))
      if (!unpredicted.length) continue

      const matchList = unpredicted
        .map(f => `${f.home} vs ${f.away}`)
        .join(', ')

      // Send email reminder
      if (prefs?.email_enabled && user.email) {
        await resend.emails.send({
          from: 'WC2026 Predictor <reminders@wc2026predictor.com>',
          to: user.email,
          subject: `⚽ ${window.label} reminder — ${unpredicted.length} match${unpredicted.length > 1 ? 'es' : ''} need your prediction`,
          html: buildEmailHtml(user.display_name, unpredicted.length, matchList, window.label),
        })
        totalSent++
      }

      // Push notification (OneSignal)
      if (prefs?.push_enabled && process.env.ONESIGNAL_API_KEY) {
        await fetch('https://onesignal.com/api/v1/notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${process.env.ONESIGNAL_API_KEY}`,
          },
          body: JSON.stringify({
            app_id: process.env.ONESIGNAL_APP_ID,
            include_external_user_ids: [user.id],
            headings: { en: `⚽ ${window.label} to kickoff` },
            contents: { en: `${unpredicted.length} match${unpredicted.length > 1 ? 'es' : ''} still need your prediction: ${matchList}` },
            url: `${process.env.NEXT_PUBLIC_APP_URL}/predict`,
          }),
        })
        totalSent++
      }
    }
  }

  return NextResponse.json({ sent: totalSent, checked_at: now.toISOString() })
}

function buildEmailHtml(name: string, count: number, matches: string, window: string): string {
  return `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #085041;">⚽ WC2026 Predictor</h2>
  <p>Hi ${name},</p>
  <p>Kickoff is in <strong>${window}</strong> and you still have <strong>${count} unpredicted match${count > 1 ? 'es' : ''}</strong>:</p>
  <p style="background: #FAEEDA; padding: 12px; border-radius: 8px; color: #633806;">${matches}</p>
  <p>Predictions lock 5 minutes before kickoff — don't miss out on points!</p>
  <a href="${process.env.NEXT_PUBLIC_APP_URL}/predict"
     style="display:inline-block;background:#1D9E75;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;margin-top:8px;">
    Enter your predictions →
  </a>
  <p style="font-size:12px;color:#888;margin-top:24px;">
    You're receiving this because you have email reminders enabled.
    <a href="${process.env.NEXT_PUBLIC_APP_URL}/settings/notifications">Manage notifications</a>
  </p>
</body>
</html>`
}
