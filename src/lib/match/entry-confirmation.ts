import { Resend } from 'resend'
import { resolveActiveCampaign } from '@/lib/sponsors/resolver'
import { resolveMatchChallenge, getFixture, lockAt } from '@/lib/match/challenge'

// Branded "You're in" confirmation for a single-match challenge. Fires once, on a
// guest/member's FIRST successful entry (never on edits — callers pass created).
// Self-contained + best-effort: never throws, no-ops if email isn't configured, so
// a mail hiccup can't fail an entry. Callers fire-and-forget.

const FROM = process.env.RESEND_FROM ?? 'TribePicks <noreply@mail.tribepicks.com>'
const esc = (s: string) => s.replace(/[<>&]/g, c => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'))

const fmtDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Sydney',
    }) + ' AEST'
  } catch { return '' }
}
const fmtMin = (m: number | null) => (m == null ? '' : m === 0 ? 'no goal (0–0)' : `${m}'`)

export async function sendMatchEntryConfirmation(
  admin: any,
  opts: { email: string; name?: string | null; userId: string; slug: string; origin: string },
): Promise<void> {
  if (!process.env.RESEND_API_KEY) return
  try {
    const challenge = await resolveMatchChallenge(admin, opts.slug)
    if (!challenge) return
    const fixture = challenge.fixture_id ? await getFixture(admin, challenge.fixture_id) : null
    if (!fixture) return

    const { data: entry } = await (admin.from('match_entries') as any)
      .select('pred_home, pred_away, advances_team, first_goal_min')
      .eq('challenge_id', challenge.id).eq('user_id', opts.userId).maybeSingle()
    if (!entry) return

    const cfg = await resolveActiveCampaign(admin, { challengeType: 'match', challengeId: challenge.id })
    const sponsor     = cfg.enabled ? (cfg.sponsor_name || '') : ''
    const subsidiary  = cfg.enabled ? (cfg.sponsor_tagline || '') : ''
    const prize       = cfg.enabled ? (cfg.prize || '') : ''
    const sponsorLogo = cfg.enabled ? (cfg.sponsor_logo || '') : ''
    const sponsorUrl  = cfg.enabled ? (cfg.sponsor_url || '') : ''

    const firstName = (opts.name ?? '').trim().split(' ')[0]
    const leaderUrl = `${opts.origin.replace(/\/$/, '')}/match/${challenge.slug}`
    const lock      = lockAt(challenge, fixture)
    const scoreLine = `${fixture.home} ${(entry as any).pred_home}–${(entry as any).pred_away} ${fixture.away}`

    const subject = sponsor ? `You're in 🎯 ${sponsor} · ${challenge.name}` : `You're in 🎯 ${challenge.name}`
    const resend  = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: FROM, to: opts.email, subject,
      html: buildHtml({
        firstName, challengeName: challenge.name, matchLabel: `${fixture.home} v ${fixture.away}`,
        kickoff: fmtDate(fixture.kickoff_utc), closes: lock ? fmtDate(lock) : '',
        scoreLine, advances: (entry as any).advances_team ?? '', firstGoal: fmtMin((entry as any).first_goal_min ?? null),
        sponsor, subsidiary, prize, sponsorLogo, sponsorUrl, leaderUrl,
      }),
    })
    if (error) console.error('[match/entry-confirmation] send failed:', error)
  } catch (e: any) {
    console.error('[match/entry-confirmation] error:', e?.message ?? e)
  }
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:5px 0;font-size:13px;color:#6b7280;white-space:nowrap;">${label}</td>` +
    `<td style="padding:5px 0 5px 14px;font-size:14px;font-weight:700;color:#111827;text-align:right;">${esc(value)}</td></tr>`
}

