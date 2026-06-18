import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { toSlug } from '@/lib/sponsors/campaigns'
import { createNotifications } from '@/lib/notifications'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// POST /api/sponsors/enquiry  (PUBLIC) — sponsor lead capture.
// Body: { company, contact_name?, contact_email, phone?, website_url?, message? }
// Creates a sponsors row with status='lead' and notifies admins in-app.
export async function POST(request: NextRequest) {
  const admin = createAdminClient()
  const b = await request.json().catch(() => ({}))

  const company = String(b.company ?? b.name ?? '').trim()
  const email   = String(b.contact_email ?? '').trim()
  if (!company) return NextResponse.json({ error: 'Company name required' }, { status: 400 })
  if (!email)   return NextResponse.json({ error: 'Contact email required' }, { status: 400 })

  // Unique slug (leads share the namespace with active sponsors).
  const base = toSlug(company)
  let slug = base
  for (let n = 2; n < 100; n++) {
    const { data: clash } = await (admin.from('sponsors') as any).select('id').eq('slug', slug).maybeSingle()
    if (!clash) break
    slug = `${base}-${n}`
  }

  const now = new Date().toISOString()
  const message = String(b.message ?? '').trim()
  const { data: sponsor, error } = await (admin.from('sponsors') as any).insert({
    slug,
    name:          company,
    contact_name:  b.contact_name?.trim() || null,
    contact_email: email,
    phone:         b.phone?.trim()        || null,
    website_url:   b.website_url?.trim()  || null,
    status:        'lead',
    notes:         message ? `Enquiry: ${message}` : null,
    created_at:    now,
    updated_at:    now,
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify all admins in-app (best-effort; never blocks the response).
  try {
    const { data: admins } = await (admin.from('admin_users') as any).select('user_id')
    const ids = ((admins ?? []) as any[]).map(a => a.user_id).filter(Boolean)
    if (ids.length) {
      await createNotifications(ids.map((user_id: string) => ({
        user_id,
        type:  'sponsor_lead' as const,
        title: '🤝 New sponsor enquiry',
        body:  `${company} wants to sponsor a challenge — review the lead.`,
        data:  { href: `/admin/sponsors?lead=${(sponsor as any).id}` },
      })))
    }
  } catch { /* non-critical */ }

  return NextResponse.json({ ok: true })
}
