import { Resend } from 'resend'
import { resolveActiveCampaign } from '@/lib/sponsors/resolver'

// Branded "You're entered" confirmation for a bracket challenge. Fires once, on a
// guest/member's FIRST successful entry into a given challenge (never on edits).
// Includes a snapshot of their key picks + tie-breakers as a receipt. Best-effort
// and self-contained: never throws, no-ops if email isn't configured — callers
// fire-and-forget so a mail hiccup can't fail an entry.

const FROM = process.env.RESEND_FROM ?? 'TribePicks <noreply@mail.tribepicks.com>'

const fmtDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    })
  } catch { return '' }
}

interface EntrySummary {
  champion: string | null
  runnerUp: string | null
  semis: string[]
  third: string | null
  finalGoals: number | null
  tpGoals: number | null
}

// Pull the entrant's bracket (shared per tournament) + this challenge's tie-breakers
// into the headline picks for the email receipt.
async function loadSummary(admin: any, userId: string, tournamentId: string, challengeId: string): Promise<EntrySummary | null> {
  try {
    const { data: rows } = await (admin.from('bracket_picks') as any)
      .select('slot_key, team_name').eq('user_id', userId).eq('tournament_id', tournamentId)
    const picks: Record<string, string> = {}
    for (const r of (rows ?? []) as any[]) if (r.team_name) picks[r.slot_key] = r.team_name

    const champion  = picks['final'] ?? null
    const finalists = [picks['sf:1'], picks['sf:2']].filter(Boolean) as string[]
    const runnerUp  = finalists.find(t => t !== champion) ?? null
    const semis     = ['qf:1', 'qf:2', 'qf:3', 'qf:4'].map(k => picks[k]).filter(Boolean) as string[]
    const third     = picks['tp'] ?? null

    const { data: entry } = await (admin.from('bracket_entries') as any)
      .select('final_goals, tp_goals').eq('user_id', userId).eq('challenge_id', challengeId).maybeSingle()

    return {
      champion, runnerUp, semis, third,
      finalGoals: (entry as any)?.final_goals ?? null,
      tpGoals:    (entry as any)?.tp_goals ?? null,
    }
  } catch {
    return null
  }
}

export async function sendEntryConfirmation(
  admin: any,
  opts: {
    email: string
    name?: string | null
    challenge: { id: string; slug: string; name: string }
    closesAt?: string | null
    origin: string
    userId?: string | null
    tournamentId?: string | null
  },
): Promise<void> {
  if (!process.env.RESEND_API_KEY) return
  try {
    const cfg = await resolveActiveCampaign(admin, { challengeType: 'bracket', challengeId: opts.challenge.id })
    const sponsor     = cfg.enabled ? cfg.sponsor_name : ''
    const prize       = cfg.enabled ? cfg.prize : ''
    const sponsorLogo = cfg.enabled ? (cfg.sponsor_logo || '') : ''
    const sponsorUrl  = cfg.enabled ? (cfg.sponsor_url  || '') : ''
    const subsidiary  = cfg.enabled ? (cfg.sponsor_tagline || '') : ''
    const firstName = (opts.name ?? '').trim().split(' ')[0]
    const leaderUrl = `${opts.origin.replace(/\/$/, '')}/bracket/leaderboard/${opts.challenge.slug}`
    const closes    = opts.closesAt ? fmtDate(opts.closesAt) : ''
    const summary   = (opts.userId && opts.tournamentId)
      ? await loadSummary(admin, opts.userId, opts.tournamentId, opts.challenge.id)
      : null

    const subject = `You're in 🏆 ${opts.challenge.name}`
    const resend  = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: FROM, to: opts.email, subject,
      html: buildHtml({ firstName, challengeName: opts.challenge.name, sponsor, subsidiary, prize, sponsorLogo, sponsorUrl, closes, leaderUrl, summary }),
    })
    if (error) console.error('[entry-confirmation] send failed:', error)
  } catch (e: any) {
    console.error('[entry-confirmation] error:', e?.message ?? e)
  }
}

const esc = (s: string) => s.replace(/[<>&]/g, c => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'))
const goalsLabel = (n: number | null) => (n == null ? '–' : `${n} goal${n === 1 ? '' : 's'}`)

function summaryBlock(s: EntrySummary): string {
  if (!s.champion) return ''
  const row = (label: string, value: string) =>
    `<tr><td style="padding:5px 0;font-size:13px;color:#6b7280;white-space:nowrap;">${label}</td>` +
    `<td style="padding:5px 0 5px 14px;font-size:14px;font-weight:700;color:#111827;text-align:right;">${esc(value)}</td></tr>`

  const rows = [
    row('🏆 Champion', s.champion),
    s.runnerUp ? row('🥈 Runner-up', s.runnerUp) : '',
    s.semis.length ? row('⚽ Semi-finalists', s.semis.join(' · ')) : '',
    s.third ? row('🥉 3rd place', s.third) : '',
    (s.finalGoals != null || s.tpGoals != null)
      ? row('🎯 Tie-breakers', `Final ${goalsLabel(s.finalGoals)} · 3rd-place ${goalsLabel(s.tpGoals)}`)
      : '',
  ].filter(Boolean).join('')

  return `
  <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#9ca3af;">Your entry</p>
  <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:22px;padding:6px 16px;">
    ${rows}
  </table>`
}

function buildHtml(v: {
  firstName: string; challengeName: string; sponsor: string; subsidiary: string; prize: string; sponsorLogo: string; sponsorUrl: string; closes: string; leaderUrl: string; summary: EntrySummary | null
}): string {
  const greeting = v.firstName ? `Nice one, ${v.firstName} —` : 'Nice one —'
  const prizeLine = v.prize
    ? `<p style="margin:0 0 6px;font-size:15px;color:#374151;">You're in the draw to win <strong style="color:#065f46;">${v.prize}</strong>${v.sponsor ? ` from <strong>${v.sponsor}</strong>` : ''}.</p>`
    : (v.sponsor ? `<p style="margin:0 0 6px;font-size:15px;color:#374151;">You're in the draw, proudly sponsored by <strong>${v.sponsor}</strong>.</p>` : '')
  const closesLine = v.closes
    ? `<p style="margin:0;font-size:13px;color:#6b7280;">Entries lock <strong>${v.closes}</strong> — your picks are saved until then, so you can still tweak your bracket.</p>`
    : `<p style="margin:0;font-size:13px;color:#6b7280;">Your picks are saved — you can still tweak your bracket until the knockouts kick off.</p>`

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#ffffff;">
  <div style="text-align:center;margin-bottom:20px;">
    <img src="https://tribepicks.com/logo.png" alt="TribePicks" height="80" style="display:inline-block;"/>
  </div>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px;"/>
  <p style="margin:0 0 6px;font-size:18px;font-weight:900;color:#111827;">${greeting} you're entered! 🎉</p>
  <p style="margin:0 0 16px;font-size:15px;color:#374151;">Your bracket is locked into the <strong>${v.challengeName}</strong>.</p>
  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:18px 20px;margin-bottom:20px;">
    ${prizeLine}
    ${closesLine}
  </div>
  ${v.summary ? summaryBlock(v.summary) : ''}
  <div style="text-align:center;margin-bottom:24px;">
    <a href="${v.leaderUrl}" style="display:inline-block;padding:12px 30px;background:#16a34a;color:#ffffff;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;">View the leaderboard →</a>
  </div>
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
