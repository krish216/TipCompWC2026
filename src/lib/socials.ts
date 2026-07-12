// Comp-Chief social links — the curated set, plus host-validation shared by the Settings
// editor (validate before save) and the profile (validate before render). Only a link
// whose host matches the platform (https) is ever stored or shown, so a pasted junk/
// malicious URL can't masquerade as a trusted platform link.

export interface SocialDef {
  key:         string
  label:       string
  short:       string   // compact glyph shown in the icon button
  color:       string   // brand background
  hosts:       RegExp
  placeholder: string
}

export const SOCIALS: SocialDef[] = [
  { key: 'x',         label: 'X',         short: '𝕏',  color: '#000000', hosts: /^(www\.)?(x|twitter)\.com$/i,          placeholder: 'https://x.com/yourhandle' },
  { key: 'instagram', label: 'Instagram', short: 'IG', color: '#E1306C', hosts: /^(www\.)?instagram\.com$/i,            placeholder: 'https://instagram.com/yourhandle' },
  { key: 'tiktok',    label: 'TikTok',    short: 'TT', color: '#111111', hosts: /^(www\.)?tiktok\.com$/i,               placeholder: 'https://tiktok.com/@yourhandle' },
  { key: 'youtube',   label: 'YouTube',   short: 'YT', color: '#FF0000', hosts: /^(www\.)?(youtube\.com|youtu\.be)$/i,  placeholder: 'https://youtube.com/@yourchannel' },
  { key: 'facebook',  label: 'Facebook',  short: 'f',  color: '#1877F2', hosts: /^(www\.)?(facebook\.com|fb\.com)$/i,   placeholder: 'https://facebook.com/yourpage' },
  { key: 'website',   label: 'Website',   short: '🌐', color: '#4B5563', hosts: /.+\..+/,                              placeholder: 'https://yoursite.com' },
]

// Validate one link for a platform → canonical https URL, or null if it doesn't fit.
export function normalizeSocial(key: string, raw: string | null | undefined): string | null {
  const def = SOCIALS.find(s => s.key === key)
  if (!def || !raw || !raw.trim()) return null
  try {
    const u = new URL(raw.trim())
    if (u.protocol !== 'https:') return null
    if (!def.hosts.test(u.hostname)) return null
    return u.toString()
  } catch { return null }
}

// For save: keep only valid entries (drops blanks + anything that fails host-validation).
export function cleanSocials(input: Record<string, string | null | undefined> | null): Record<string, string> {
  const out: Record<string, string> = {}
  for (const def of SOCIALS) {
    const v = normalizeSocial(def.key, input?.[def.key])
    if (v) out[def.key] = v
  }
  return out
}

// For render: ordered, validated links only.
export function socialLinks(socials: any): { key: string; url: string; label: string; short: string; color: string }[] {
  if (!socials || typeof socials !== 'object') return []
  const out: { key: string; url: string; label: string; short: string; color: string }[] = []
  for (const def of SOCIALS) {
    const v = normalizeSocial(def.key, socials[def.key])
    if (v) out.push({ key: def.key, url: v, label: def.label, short: def.short, color: def.color })
  }
  return out
}
