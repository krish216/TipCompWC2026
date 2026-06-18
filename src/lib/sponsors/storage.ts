// Sponsor Campaigns module — per-sponsor asset storage.
// Logos live in the existing `org-logos` bucket under a folder per sponsor slug:
//   org-logos/sponsors/{slug}/logo.{ext}
// so a sponsor's assets are namespaced and re-uploads overwrite cleanly.

export const SPONSOR_BUCKET = 'org-logos'

export function sponsorLogoPath(slug: string, ext: string): string {
  const safeExt = (ext || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png'
  return `sponsors/${slug}/logo.${safeExt}`
}
