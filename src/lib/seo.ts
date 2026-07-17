import { isValidElement, type ReactNode } from 'react'

// Central SEO constants + JSON-LD builders. Product-level (not World-Cup-only) so metadata
// and structured data describe the ongoing TribePicks product, not just one tournament.

export const SITE_URL   = 'https://tribepicks.com'
export const SITE_NAME  = 'TribePicks'
export const SITE_TITLE = 'TribePicks — free football prediction game'
export const SITE_DESCRIPTION =
  'Free football prediction game — tip every match, build tournament brackets, and run private comps with your mates. Climb the live leaderboard and win bragging rights. No betting.'

export const SOCIAL_URLS = [
  'https://www.facebook.com/TribePicks',
  'https://www.instagram.com/tribepicks.app/',
  'https://x.com/TribePicks',
  'https://www.tiktok.com/@tribepicks',
  'https://www.reddit.com/user/TribePicks/',
  'https://www.linkedin.com/company/Tribepicks',
]

// Site-wide graph — Organization + WebSite + WebApplication, linked by @id so engines
// resolve them as one entity. No SearchAction (the site has no search endpoint).
export function siteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/logo.png`,
        description: SITE_DESCRIPTION,
        sameAs: SOCIAL_URLS,
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        publisher: { '@id': `${SITE_URL}/#organization` },
        inLanguage: 'en',
      },
      {
        '@type': 'WebApplication',
        '@id': `${SITE_URL}/#app`,
        name: SITE_NAME,
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        applicationCategory: 'GameApplication',
        operatingSystem: 'Web browser',
        browserRequirements: 'Requires JavaScript.',
        // Free to play (optional paid Pro tier exists, but the base game is free).
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
    ],
  }
}

// FAQPage from clean {q, a} string pairs.
export function faqJsonLd(items: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(it => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a },
    })),
  }
}

// Flatten a React node (string | JSX | array) to plain text — used to derive FAQ answer
// text for FAQPage schema from answers that are authored as JSX (with links etc.).
export function nodeToText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeToText).join('')
  if (isValidElement(node)) return nodeToText((node.props as { children?: ReactNode })?.children)
  return ''
}
