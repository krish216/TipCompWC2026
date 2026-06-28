// WC 2026 team → flag emoji. Single source of truth so the bracket page and the
// bracket leaderboard scorecard render identical flags.
export const TEAM_FLAGS: Record<string, string> = {
  'Mexico': '🇲🇽', 'South Korea': '🇰🇷', 'South Africa': '🇿🇦', 'Czechia': '🇨🇿',
  'Canada': '🇨🇦', 'Qatar': '🇶🇦', 'Switzerland': '🇨🇭', 'Bosnia and Herzegovina': '🇧🇦',
  'Brazil': '🇧🇷', 'Morocco': '🇲🇦', 'Haiti': '🇭🇹', 'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'USA': '🇺🇸', 'Paraguay': '🇵🇾', 'Australia': '🇦🇺', 'Turkey': '🇹🇷',
  'Germany': '🇩🇪', 'Ivory Coast': '🇨🇮', 'Ecuador': '🇪🇨', 'Curacao': '🏝️',
  'Netherlands': '🇳🇱', 'Japan': '🇯🇵', 'Tunisia': '🇹🇳', 'Sweden': '🇸🇪',
  'Belgium': '🇧🇪', 'Egypt': '🇪🇬', 'Iran': '🇮🇷', 'New Zealand': '🇳🇿',
  'Spain': '🇪🇸', 'Cabo Verde': '🇨🇻', 'Saudi Arabia': '🇸🇦', 'Uruguay': '🇺🇾',
  'France': '🇫🇷', 'Senegal': '🇸🇳', 'Norway': '🇳🇴', 'Iraq': '🇮🇶',
  'Argentina': '🇦🇷', 'Algeria': '🇩🇿', 'Austria': '🇦🇹', 'Jordan': '🇯🇴',
  'Portugal': '🇵🇹', 'Uzbekistan': '🇺🇿', 'Colombia': '🇨🇴', 'DR Congo': '🇨🇩',
  'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Croatia': '🇭🇷', 'Ghana': '🇬🇭', 'Panama': '🇵🇦',
}

export function flagFor(name: string | null | undefined): string {
  if (!name) return '🏳️'
  return TEAM_FLAGS[name] ?? '🏳️'
}

// Team name → flag-icons code (ISO 3166-1 alpha-2, lowercase; gb-eng/gb-sct for
// home nations). Used by the <Flag> component to render real image flags, which
// — unlike emoji flags — render on every OS (Windows ships no flag glyphs).
export const TEAM_ISO: Record<string, string> = {
  'Mexico': 'mx', 'South Korea': 'kr', 'South Africa': 'za', 'Czechia': 'cz',
  'Canada': 'ca', 'Qatar': 'qa', 'Switzerland': 'ch', 'Bosnia and Herzegovina': 'ba',
  'Brazil': 'br', 'Morocco': 'ma', 'Haiti': 'ht', 'Scotland': 'gb-sct',
  'USA': 'us', 'Paraguay': 'py', 'Australia': 'au', 'Turkey': 'tr',
  'Germany': 'de', 'Ivory Coast': 'ci', 'Ecuador': 'ec', 'Curacao': 'cw',
  'Netherlands': 'nl', 'Japan': 'jp', 'Tunisia': 'tn', 'Sweden': 'se',
  'Belgium': 'be', 'Egypt': 'eg', 'Iran': 'ir', 'New Zealand': 'nz',
  'Spain': 'es', 'Cabo Verde': 'cv', 'Saudi Arabia': 'sa', 'Uruguay': 'uy',
  'France': 'fr', 'Senegal': 'sn', 'Norway': 'no', 'Iraq': 'iq',
  'Argentina': 'ar', 'Algeria': 'dz', 'Austria': 'at', 'Jordan': 'jo',
  'Portugal': 'pt', 'Uzbekistan': 'uz', 'Colombia': 'co', 'DR Congo': 'cd',
  'England': 'gb-eng', 'Croatia': 'hr', 'Ghana': 'gh', 'Panama': 'pa',
}

// Name aliases that appear in fixtures/DB but differ from the canonical names above.
const TEAM_ISO_ALIASES: Record<string, string> = {
  'Türkiye': 'tr', 'Turkiye': 'tr',
  'United States': 'us', 'United States of America': 'us',
  'Bosnia & Herzegovina': 'ba', 'Bosnia': 'ba', 'Bosnia-Herzegovina': 'ba', 'Bosnia and Herzegovina ': 'ba',
  'Cape Verde': 'cv', 'Côte d’Ivoire': 'ci', "Cote d'Ivoire": 'ci',
  'Korea Republic': 'kr', 'South Korea ': 'kr',
  'IR Iran': 'ir', 'Czech Republic': 'cz', 'Curaçao': 'cw',
}

// Resolve a team name to a flag-icons code (or null when unknown).
export function isoFor(name: string | null | undefined): string | null {
  if (!name) return null
  const n = name.trim()
  return TEAM_ISO[n] ?? TEAM_ISO_ALIASES[n] ?? null
}
