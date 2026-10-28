// Sweep payment requests — receipt image storage.
// Receipts are financial proof, unlike logos/avatars (org-logos, public-read) — they live
// in their own private bucket, namespaced per uploader:
//   sweep-receipts/{user_id}/{request_id}.{ext}
// Reads happen via signed URLs minted by the API (see requests/[reqId]/receipt/route.ts),
// never via a public URL.

export const SWEEP_RECEIPTS_BUCKET = 'sweep-receipts'

export function receiptPath(userId: string, requestId: string, ext: string): string {
  const safeExt = (ext || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg'
  return `${userId}/${requestId}.${safeExt}`
}
