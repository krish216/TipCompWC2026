// Per-challenge custom team visuals — stored in the shared public org-logos bucket
// under a folder per challenge slug, so re-uploads overwrite cleanly:
//   org-logos/challenges/{slug}/{home|away}.{ext}

export const CHALLENGE_IMAGE_BUCKET = 'org-logos'

export function challengeTeamImagePath(slug: string, side: 'home' | 'away', ext: string): string {
  const safeExt = (ext || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png'
  return `challenges/${slug}/${side}.${safeExt}`
}
