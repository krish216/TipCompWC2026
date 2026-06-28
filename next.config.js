/** @type {import('next').NextConfig} */
// Cache buster: 20260418-215104
const nextConfig = {
  // Fixed build ID only in production (cache-busting). In dev, a constant build
  // ID desyncs from the HMR hot-update manifest and makes _next/static chunks
  // 404 after the first hot reload — so let dev use its default 'development' ID.
  ...(process.env.NODE_ENV === 'production' ? { generateBuildId: async () => '20260418215104' } : {}),
  // Image domains for avatars (Supabase storage + Gravatar)
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'www.gravatar.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
    ],
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',         value: 'DENY' },
          { key: 'X-Content-Type-Options',   value: 'nosniff' },
          { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',       value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },

  // Redirect / → /predict (also handled in page.tsx)
  async redirects() {
    return [
      { source: '/home', destination: '/predict', permanent: true },
    ]
  },

  // Disable x-powered-by header
  poweredByHeader: false,

  // Enable React strict mode
  reactStrictMode: true,

  eslint: { ignoreDuringBuilds: true },
}

module.exports = nextConfig
