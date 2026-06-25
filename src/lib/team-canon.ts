// Client-safe team-name canonicalisation. Maps the various spellings of the same
// nation (our seed vs API-Football vs ESPN — e.g. "United States" / "USA",
// "Czechia" / "Czech Republic") to a single token so name-based matching is robust.
// Kept in its own tiny module so both server routes and client components can use it.

const TEAM_ALIASES: Record<string, string> = {
  southkorea: 'korea', korearepublic: 'korea', korea: 'korea',
  usa: 'usa', unitedstates: 'usa', unitedstatesofamerica: 'usa',
  iran: 'iran', iriran: 'iran',
  cotedivoire: 'ivorycoast', ivorycoast: 'ivorycoast',
  caboverde: 'capeverde', capeverde: 'capeverde', capeverdeislands: 'capeverde',
  curazao: 'curacao', curacao: 'curacao',
  czechia: 'czechrepublic', czechrepublic: 'czechrepublic',
  bosniaandherzegovina: 'bosnia', bosniaherzegovina: 'bosnia', bosnia: 'bosnia',
  turkey: 'turkey', turkiye: 'turkey',
  drcongo: 'congo', congodr: 'congo', democraticrepublicofcongo: 'congo',
}

/** Canonical, accent/punctuation-insensitive team token used for matching. */
export function canonTeam(name?: string | null): string {
  if (!name) return ''
  const n = name
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase().replace(/[^a-z0-9]/g, '')           // strip spaces/punctuation
  return TEAM_ALIASES[n] ?? n
}
