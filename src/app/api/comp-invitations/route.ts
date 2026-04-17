import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// Helper: verify caller is comp admin (or tournament admin)
async function verifyCompAdmin(userId: string, compId: string) {
  const admin = createAdminClient()
  const [{ data: compAdmin }, { data: tournAdmin }] = await Promise.all([
    (admin.from('comp_admins') as any).select('comp_id').eq('user_id', userId).eq('comp_id', compId).single(),
    admin.from('admin_users').select('user_id').eq('user_id', userId).single(),
  ])
  return !!(compAdmin || tournAdmin)
}

// GET /api/comp-invitations?comp_id=  — list all invitations for a comp
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const compId = new URL(request.url).searchParams.get('comp_id')
  if (!compId) return NextResponse.json({ error: 'comp_id required' }, { status: 400 })

  if (!(await verifyCompAdmin(user.id, compId)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await (admin.from('comp_invitations') as any)
    .select('id, email, invited_at, joined_at, user_id, users(display_name)')
    .eq('comp_id', compId)
    .order('invited_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data: (data ?? []).map((row: any) => ({
      id:           row.id,
      email:        row.email,
      invited_at:   row.invited_at,
      joined_at:    row.joined_at,
      user_id:      row.user_id,
      display_name: row.users?.display_name ?? null,
      joined:       !!row.joined_at,
    }))
  })
}

// POST /api/comp-invitations — create invitation(s) and send email
// Body: { comp_id, emails: string[] }
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const { comp_id, emails } = body
  if (!comp_id || !Array.isArray(emails) || emails.length === 0)
    return NextResponse.json({ error: 'comp_id and emails[] required' }, { status: 400 })

  if (!(await verifyCompAdmin(user.id, comp_id)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()

  // Get comp details for the invite email
  const { data: comp } = await (admin.from('comps') as any)
    .select('id, name, invite_code').eq('id', comp_id).single()
  if (!comp) return NextResponse.json({ error: 'Comp not found' }, { status: 404 })

  // Get inviter's display name
  const { data: inviter } = await (admin.from('users') as any)
    .select('display_name').eq('id', user.id).single()
  const inviterName = (inviter as any)?.display_name ?? 'A comp admin'

  const results: { email: string; status: 'invited' | 'already_invited' | 'error'; id?: string }[] = []

  for (const rawEmail of emails) {
    const email = rawEmail.trim().toLowerCase()
    if (!email || !/\S+@\S+\.\S+/.test(email)) continue

    // Check if already invited
    const { data: existing } = await (admin.from('comp_invitations') as any)
      .select('id').eq('comp_id', comp_id).eq('email', email).maybeSingle()
    if (existing) { results.push({ email, status: 'already_invited', id: existing.id }); continue }

    // Check if already a registered user on the app
    const authUsers = await admin.auth.admin.listUsers()
    const matchedUser = authUsers.data?.users?.find((u: any) => u.email?.toLowerCase() === email)

    // Insert invitation row
    const { data: inv, error: invErr } = await (admin.from('comp_invitations') as any)
      .insert({
        comp_id,
        email,
        invited_by: user.id,
        user_id: matchedUser?.id ?? null,
      })
      .select('id')
      .single()

    if (invErr) { results.push({ email, status: 'error' }); continue }

    // Send invitation email via announcements API (or direct via Supabase mailer)
    // For now we store the invite and note whether the user exists on the app
    // Email delivery can be wired to Resend/SendGrid via a separate service
    results.push({ email, status: 'invited', id: (inv as any).id })
  }

  const invited = results.filter(r => r.status === 'invited').length
  const already = results.filter(r => r.status === 'already_invited').length

  return NextResponse.json({ results, invited, already })
}

// DELETE /api/comp-invitations?id=  — remove an invitation
export async function DELETE(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const admin = createAdminClient()

  // Get the invitation to verify comp admin access
  const { data: inv } = await (admin.from('comp_invitations') as any)
    .select('comp_id').eq('id', id).single()
  if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!(await verifyCompAdmin(user.id, (inv as any).comp_id)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await (admin.from('comp_invitations') as any).delete().eq('id', id)
  return NextResponse.json({ success: true })
}
