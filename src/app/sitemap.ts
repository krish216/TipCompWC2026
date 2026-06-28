import type { MetadataRoute } from 'next'
import { getActiveTournament, getTeamsAndFixtures, groupLetters } from '@/lib/content/wc'

export const revalidate = 3600

// Dynamic sitemap: the static pages plus every team and group content page, so the
// crawler can discover the whole public content layer (key for AdSense review).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = 'https://tribepicks.com'
  const cf = 'daily' as const
  const staticPages: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: cf, priority: 1 },
    { url: `${base}/teams`, changeFrequency: cf, priority: 0.8 },
    { url: `${base}/groups`, changeFrequency: cf, priority: 0.8 },
    { url: `${base}/bracket`, changeFrequency: cf, priority: 0.8 },
    { url: `${base}/bracket/how-it-works`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${base}/bracket/leaderboard`, changeFrequency: cf, priority: 0.6 },
    { url: `${base}/rules/wc2026`, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${base}/faq`, changeFrequency: 'weekly', priority: 0.5 },
  ]
  try {
    const t = await getActiveTournament()
    if (t) {
      const { teams } = await getTeamsAndFixtures(t.id)
      const groupPages: MetadataRoute.Sitemap = groupLetters(teams).map(g => ({
        url: `${base}/groups/${g.toLowerCase()}`, changeFrequency: cf, priority: 0.6,
      }))
      const teamPages: MetadataRoute.Sitemap = teams.map(tm => ({
        url: `${base}/teams/${tm.code}`, changeFrequency: cf, priority: 0.6,
      }))
      return [...staticPages, ...groupPages, ...teamPages]
    }
  } catch { /* fall back to static pages only */ }
  return staticPages
}
