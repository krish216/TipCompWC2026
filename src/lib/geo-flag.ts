// Nationality flag for a tipster — resolved from their profile `country` (an ISO
// 3166-1 alpha-2 code), falling back to their IANA `timezone` when country is unset.
// Returns a regional-indicator emoji flag (🇦🇺) or '' when it can't be determined.
//
// Client-safe (no imports, pure functions) so both the API and components can use it.

import { COUNTRY_CODE_MAP } from './timezone'

// IANA timezone → ISO 3166-1 alpha-2. Covers the zones real browsers report for our
// user base (see profile timezones) plus common world cities. Zones not listed fall
// through to null (no flag) rather than guessing wrong. All Australia/* map to AU via
// the prefix rule below, so only non-AU zones need listing here.
const TZ_TO_ISO: Record<string, string> = {
  // Europe
  'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Lisbon': 'PT',
  'Europe/Paris': 'FR', 'Europe/Madrid': 'ES', 'Europe/Berlin': 'DE',
  'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE', 'Europe/Zurich': 'CH',
  'Europe/Vienna': 'AT', 'Europe/Rome': 'IT', 'Europe/Prague': 'CZ',
  'Europe/Warsaw': 'PL', 'Europe/Budapest': 'HU', 'Europe/Stockholm': 'SE',
  'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Europe/Helsinki': 'FI',
  'Europe/Athens': 'GR', 'Europe/Bucharest': 'RO', 'Europe/Sofia': 'BG',
  'Europe/Belgrade': 'RS', 'Europe/Zagreb': 'HR', 'Europe/Ljubljana': 'SI',
  'Europe/Bratislava': 'SK', 'Europe/Sarajevo': 'BA', 'Europe/Kiev': 'UA',
  'Europe/Kyiv': 'UA', 'Europe/Moscow': 'RU', 'Europe/Istanbul': 'TR',
  'Europe/Vilnius': 'LT', 'Europe/Riga': 'LV', 'Europe/Tallinn': 'EE',
  'Europe/Luxembourg': 'LU', 'Europe/Malta': 'MT', 'Atlantic/Faeroe': 'FO',
  'Atlantic/Reykjavik': 'IS',
  // Americas
  'America/New_York': 'US', 'America/Detroit': 'US', 'America/Chicago': 'US',
  'America/Denver': 'US', 'America/Phoenix': 'US', 'America/Los_Angeles': 'US',
  'America/Anchorage': 'US', 'America/Indianapolis': 'US', 'America/Indiana/Indianapolis': 'US',
  'Pacific/Honolulu': 'US', 'America/Toronto': 'CA', 'America/Vancouver': 'CA',
  'America/Winnipeg': 'CA', 'America/Edmonton': 'CA', 'America/Regina': 'CA',
  'America/Halifax': 'CA', 'America/Mexico_City': 'MX', 'America/Tijuana': 'MX',
  'America/Sao_Paulo': 'BR', 'America/Argentina/Buenos_Aires': 'AR',
  'America/Santiago': 'CL', 'America/Bogota': 'CO', 'America/Lima': 'PE',
  'America/Caracas': 'VE', 'America/Montevideo': 'UY', 'America/Guatemala': 'GT',
  'America/Panama': 'PA', 'America/Costa_Rica': 'CR', 'America/Jamaica': 'JM',
  'America/Havana': 'CU', 'America/Santo_Domingo': 'DO',
  // Asia / Middle East
  'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Shanghai': 'CN',
  'Asia/Hong_Kong': 'HK', 'Asia/Taipei': 'TW', 'Asia/Singapore': 'SG',
  'Asia/Kuala_Lumpur': 'MY', 'Asia/Jakarta': 'ID', 'Asia/Manila': 'PH',
  'Asia/Bangkok': 'TH', 'Asia/Ho_Chi_Minh': 'VN', 'Asia/Kolkata': 'IN',
  'Asia/Calcutta': 'IN', 'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD',
  'Asia/Kathmandu': 'NP', 'Asia/Colombo': 'LK', 'Asia/Almaty': 'KZ',
  'Asia/Tashkent': 'UZ', 'Asia/Dubai': 'AE', 'Asia/Qatar': 'QA',
  'Asia/Riyadh': 'SA', 'Asia/Kuwait': 'KW', 'Asia/Bahrain': 'BH',
  'Asia/Muscat': 'OM', 'Asia/Tehran': 'IR', 'Asia/Baghdad': 'IQ',
  'Asia/Amman': 'JO', 'Asia/Beirut': 'LB', 'Asia/Jerusalem': 'IL',
  'Asia/Yerevan': 'AM', 'Asia/Tbilisi': 'GE', 'Asia/Baku': 'AZ',
  // Africa
  'Africa/Cairo': 'EG', 'Africa/Casablanca': 'MA', 'Africa/Tunis': 'TN',
  'Africa/Algiers': 'DZ', 'Africa/Lagos': 'NG', 'Africa/Accra': 'GH',
  'Africa/Dakar': 'SN', 'Africa/Abidjan': 'CI', 'Africa/Nairobi': 'KE',
  'Africa/Dar_es_Salaam': 'TZ', 'Africa/Kampala': 'UG', 'Africa/Addis_Ababa': 'ET',
  'Africa/Kigali': 'RW', 'Africa/Johannesburg': 'ZA', 'Africa/Maputo': 'MZ',
  'Africa/Harare': 'ZW', 'Indian/Mauritius': 'MU',
  // Oceania (Australia/* handled by the prefix rule below)
  'Pacific/Auckland': 'NZ', 'Pacific/Fiji': 'FJ', 'Pacific/Port_Moresby': 'PG',
}

// A profile country may be an ISO2 code (what we store) or occasionally a full name.
export function isoFromCountryOrTimezone(country?: string | null, timezone?: string | null): string | null {
  const c = (country ?? '').trim()
  if (/^[A-Za-z]{2}$/.test(c)) return c.toUpperCase()          // already an ISO2 code
  if (c && COUNTRY_CODE_MAP[c]) return COUNTRY_CODE_MAP[c]      // full country name → ISO2

  const tz = (timezone ?? '').trim()
  if (tz) {
    if (TZ_TO_ISO[tz]) return TZ_TO_ISO[tz]
    if (tz.startsWith('Australia/')) return 'AU'               // every Australia/* zone is AU
  }
  return null
}

// ISO 3166-1 alpha-2 → regional-indicator emoji flag (🇦🇺). '' for anything invalid.
export function flagEmojiFromIso(iso?: string | null): string {
  const c = (iso ?? '').trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(c)) return ''
  return String.fromCodePoint(...[...c].map(ch => 0x1f1e6 + ch.charCodeAt(0) - 65))
}

// Convenience: profile (country, timezone) → flag emoji ('' when unknown).
export function tipsterFlag(country?: string | null, timezone?: string | null): string {
  return flagEmojiFromIso(isoFromCountryOrTimezone(country, timezone))
}
