import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase'
import { establishSessionFor } from '@/lib/bracket/establish-session'
import { enrolInTournament } from '@/lib/enrol-tournament'
import { enterMatchChallenge } from '@/lib/match/enter'
import { sendMatchEntryConfirmation } from '@/lib/match/entry-confirmation'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const FROM = process.env.RESEND_FROM ?? 'TribePicks <noreply@mail.tribepicks.com>'

// Guest → account conversion for a single-match challenge. Mirrors the bracket
// guest-enter flow: a 6-digit code (sent via /api/bracket/send-code) proves email
// ownership, so we can find-or-create the account, save the prediction, and sign
// them straight into this browser — no "claim your account" round-trip. If the
// session can't be set, we email a magic sign-in link so they're never locked out.
export async function POST(request: NextRequest) {
  const origin = new URL(request.url).origin
  const body   = await request.json().catch(() => ({} as any))

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })

  const displayName = typeof body.name === 'string' ? body.name.trim() : ''
  if (displayName.length < 2) return NextResponse.json({ error: 'Enter your name.' }, { status: 400 })

  const admin = createAdminClient()

  // ── Verify the emailed code before doing anything ────────────────────────────
  const code = typeof body.code === 'string' ? body.code.trim() : ''
  const { data: codeRow } = await (admin.from('email_codes') as any).select('code, expires_at, attempts').eq('email', email).maybeSingle()
  if (!codeRow) return NextResponse.json({ error: 'Request a verification code first.' }, { status: 400 })
  if (new Date((codeRow as any).expires_at).getTime() < Date.now())
    return NextResponse.json({ error: 'Your code expired — request a new one.' }, { status: 400 })
  if ((codeRow as any).attempts >= 5)
    return NextResponse.json({ error: 'Too many tries — request a new code.' }, { status: 429 })
  if (!code || code !== (codeRow as any).code) {
    await (admin.from('email_codes') as any).update({ attempts: ((codeRow as any).attempts ?? 0) + 1 }).eq('email', email)
    return NextResponse.json({ error: 'That code isn’t right — check your email and try again.' }, { status: 401 })
  }
  await (admin.from('email_codes') as any).delete().eq('email', email)

  // ── Resolve the account (email ownership proven) ─────────────────────────────
  const { data: existing } = await admin.from('users').select('id').ilike('email', email).maybeSingle()
  const isExisting = !!existing
  let userId = (existing as any)?.id as string | undefined

  if (!userId) {
    const { data: created, error: createErr } = await (admin.auth.admin as any).createUser({
      email, email_confirm: true,
      user_metadata: { display_name: displayName, signup_flow: 'match_guest' },
    })
    if (createErr || !created?.user?.id) {
      if ((createErr?.message ?? '').toLowerCase().includes('already')) {
        const { data: raced } = await admin.from('users').select('id').ilike('email', email).maybeSingle()
        userId = (raced as any)?.id
      }
      if (!userId) return NextResponse.json({ error: 'Could not create your account — please try again.' }, { status: 500 })
    } else {
      userId = created.user.id as string
      await (admin.from('users') as any).upsert({
        id: userId, email, display_name: displayName,
        first_name: typeof body.first_name === 'string' && body.first_name.trim() ? body.first_name.trim() : null,
        timezone: typeof body.timezone === 'string' && body.timezone ? body.timezone : 'UTC',
        onboarding_complete: false, email_verified: true, role: 'tipster', signup_flow: 'match_guest',
        ...(typeof body.source === 'string' && body.source ? { ref_source: body.source } : {}),
      }, { onConflict: 'id', ignoreDuplicates: false })
    }
  }

  // ── Save the prediction (validates lock / scoreline / consent / prize rules) ──
  const entry = await enterMatchChallenge(admin, { body, userId: userId!, source: 'guest' })
  if (!entry.ok) return NextResponse.json({ error: entry.error }, { status: entry.status })

  const tid = entry.challenge!.tournament_id
  // Enrol so they're a fully tracked player (awaited — a fire-and-forget fetch is
  // dropped when the serverless function returns). Never lose the entry over this.
  const enrol = await enrolInTournament(admin, { userId: userId!, tournamentId: tid })
  if (!enrol.ok) console.error('[match/guest-enter] enrol failed:', enrol.error, 'user:', userId)

  const inLine = entry.hasPrize ? 'You’re in the draw!' : 'You’re in!'
  const next   = entry.redirect ?? `/match/${entry.challenge!.slug}`

  // ── Sign them straight in ────────────────────────────────────────────────────
  const signedIn = await establishSessionFor(admin, email)
  if (signedIn) {
    // Confirmation email (first entry only) — the fallback branch below already emails
    // a sign-in link, so we only send the receipt on the signed-in path.
    if (entry.created) {
      sendMatchEntryConfirmation(admin, { email, name: displayName, userId: userId!, slug: entry.challenge!.slug, origin }).catch(() => {})
    }
    return NextResponse.json({ status: 'signed_in', redirect: next, message: `${inLine} You’re signed in — here’s the leaderboard.` })
  }

  // Fallback: email a magic sign-in link so they can reach their entry.
  try {
    if (process.env.RESEND_API_KEY) {
      const { data } = await (admin.auth.admin as any).generateLink({ type: 'magiclink', email, options: { redirectTo: `${origin}${next}` } })
      const link = (data as any)?.properties?.action_link
      if (link) {
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: FROM, to: email, subject: `${inLine} Your match prediction is in 🎯`,
          html: `<!DOCTYPE html><html><body style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
            <p style="font-size:20px;font-weight:900;color:#065f46;margin:0 0 4px;">TribePicks</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:14px 0 20px;"/>
            <p style="font-size:15px;color:#111827;margin:0 0 8px;">${inLine} Your prediction for <strong>${entry.challenge!.name}</strong> is locked in.</p>
            <p style="font-size:14px;color:#374151;margin:0 0 20px;">Tap below to sign in and follow the leaderboard.</p>
            <p style="margin:0 0 24px;"><a href="${link}" style="display:inline-block;background:#059669;color:#fff;font-weight:800;font-size:15px;text-decoration:none;padding:12px 22px;border-radius:10px;">Open the leaderboard →</a></p>
            <p style="font-size:12px;color:#6b7280;margin:0;">If you didn't enter this, you can ignore this email.</p>
          </body></html>`,
        })
      }
    }
  } catch { /* best-effort — the entry is already saved */ }

  return NextResponse.json({
    status: isExisting ? 'existing' : 'created',
    email_sent: true,
    message: `${inLine} Check your email — we’ve sent a link to sign in and follow the leaderboard.`,
  })
}
