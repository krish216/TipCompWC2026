// Sweep organiser payment/contact details + the approval-window rule. The details live in
// sweep_organiser_details (migration 195), NOT on comps — comps is publicly readable, so
// bank details and phone numbers must stay behind these service-role reads.

export const APPROVAL_WINDOWS = [2, 6, 12, 24] as const
export const DEFAULT_APPROVAL_WINDOW = 12
// The cron auto-lock closes a pool this long before race_start_at (see /api/cron/sweep-auto-lock).
export const AUTO_LOCK_BEFORE_MS = 30 * 60 * 1000

export type OrganiserDetails = {
  approval_window_hours: number
  bank_account_name:     string | null
  bank_bsb:              string | null
  bank_account_number:   string | null
  payid:                 string | null
  contact_name:          string | null
  contact_phone:         string | null
  contact_email:         string | null
  bank_shared_directly:  boolean   // migration 202: organiser gives buyers bank details themselves
}

const EMPTY: OrganiserDetails = {
  approval_window_hours: DEFAULT_APPROVAL_WINDOW,
  bank_account_name: null, bank_bsb: null, bank_account_number: null, payid: null,
  contact_name: null, contact_phone: null, contact_email: null, bank_shared_directly: false,
}

const DETAIL_COLS = 'approval_window_hours, bank_account_name, bank_bsb, bank_account_number, payid, contact_name, contact_phone, contact_email'

// Never throws — a missing row (or the table not existing yet, pre-migration) just means
// "nothing set up", so callers fall back to the defaults.
export async function getOrganiserDetails(admin: any, compId: string): Promise<OrganiserDetails> {
  const table = () => (admin.from('sweep_organiser_details') as any)
  let { data, error } = await table().select(`${DETAIL_COLS}, bank_shared_directly`).eq('comp_id', compId).maybeSingle()
  // Before migration 202 the column doesn't exist — read the rest rather than lose it all.
  if (error) ({ data, error } = await table().select(DETAIL_COLS).eq('comp_id', compId).maybeSingle())
  if (error || !data) return { ...EMPTY }
  return { ...EMPTY, ...data }
}

// PayID comes in three everyday forms. The kind isn't stored — it's read off the value, so
// a mobile, an email and an ABN can't be confused for one another.
export type PayIdKind = 'mobile' | 'email' | 'abn'

export function payIdKind(value: string | null): PayIdKind | null {
  if (!value) return null
  if (value.includes('@')) return 'email'
  const digits = value.replace(/\D/g, '')
  // Saved mobiles are always "04…" (10 digits); "+614…" is a mobile typed internationally.
  // Any other 11 digits is an ABN — including one that happens to start 614.
  if (digits.length === 11 && !value.trim().startsWith('+')) return 'abn'
  return 'mobile'
}

// Validates + normalises a PayID for the given kind. Mobile → "0412 345 678" (accepts
// +61 / 61 prefixes); ABN → "12 345 678 901"; email → trimmed lower-case.
export function normalisePayId(kind: PayIdKind, raw: string): { value: string } | { error: string } {
  const v = raw.trim()
  if (kind === 'email') {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? { value: v.toLowerCase() } : { error: "That PayID email doesn't look right." }
  }
  let digits = v.replace(/\D/g, '')
  if (kind === 'abn') {
    return digits.length === 11
      ? { value: `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}` }
      : { error: 'An ABN PayID is 11 digits.' }
  }
  if (digits.startsWith('61') && digits.length === 11) digits = `0${digits.slice(2)}`
  return /^04\d{8}$/.test(digits)
    ? { value: `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}` }
    : { error: 'A mobile PayID looks like 0412 345 678.' }
}

// Bank transfer is only offerable once the buyer can be told where to send the money.
export function hasPaymentDetails(d: OrganiserDetails): boolean {
  return !!(d.bank_account_name && ((d.bank_bsb && d.bank_account_number) || d.payid))
}

// Bank transfer is on offer when buyers can find out where to pay: details shown on the
// page, or the organiser has confirmed they share them directly.
export function bankTransferEnabled(d: OrganiserDetails): boolean {
  return hasPaymentDetails(d) || d.bank_shared_directly
}

export function hasContact(d: OrganiserDetails): boolean {
  return !!(d.contact_phone || d.contact_email)
}

// The moment a request's approval clock starts: when it became reviewable. A bank transfer
// isn't reviewable until its receipt is attached; cash is reviewable from submission.
export function approvalClockStart(r: { created_at: string; receipt_attached_at?: string | null }): string {
  return r.receipt_attached_at ?? r.created_at
}

// When a pending request "should" have been approved by: its window from when it became
// reviewable, but never later than the pool's auto-lock — a 24h window promised the night
// before the race would otherwise land after it.
export function approvalDeadline(startAt: string, windowHours: number, raceStartAt: string | null): Date {
  const byWindow = new Date(startAt).getTime() + windowHours * 60 * 60 * 1000
  const byLock = raceStartAt ? new Date(raceStartAt).getTime() - AUTO_LOCK_BEFORE_MS : Infinity
  return new Date(Math.min(byWindow, byLock))
}
