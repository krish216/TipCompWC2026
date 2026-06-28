import type { MetadataRoute } from 'next'

// Tells crawlers what to index and where the sitemap is. Private/app surfaces are
// disallowed so the public, content-rich pages are what gets evaluated.
export default function robots(): MetadataRoute.Robots {
  const base = 'https://tribepicks.com'
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/comp-admin', '/settings', '/api/', '/auth/', '/login'],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}
