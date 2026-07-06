import type { MetadataRoute } from 'next'
import { getPublicTournaments, getTeamsAndFixtures, groupLetters, playedRounds, roundSlug } from '@/lib/content/wc'

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
    { url: `${base}/bracket`, changeFrequency: cf, priority: 0.8 },
    { url: `${base}/bracket/how-it-works`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${base}/bracket/leaderboard`, changeFrequency: cf, priority: 0.6 },
    { url: `${base}/rules/wc2026`, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${base}/faq`, changeFrequency: 'weekly', priority: 0.5 },
  ]

  try {
    const tournaments = await getPublicTournaments()
    const contentPages: MetadataRoute.Sitemap = []
    for (const t of tournaments) {
      const { teams, fixtures } = await getTeamsAndFixtures(t.id)
      if (!teams.length) continue
      contentPages.push({ url: `${base}/${t.slug}/teams`, changeFrequency: cf, priority: 0.8 })
      for (const tm of teams) contentPages.push({ url: `${base}/${t.slug}/teams/${tm.code}`, changeFrequency: cf, priority: 0.6 })
      const groups = groupLetters(teams)
      if (groups.length) {
        contentPages.push({ url: `${base}/${t.slug}/groups`, changeFrequency: cf, priority: 0.8 })
        for (const g of groups) contentPages.push({ url: `${base}/${t.slug}/groups/${g.toLowerCase()}`, changeFrequency: cf, priority: 0.6 })
      }
      const rounds = playedRounds(fixtures)
      if (rounds.length) {
        contentPages.push({ url: `${base}/${t.slug}/recaps`, changeFrequency: cf, priority: 0.7 })
        for (const r of rounds) contentPages.push({ url: `${base}/${t.slug}/recaps/${roundSlug(r)}`, changeFrequency: 'weekly', priority: 0.6 })
      }
    }
    return [...staticPages, ...contentPages]
  } catch {
    return staticPages
  }
}
