/**
 * Timezone utilities — format fixture dates/times in the player's local timezone
 */

export const TIMEZONES = [
  { label: 'UTC',                     value: 'UTC' },
  { label: 'London (GMT/BST)',         value: 'Europe/London' },
  { label: 'Paris / Berlin (CET)',     value: 'Europe/Paris' },
  { label: 'Athens / Helsinki (EET)',  value: 'Europe/Athens' },
  { label: 'Moscow (MSK)',             value: 'Europe/Moscow' },
  { label: 'Dubai (GST)',              value: 'Asia/Dubai' },
  { label: 'Karachi (PKT)',            value: 'Asia/Karachi' },
  { label: 'Mumbai / Delhi (IST)',     value: 'Asia/Kolkata' },
  { label: 'Dhaka (BST)',              value: 'Asia/Dhaka' },
  { label: 'Bangkok (ICT)',            value: 'Asia/Bangkok' },
  { label: 'Singapore / KL (SGT)',     value: 'Asia/Singapore' },
  { label: 'Tokyo / Seoul (JST/KST)',  value: 'Asia/Tokyo' },
  { label: 'Sydney (AEST)',            value: 'Australia/Sydney' },
  { label: 'Auckland (NZST)',          value: 'Pacific/Auckland' },
  { label: 'Honolulu (HST)',           value: 'Pacific/Honolulu' },
  { label: 'Anchorage (AKST)',         value: 'America/Anchorage' },
  { label: 'Los Angeles / Vancouver (PT)', value: 'America/Los_Angeles' },
  { label: 'Denver (MT)',              value: 'America/Denver' },
  { label: 'Chicago / Mexico City (CT)', value: 'America/Chicago' },
  { label: 'New York / Toronto (ET)',  value: 'America/New_York' },
  { label: 'São Paulo (BRT)',          value: 'America/Sao_Paulo' },
  { label: 'Buenos Aires (ART)',       value: 'America/Argentina/Buenos_Aires' },
  { label: 'Lagos / Johannesburg (WAT/SAST)', value: 'Africa/Lagos' },
  { label: 'Nairobi (EAT)',            value: 'Africa/Nairobi' },
  { label: 'Cairo (EET)',              value: 'Africa/Cairo' },
  { label: 'Mauritius (MUT)',          value: 'Indian/Mauritius' },
]

export const COUNTRIES = [
  'Afghanistan','Albania','Algeria','Angola','Argentina','Armenia','Australia',
  'Austria','Azerbaijan','Bahrain','Bangladesh','Belarus','Belgium','Bolivia',
  'Bosnia and Herzegovina','Brazil','Bulgaria','Cambodia','Cameroon','Canada',
  'Chile','China','Colombia','Croatia','Cuba','Czech Republic','Denmark',
  'DR Congo','Ecuador','Egypt','El Salvador','Ethiopia','Finland','France',
  'Georgia','Germany','Ghana','Greece','Guatemala','Haiti','Honduras','Hungary',
  'India','Indonesia','Iran','Iraq','Ireland','Israel','Italy','Ivory Coast',
  'Jamaica','Japan','Jordan','Kazakhstan','Kenya','Kuwait','Lebanon','Libya',
  'Malaysia','Mauritius','Mexico','Moldova','Mongolia','Morocco','Mozambique',
  'Myanmar','Nepal','Netherlands','New Zealand','Nigeria','North Korea','Norway',
  'Oman','Pakistan','Panama','Paraguay','Peru','Philippines','Poland','Portugal',
  'Qatar','Romania','Russia','Rwanda','Saudi Arabia','Senegal','Serbia',
  'Singapore','Slovakia','Slovenia','Somalia','South Africa','South Korea',
  'South Sudan','Spain','Sri Lanka','Sudan','Sweden','Switzerland','Syria',
  'Taiwan','Tanzania','Thailand','Tunisia','Turkey','Uganda','Ukraine',
  'United Arab Emirates','United Kingdom','United States','Uruguay','Uzbekistan',
  'Venezuela','Vietnam','Yemen','Zimbabwe',
].sort()

/**
 * Format a UTC ISO datetime string into the player's local timezone.
 * Returns e.g. "Thu 11 Jun · 9:00 PM"
 */
export function formatKickoff(
  kickoff_utc: string,
  timezone: string,
  opts: { date?: boolean; time?: boolean; short?: boolean } = { date: true, time: true }
): string {
  const tz = timezone || 'UTC'
  const dt = new Date(kickoff_utc)

  try {
    const parts: string[] = []

    if (opts.date !== false) {
      const datePart = dt.toLocaleDateString('en-GB', {
        timeZone: tz,
        weekday: opts.short ? undefined : 'short',
        day:     'numeric',
        month:   'short',
      })
      parts.push(datePart)
    }

    if (opts.time !== false) {
      const timePart = dt.toLocaleTimeString('en-GB', {
        timeZone: tz,
        hour:   '2-digit',
        minute: '2-digit',
        hour12: true,
      })
      parts.push(timePart)
    }

    return parts.join(' · ')
  } catch {
    // Fallback if timezone is invalid
    return dt.toUTCString().slice(0, 22)
  }
}

/**
 * Get just the date label for grouping fixtures
 * e.g. "Thu, 11 Jun"
 */
export function formatDate(kickoff_utc: string, timezone: string): string {
  return formatKickoff(kickoff_utc, timezone, { date: true, time: false })
}

/**
 * Detect browser timezone — used as default when registering
 */
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}
