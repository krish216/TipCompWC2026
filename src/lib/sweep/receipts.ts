import { SWEEP_RECEIPTS_BUCKET } from '@/lib/sweep/storage'

// sweep_payment_requests.receipt_url is stored as a storage PATH, never a baked URL (signed
// URLs expire) — resolve to a fresh signed URL per read, only for rows that have one.
export async function signReceiptUrls(admin: any, rows: any[]): Promise<any[]> {
  const withReceipt = rows.filter(r => r.receipt_url)
  if (!withReceipt.length) return rows
  const signed = await Promise.all(withReceipt.map((r: any) =>
    admin.storage.from(SWEEP_RECEIPTS_BUCKET).createSignedUrl(r.receipt_url, 600)))
  const urlByPath: Record<string, string> = {}
  withReceipt.forEach((r: any, i: number) => { urlByPath[r.receipt_url] = signed[i]?.data?.signedUrl ?? '' })
  return rows.map(r => r.receipt_url ? { ...r, receipt_url: urlByPath[r.receipt_url] || null } : r)
}
