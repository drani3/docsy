/** @type {import('next').NextConfig} */

// Sent with every response. No Content-Security-Policy yet: Next.js needs
// per-request nonces for one, which is worth doing before launch.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
]

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Always fetch fresh data when navigating to a page: conversation lists and
    // message history change on every question
    staleTimes: { dynamic: 0 },
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

module.exports = nextConfig
