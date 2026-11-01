// Which of Vicky & Gordo's voices are on for a sweep tournament — switched on /admin.
// tournaments.sweep_voices (migration 210) is the master switch; sweep_voice_parts
// (migration 211) turns single parts off: { draw_calls: false } etc. A missing key is on, so
// a new part ships switched on and both columns work before their migrations have run.
// Plain data, so the API routes and the pages share it.

export const VOICE_PARTS = [
  { key: 'draw_calls',    label: 'Draw calls',          note: 'Vicky calls the horse as the wheel lands.' },
  { key: 'gordo_luck',    label: 'Gordo’s good-luck line', note: 'Gordo’s sign-off after every draw call.' },
  { key: 'intro',         label: 'Sweep intro',         note: '“Hear Vicky & Gordo” by the race countdown.' },
  { key: 'practice_race', label: 'Voiced practice race', note: 'Off → practice races run as the plain animation.' },
  { key: 'outro',         label: 'Race outro',          note: 'Their banter after the line in a voiced practice race.' },
  { key: 'request_call',  label: 'New-request call',    note: 'Vicky’s “Ka-ching!” on sweep-admin, for organisers who tick it.' },
] as const

export type VoicePart = (typeof VOICE_PARTS)[number]['key']
export type Voices = Record<VoicePart, boolean>

export const ALL_VOICES_ON: Voices = Object.fromEntries(VOICE_PARTS.map(p => [p.key, true])) as Voices

// From a tournaments row (any shape — '*' selects): every part off when the master is off.
export function voicesFor(t: { sweep_voices?: boolean | null; sweep_voice_parts?: Record<string, unknown> | null } | null | undefined): Voices {
  const master = t?.sweep_voices !== false
  const parts = t?.sweep_voice_parts ?? {}
  return Object.fromEntries(VOICE_PARTS.map(p => [p.key, master && parts[p.key] !== false])) as Voices
}
