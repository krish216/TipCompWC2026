/** @type {import('next').NextConfig} */
// Cache buster: 20260418-215104
const nextConfig = {
  generateBuildId: async () => '20260418215104',
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
