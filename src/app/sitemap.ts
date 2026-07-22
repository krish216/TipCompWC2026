import type { MetadataRoute } from 'next'
import { getPublicTournaments, getTeamsAndFixtures, groupLetters, playedRounds, roundSlug } from '@/lib/content/wc'
import { createAdminClient } from '@/lib/supabase'

export const revalidate = 3600

// Dynamic sitemap: static pages plus every tournament's team and group content pages
// (tournament-scoped URLs, e.g. /wc2026/teams/arg), so the crawler discovers the whole
// public content layer across all tournaments. Bare /teams,/groups are omitted — they
// 307-redirect to the active tournament's canonical URLs.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = 'https://tribepicks.com'
  const cf = 'daily' as const
  const staticPages: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: cf, priority: 1 },
    { url: `${base}/about`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/bracket`, changeFrequency: cf, priority: 0.8 },
    { url: `${base}/bracket/how-it-works`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${base}/bracket/leaderboard`, changeFrequency: cf, priority: 0.6 },
    { url: `${base}/epl`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}/rules/epl-2026-27`, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${base}/rules/wc2026`, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${base}/faq`, changeFrequency: 'weekly', priority: 0.5 },
  ]

  try {
    const tournaments = await getPublicTournaments()
    const contentPages: MetadataRoute.Sitemap = []
    for (const t of tournaments) {
      const { teams, fixtures } = await getTeamsAndFixtures(t.id)
      if (!teams.length) continue
      const rounds = playedRounds(fixtures)
      // Only list a tournament once it has real match data. Pre-season tournaments are
      // all templated shells (no results/recaps) — indexing them dilutes the site with
      // thin pages, so keep them out of the sitemap (and they're noindex'd too).
      if (!rounds.length) continue
      contentPages.push({ url: `${base}/${t.slug}`, changeFrequency: cf, priority: 0.7 })  // tournament "Wrapped" retro root
      contentPages.push({ url: `${base}/${t.slug}/teams`, changeFrequency: cf, priority: 0.8 })
      for (const tm of teams) contentPages.push({ url: `${base}/${t.slug}/teams/${tm.code}`, changeFrequency: cf, priority: 0.6 })
      const groups = groupLetters(teams)
      if (groups.length) {
        contentPages.push({ url: `${base}/${t.slug}/groups`, changeFrequency: cf, priority: 0.8 })
        for (const g of groups) contentPages.push({ url: `${base}/${t.slug}/groups/${g.toLowerCase()}`, changeFrequency: cf, priority: 0.6 })
      }
      contentPages.push({ url: `${base}/${t.slug}/recaps`, changeFrequency: cf, priority: 0.7 })
      for (const r of rounds) contentPages.push({ url: `${base}/${t.slug}/recaps/${roundSlug(r)}`, changeFrequency: 'weekly', priority: 0.6 })
    }

    // Public dynamic entity pages — match challenges (/match/{slug}), bracket boards
    // (/bracket/leaderboard/{slug}) and open, discoverable comps (/c/{slug}). Wrapped in its
    // own try so a failure here still returns the tournament content pages above.
    // NB: tipster/[id] and chief/[id] profiles are intentionally NOT listed yet (1,300+ users
    // — pending a volume/indexing decision).
    try {
      const admin = createAdminClient()
      const { data: challenges } = await (admin.from('challenges') as any)
        .select('slug, type, enabled').eq('enabled', true).not('slug', 'is', null)
      for (const ch of (challenges ?? []) as { slug: string; type: string }[]) {
        if (ch.type === 'match')   contentPages.push({ url: `${base}/match/${ch.slug}`, changeFrequency: 'weekly', priority: 0.6 })
        if (ch.type === 'bracket') contentPages.push({ url: `${base}/bracket/leaderboard/${ch.slug}`, changeFrequency: cf, priority: 0.6 })
      }
      const { data: comps } = await (admin.from('comps') as any)
        .select('slug').eq('visibility', 'open').eq('is_discoverable', true).not('slug', 'is', null)
      for (const c of (comps ?? []) as { slug: string }[]) {
        contentPages.push({ url: `${base}/c/${c.slug}`, changeFrequency: 'weekly', priority: 0.5 })
      }
    } catch { /* skip dynamic entity pages if the DB query fails */ }

    return [...staticPages, ...contentPages]
  } catch {
    return staticPages
  }
}
