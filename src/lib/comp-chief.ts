// Comp-Chief identity resolver — the "Chief" is the person who runs a comp.
//
// A comp points at its owner two ways: `created_by` (a registered users row) and, for
// self-created/imported comps, a free-text `owner_name` captured at creation. We prefer
// the registered account's public display_name + avatar, and fall back to owner_name.
// This is the single source of truth for surfacing "🧑‍✈️ Run by [name]" to members.

export interface CompChief {
  id:         string | null   // the Chief's user id when registered → links to /chief/[id]
  name:       string
  avatar_url: string | null
  country:    string | null
  registered: boolean   // true when resolved from a registered user account (has avatar/country)
  verified:   boolean   // confirmed email AND ≥5 active tipsters led — "a real, established Chief"
}

// The automatic ✔ Verified bar: a confirmed email plus a genuine track record, so a
// throwaway account can't fake it and the badge means "real, established Chief".
export const VERIFIED_MIN_ACTIVE = 5

interface ChiefSource { id: string; created_by?: string | null; owner_name?: string | null }

// Resolve the Chief for many comps in ONE users query (avoids N round-trips on Explore).
export async function resolveCompChiefs(admin: any, comps: ChiefSource[]): Promise<Map<string, CompChief>> {
  const ids = [...new Set(comps.map(c => c.created_by).filter(Boolean))] as string[]
  const users = new Map<string, any>()
  const active = new Map<string, number>()
  if (ids.length) {
    const [{ data: us }, { data: cs }] = await Promise.all([
      admin.from('users').select('id, display_name, avatar_url, country, email_verified').in('id', ids),
      // Track record for the ✔ Verified check — tolerant (empty if the view isn't refreshed).
      admin.from('chief_scores').select('chief_id, active_tipsters').in('chief_id', ids),
    ])
    for (const u of (us ?? []) as any[]) users.set(u.id, u)
    for (const r of (cs ?? []) as any[]) active.set(r.chief_id, r.active_tipsters ?? 0)
  }
  const out = new Map<string, CompChief>()
  for (const c of comps) {
    const u = c.created_by ? users.get(c.created_by) : null
    if (u?.display_name) {
      const verified = !!u.email_verified && (active.get(u.id) ?? 0) >= VERIFIED_MIN_ACTIVE
      out.set(c.id, { id: u.id, name: u.display_name, avatar_url: u.avatar_url ?? null, country: u.country ?? null, registered: true, verified })
    } else if (c.owner_name) {
      out.set(c.id, { id: null, name: c.owner_name, avatar_url: null, country: null, registered: false, verified: false })
    } else {
      out.set(c.id, { id: null, name: 'the Comp Chief', avatar_url: null, country: null, registered: false, verified: false })
    }
  }
  return out
}

export async function resolveCompChief(admin: any, comp: ChiefSource): Promise<CompChief> {
  return (await resolveCompChiefs(admin, [comp])).get(comp.id)!
}

// Build a Resend "from" that attributes the email to the Chief while keeping the verified
// sending address: "Kewell_Runnings via TribePicks <noreply@mail.tribepicks.com>".
export function chiefFromLine(chiefName: string, fromEnv?: string): string {
  const from    = fromEnv ?? process.env.RESEND_FROM ?? 'TribePicks <noreply@mail.tribepicks.com>'
  const address = from.match(/<(.+)>/)?.[1] ?? from
  const clean   = chiefName.replace(/[<>"\n\r]/g, '').trim() || 'Your Comp Chief'
  return `${clean} via TribePicks <${address}>`
}

// SERVER-ONLY contact for outreach attribution (email reply-to). Includes the Chief's
// email — NEVER return this to the client / public endpoints. Prefers the registered
// creator's display_name + account email; falls back to the comp's owner_name/owner_email.
export interface CompChiefContact { name: string; email: string | null }
export async function resolveCompChiefContact(
  admin: any,
  comp: { created_by?: string | null; owner_name?: string | null; owner_email?: string | null },
): Promise<CompChiefContact> {
  let name  = comp.owner_name ?? null
  let email = comp.owner_email ?? null
  if (comp.created_by) {
    const { data } = await admin.from('users').select('display_name, email').eq('id', comp.created_by).maybeSingle()
    if (data?.display_name) name  = data.display_name
    if (data?.email)        email = data.email
  }
  return { name: name?.trim() || 'Your Comp Chief', email: email ?? null }
}
