/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Type errors are caught locally — don't block production builds
    ignoreBuildErrors: true,
  },
  eslint: {
    // ESLint errors are caught locally — don't block production builds
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'www.gravatar.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
    ],
  },
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
  async redirects() {
    return [
      { source: '/home', destination: '/predict', permanent: true },
    ]
  },
  poweredByHeader: false,
  reactStrictMode: true,
}

module.exports = nextConfig
