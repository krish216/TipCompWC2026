import { createAdminClient } from '@/lib/supabase'

// Server-side reads shared by the public /melbourne-cup pages (landing, sweep sheet, results).

export const CUP_SLUG = 'melbourne-cup-2026'

// The Cup share card (./opengraph-image.tsx). A page that sets its own openGraph loses the
// segment's image, so the pages under /melbourne-cup name it explicitly.
export const CUP_OG_IMAGES = [{ url: 'https://tribepicks.com/melbourne-cup/opengraph-image', width: 1200, height: 630, alt: 'Melbourne Cup 2026 sweeps on TribePicks' }]

export type Cup = {
  id: string; name: string; race_date: string | null; race_start_at: string | null
  enrollment_open: boolean | null; sweep_draw_open: boolean | null
}

export async function getCup(): Promise<Cup | null> {
  try {
    const admin = createAdminClient()
    const cols = 'id, name, race_date:end_date, race_start_at, enrollment_open'
    let { data, error } = await (admin.from('tournaments') as any).select(`${cols}, sweep_draw_open`).eq('slug', CUP_SLUG).maybeSingle()
    // sweep_draw_open arrives with migration 201 — don't lose the whole page without it.
    if (error) ({ data } = await (admin.from('tournaments') as any).select(cols).eq('slug', CUP_SLUG).maybeSingle())
    return data as Cup | null
  } catch { return null }
}

export type FieldHorse = { number: number; name: string; scratched: boolean; finish_position: number | null; did_not_finish: boolean }

// The declared field — numbers, names and the official result only; no form or opinions.
// '*' so it reads before migration 206 (did_not_finish).
export async function getField(tournamentId: string): Promise<FieldHorse[]> {
  try {
    const { data } = await (createAdminClient().from('sweep_horses') as any)
      .select('*').eq('tournament_id', tournamentId).order('number')
    return ((data ?? []) as any[]).map(h => ({
      number: h.number, name: h.name, scratched: !!h.scratched,
      finish_position: h.finish_position ?? null, did_not_finish: !!h.did_not_finish,
    }))
  } catch { return [] }
}

export function raceDayLabel(cup: Pick<Cup, 'race_date' | 'race_start_at'> | null): string {
  if (cup?.race_start_at) {
    return new Date(cup.race_start_at).toLocaleString('en-AU', {
      weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Melbourne',
    }) + ' (Melbourne time)'
  }
  if (cup?.race_date) {
    return new Date(`${cup.race_date}T00:00:00Z`).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
  }
  return 'Tuesday 3 November'
}
