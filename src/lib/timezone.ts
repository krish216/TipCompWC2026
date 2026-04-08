/**
 * Timezone utilities — format fixture dates/times in the player's local timezone
 */

// Timezone zones with friendly city names
const TIMEZONE_ZONES = [
  { value: 'UTC',                              city: 'UTC' },
  { value: 'Europe/London',                    city: 'London' },
  { value: 'Europe/Paris',                     city: 'Paris / Berlin' },
  { value: 'Europe/Athens',                    city: 'Athens / Helsinki' },
  { value: 'Europe/Moscow',                    city: 'Moscow' },
  { value: 'Asia/Dubai',                       city: 'Dubai' },
  { value: 'Asia/Karachi',                     city: 'Karachi' },
  { value: 'Asia/Kolkata',                     city: 'Mumbai / Delhi' },
  { value: 'Asia/Dhaka',                       city: 'Dhaka' },
  { value: 'Asia/Bangkok',                     city: 'Bangkok' },
  { value: 'Asia/Singapore',                   city: 'Singapore / KL' },
  { value: 'Asia/Tokyo',                       city: 'Tokyo / Seoul' },
  { value: 'Australia/Sydney',                 city: 'Sydney' },
  { value: 'Australia/Melbourne',              city: 'Melbourne' },
  { value: 'Australia/Brisbane',               city: 'Brisbane' },
  { value: 'Australia/Adelaide',               city: 'Adelaide' },
  { value: 'Australia/Perth',                  city: 'Perth' },
  { value: 'Australia/Darwin',                 city: 'Darwin' },
  { value: 'Pacific/Auckland',                 city: 'Auckland' },
  { value: 'Pacific/Honolulu',                 city: 'Honolulu' },
  { value: 'America/Anchorage',                city: 'Anchorage' },
  { value: 'America/Los_Angeles',              city: 'Los Angeles / Vancouver' },
  { value: 'America/Denver',                   city: 'Denver' },
  { value: 'America/Chicago',                  city: 'Chicago / Mexico City' },
  { value: 'America/New_York',                 city: 'New York / Toronto' },
  { value: 'America/Sao_Paulo',                city: 'São Paulo' },
  { value: 'America/Argentina/Buenos_Aires',   city: 'Buenos Aires' },
  { value: 'Africa/Lagos',                     city: 'Lagos' },
  { value: 'Africa/Johannesburg',              city: 'Johannesburg' },
  { value: 'Africa/Nairobi',                   city: 'Nairobi' },
  { value: 'Africa/Cairo',                     city: 'Cairo' },
  { value: 'Indian/Mauritius',                 city: 'Mauritius' },
]

/**
 * Compute the current GMT offset for a timezone as a string like "GMT+10:00"
 * Uses Intl.DateTimeFormat to get the actual current offset (DST-aware)
 */
function getGMTOffset(tzValue: string): string {
  if (tzValue === 'UTC') return 'GMT+0:00'
  try {
    const now   = new Date()
    const parts = new Intl.DateTimeFormat('en', {
      timeZone:       tzValue,
      timeZoneName:   'shortOffset',
    }).formatToParts(now)
    const offsetPart = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT'
    // offsetPart is like "GMT+10", "GMT-5", "GMT+5:30", "GMT"
    if (offsetPart === 'GMT') return 'GMT+0:00'
    // Normalise to always show sign and two-digit hours: GMT+10:00
    const match = offsetPart.match(/GMT([+-])(\d+)(?::(\d+))?/)
    if (!match) return offsetPart
    const sign    = match[1]
    const hours   = match[2].padStart(2, '0')
    const minutes = (match[3] ?? '00').padStart(2, '0')
    return `GMT${sign}${hours}:${minutes}`
  } catch {
    return 'GMT'
  }
}

/**
 * Build TIMEZONES array with dynamic GMT offset labels.
 * Safe to call on both server and client.
 */
function buildTimezones() {
  return TIMEZONE_ZONES.map(({ value, city }) => ({
    value,
    label: `${getGMTOffset(value)} — ${city}`,
  }))
}

export const TIMEZONES = buildTimezones()

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