function buildHtml(v: {
  firstName: string; challengeName: string; matchLabel: string; kickoff: string; closes: string
  scoreLine: string; advances: string; firstGoal: string
  sponsor: string; subsidiary: string; prize: string; sponsorLogo: string; sponsorUrl: string; leaderUrl: string
}): string {
  const greeting = v.firstName ? `Nice one, ${esc(v.firstName)} —` : 'Nice one —'
  const sponsorLabel = v.sponsor ? `<strong>${esc(v.sponsor)}${v.subsidiary ? ` ${esc(v.subsidiary)}` : ''}</strong>` : ''
  const prizeLine = v.prize
    ? `<p style="margin:0 0 6px;font-size:15px;color:#374151;">You're in the draw to win <strong style="color:#065f46;">${esc(v.prize)}</strong>${sponsorLabel ? ` from ${sponsorLabel}` : ''}.</p>`
    : (sponsorLabel ? `<p style="margin:0 0 6px;font-size:15px;color:#374151;">You're in, proudly hosted by ${sponsorLabel}.</p>` : '')
  const closesLine = v.closes
    ? `<p style="margin:0;font-size:13px;color:#6b7280;">Predictions lock <strong>${esc(v.closes)}</strong> — you can tweak yours any time until then.</p>`
    : `<p style="margin:0;font-size:13px;color:#6b7280;">You can tweak your prediction any time until entries lock.</p>`

  const rows = [
    row('⚽ Match', v.matchLabel),
    row('🎯 Your score', v.scoreLine),
    v.advances ? row('➡️ Advances', v.advances) : '',
    v.firstGoal ? row('⏱️ First goal', v.firstGoal) : '',
    v.kickoff ? row('🗓️ Kick-off', v.kickoff) : '',
  ].filter(Boolean).join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#ffffff;">
  <div style="text-align:center;margin-bottom:20px;">
    <img src="https://tribepicks.com/logo.png" alt="TribePicks" height="80" style="display:inline-block;"/>
  </div>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px;"/>
  <p style="margin:0 0 6px;font-size:18px;font-weight:900;color:#111827;">${greeting} you're in! 🎉</p>
  <p style="margin:0 0 16px;font-size:15px;color:#374151;">Your prediction is locked into the <strong>${esc(v.challengeName)}</strong>.</p>
  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:18px 20px;margin-bottom:20px;">
    ${prizeLine}
    ${closesLine}
  </div>
  <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#9ca3af;">Your prediction</p>
  <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:22px;padding:6px 16px;">
    ${rows}
  </table>
  <div style="text-align:center;margin-bottom:16px;">
    <a href="${v.leaderUrl}" style="display:inline-block;padding:12px 30px;background:#16a34a;color:#ffffff;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;">View the leaderboard →</a>
  </div>
  <p style="margin:0 0 22px;font-size:13px;line-height:1.6;color:#6b7280;text-align:center;">See every challenge you’ve entered under <a href="https://tribepicks.com/tribe?tab=challenges" style="color:#047857;font-weight:600;text-decoration:underline;">My Tribe → Challenges</a>.</p>
  ${(v.sponsorLogo || v.sponsor) ? `
  <div style="text-align:center;margin-bottom:24px;padding-top:6px;border-top:1px solid #f1f5f9;">
    <p style="margin:16px 0 10px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;">Brought to you by</p>
    ${v.sponsorLogo
      ? `<a href="${v.sponsorUrl || 'https://www.tribepicks.com'}" style="text-decoration:none;"><img src="${v.sponsorLogo}" alt="${esc(v.sponsor)}" height="48" style="display:inline-block;border-radius:6px;"/></a>`
      : `<p style="margin:0;font-size:16px;font-weight:800;color:#111827;">${esc(v.sponsor)}</p>`}
    ${v.subsidiary ? `<p style="margin:8px 0 0;font-size:13px;font-weight:600;color:#374151;">${esc(v.subsidiary)}</p>` : ''}
    ${v.sponsorUrl ? `<p style="margin:8px 0 0;font-size:13px;"><a href="${v.sponsorUrl}" style="color:#065f46;font-weight:600;text-decoration:none;">Visit ${esc(v.sponsor)} →</a></p>` : ''}
  </div>` : ''}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px;"/>
  <p style="font-size:11px;color:#9ca3af;margin:0;">You're receiving this because you entered a challenge at
    <a href="https://www.tribepicks.com" style="color:#6b7280;">TribePicks</a>. Good luck! 🍀</p>
</body>
</html>`
}
