/**
 * Timezone utilities — format fixture dates/times in the player's local timezone
 */

export const TIMEZONES = [
  { label: 'UTC',                          value: 'UTC' },
  { label: 'London (GMT/BST)',              value: 'Europe/London' },
  { label: 'Paris / Berlin (CET)',          value: 'Europe/Paris' },
  { label: 'Athens / Helsinki (EET)',       value: 'Europe/Athens' },
  { label: 'Moscow (MSK)',                  value: 'Europe/Moscow' },
  { label: 'Dubai (GST)',                   value: 'Asia/Dubai' },
  { label: 'Karachi (PKT)',                 value: 'Asia/Karachi' },
  { label: 'Mumbai / Delhi (IST)',          value: 'Asia/Kolkata' },
  { label: 'Dhaka (BST)',                   value: 'Asia/Dhaka' },
  { label: 'Bangkok (ICT)',                 value: 'Asia/Bangkok' },
  { label: 'Singapore / KL (SGT)',          value: 'Asia/Singapore' },
  { label: 'Tokyo / Seoul (JST/KST)',       value: 'Asia/Tokyo' },
  { label: 'Sydney (AEST)',                 value: 'Australia/Sydney' },
  { label: 'Melbourne (AEST)',              value: 'Australia/Melbourne' },
  { label: 'Brisbane (AEST)',               value: 'Australia/Brisbane' },
  { label: 'Adelaide (ACST)',               value: 'Australia/Adelaide' },
  { label: 'Perth (AWST)',                  value: 'Australia/Perth' },
  { label: 'Darwin (ACST)',                 value: 'Australia/Darwin' },
  { label: 'Auckland (NZST)',               value: 'Pacific/Auckland' },
  { label: 'Honolulu (HST)',                value: 'Pacific/Honolulu' },
  { label: 'Anchorage (AKST)',              value: 'America/Anchorage' },
  { label: 'Los Angeles / Vancouver (PT)',  value: 'America/Los_Angeles' },
  { label: 'Denver (MT)',                   value: 'America/Denver' },
  { label: 'Chicago / Mexico City (CT)',    value: 'America/Chicago' },
  { label: 'New York / Toronto (ET)',       value: 'America/New_York' },
  { label: 'São Paulo (BRT)',               value: 'America/Sao_Paulo' },
  { label: 'Buenos Aires (ART)',            value: 'America/Argentina/Buenos_Aires' },
  { label: 'Lagos (WAT)',                   value: 'Africa/Lagos' },
  { label: 'Johannesburg (SAST)',           value: 'Africa/Johannesburg' },
  { label: 'Nairobi (EAT)',                 value: 'Africa/Nairobi' },
  { label: 'Cairo (EET)',                   value: 'Africa/Cairo' },
  { label: 'Mauritius (MUT)',               value: 'Indian/Mauritius' },
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

// Map countries to their relevant timezones
export const COUNTRY_TIMEZONES: Record<string, string[]> = {
  'Australia':         ['Australia/Sydney','Australia/Melbourne','Australia/Brisbane','Australia/Adelaide','Australia/Perth','Australia/Darwin'],
  'United States':     ['America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Anchorage','Pacific/Honolulu'],
  'Canada':            ['America/New_York','America/Toronto','America/Chicago','America/Winnipeg','America/Denver','America/Vancouver'],
  'United Kingdom':    ['Europe/London'],
  'Ireland':           ['Europe/London'],
  'France':            ['Europe/Paris'],
  'Germany':           ['Europe/Paris'],
  'Austria':           ['Europe/Paris'],
  'Switzerland':       ['Europe/Paris'],
  'Belgium':           ['Europe/Paris'],
  'Netherlands':       ['Europe/Paris'],
  'Italy':             ['Europe/Paris'],
  'Spain':             ['Europe/Paris'],
  'Portugal':          ['Europe/London'],
  'Poland':            ['Europe/Paris'],
  'Czech Republic':    ['Europe/Paris'],
  'Slovakia':          ['Europe/Paris'],
  'Hungary':           ['Europe/Paris'],
  'Croatia':           ['Europe/Paris'],
  'Serbia':            ['Europe/Paris'],
  'Bosnia and Herzegovina': ['Europe/Paris'],
  'Slovenia':          ['Europe/Paris'],
  'Romania':           ['Europe/Athens'],
  'Bulgaria':          ['Europe/Athens'],
  'Greece':            ['Europe/Athens'],
  'Finland':           ['Europe/Athens'],
  'Sweden':            ['Europe/Paris'],
  'Norway':            ['Europe/Paris'],
  'Denmark':           ['Europe/Paris'],
  'Russia':            ['Europe/Moscow'],
  'Ukraine':           ['Europe/Athens'],
  'Belarus':           ['Europe/Moscow'],
  'Georgia':           ['Asia/Dubai'],
  'Azerbaijan':        ['Asia/Dubai'],
  'Kazakhstan':        ['Asia/Dhaka'],
  'India':             ['Asia/Kolkata'],
  'Pakistan':          ['Asia/Karachi'],
  'Bangladesh':        ['Asia/Dhaka'],
  'Nepal':             ['Asia/Kolkata'],
  'Sri Lanka':         ['Asia/Kolkata'],
  'United Arab Emirates': ['Asia/Dubai'],
  'Saudi Arabia':      ['Asia/Dubai'],
  'Qatar':             ['Asia/Dubai'],
  'Kuwait':            ['Asia/Dubai'],
  'Bahrain':           ['Asia/Dubai'],
  'Oman':              ['Asia/Dubai'],
  'Iran':              ['Asia/Dubai'],
  'Iraq':              ['Asia/Dubai'],
  'Jordan':            ['Asia/Dubai'],
  'Lebanon':           ['Asia/Dubai'],
  'Israel':            ['Asia/Dubai'],
  'Egypt':             ['Africa/Cairo'],
  'Libya':             ['Africa/Cairo'],
  'Tunisia':           ['Europe/Paris'],
  'Algeria':           ['Europe/Paris'],
  'Morocco':           ['Europe/London'],
  'South Africa':      ['Africa/Johannesburg'],
  'Nigeria':           ['Africa/Lagos'],
  'Ghana':             ['UTC'],
  'Kenya':             ['Africa/Nairobi'],
  'Tanzania':          ['Africa/Nairobi'],
  'Uganda':            ['Africa/Nairobi'],
  'Ethiopia':          ['Africa/Nairobi'],
  'Rwanda':            ['Africa/Nairobi'],
  'Mauritius':         ['Indian/Mauritius'],
  'Mozambique':        ['Africa/Johannesburg'],
  'Zimbabwe':          ['Africa/Johannesburg'],
  'Senegal':           ['UTC'],
  'Ivory Coast':       ['UTC'],
  'Cameroon':          ['Africa/Lagos'],
  'DR Congo':          ['Africa/Lagos'],
  'Angola':            ['Africa/Lagos'],
  'Somalia':           ['Africa/Nairobi'],
  'South Sudan':       ['Africa/Nairobi'],
  'Sudan':             ['Africa/Nairobi'],
  'Japan':             ['Asia/Tokyo'],
  'South Korea':       ['Asia/Tokyo'],
  'North Korea':       ['Asia/Tokyo'],
  'China':             ['Asia/Singapore'],
  'Taiwan':            ['Asia/Singapore'],
  'Hong Kong':         ['Asia/Singapore'],
  'Singapore':         ['Asia/Singapore'],
  'Malaysia':          ['Asia/Singapore'],
  'Indonesia':         ['Asia/Singapore'],
  'Philippines':       ['Asia/Singapore'],
  'Thailand':          ['Asia/Bangkok'],
  'Vietnam':           ['Asia/Bangkok'],
  'Cambodia':          ['Asia/Bangkok'],
  'Myanmar':           ['Asia/Bangkok'],
  'Mongolia':          ['Asia/Singapore'],
  'New Zealand':       ['Pacific/Auckland'],
  'Mexico':            ['America/Chicago','America/Tijuana'],
  'Guatemala':         ['America/Chicago'],
  'Honduras':          ['America/Chicago'],
  'El Salvador':       ['America/Chicago'],
  'Cuba':              ['America/New_York'],
  'Jamaica':           ['America/New_York'],
  'Haiti':             ['America/New_York'],
  'Panama':            ['America/New_York'],
  'Colombia':          ['America/New_York'],
  'Ecuador':           ['America/New_York'],
  'Peru':              ['America/New_York'],
  'Bolivia':           ['America/Argentina/Buenos_Aires'],
  'Venezuela':         ['America/New_York'],
  'Argentina':         ['America/Argentina/Buenos_Aires'],
  'Chile':             ['America/Argentina/Buenos_Aires'],
  'Uruguay':           ['America/Argentina/Buenos_Aires'],
  'Paraguay':          ['America/Argentina/Buenos_Aires'],
  'Brazil':            ['America/Sao_Paulo'],
  'Uzbekistan':        ['Asia/Dhaka'],
  'Syria':             ['Asia/Dubai'],
  'Yemen':             ['Asia/Dubai'],
  'Moldova':           ['Europe/Athens'],
  'Albania':           ['Europe/Paris'],
  'Armenia':           ['Asia/Dubai'],
}

/**
 * Get timezones relevant to a country — falls back to full list
 */
export function getTimezonesForCountry(country: string): typeof TIMEZONES {
  const values = COUNTRY_TIMEZONES[country]
  if (!values || values.length === 0) return TIMEZONES
  const filtered = TIMEZONES.filter(tz => values.includes(tz.value))
  return filtered.length > 0 ? filtered : TIMEZONES
}

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
      parts.push(dt.toLocaleDateString('en-GB', {
        timeZone: tz, weekday: opts.short ? undefined : 'short', day: 'numeric', month: 'short',
      }))
    }
    if (opts.time !== false) {
      parts.push(dt.toLocaleTimeString('en-GB', {
        timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true,
      }))
    }
    return parts.join(' · ')
  } catch {
    return dt.toUTCString().slice(0, 22)
  }
}

export function formatDate(kickoff_utc: string, timezone: string): string {
  return formatKickoff(kickoff_utc, timezone, { date: true, time: false })
}

export function detectTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' }
  catch { return 'UTC' }
}
