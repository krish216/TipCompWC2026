// Serves /ads.txt for Google AdSense, derived from NEXT_PUBLIC_ADSENSE_CLIENT so
// the publisher id isn't hard-coded. AdSense requires this file at the domain
// root to authorise the account to monetise the site.
export const dynamic = 'force-static'

export function GET() {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || ''
  const pub = client.replace(/^ca-/, '') // ca-pub-XXXX -> pub-XXXX
  const body = pub
    ? `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`
    : '# ads.txt — set NEXT_PUBLIC_ADSENSE_CLIENT to populate this file\n'
  return new Response(body, { headers: { 'content-type': 'text/plain' } })
}
