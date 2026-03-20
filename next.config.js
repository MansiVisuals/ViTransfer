const createNextIntlPlugin = require('next-intl/plugin')
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Increase body size limit for TUS chunked uploads
  // TUS uploads can send chunks larger than 10MB (default Next.js limit)
  // Set to 100MB to handle large video chunks safely
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb'
    }
  },

  // Security headers are set in src/middleware.ts (nonce-based CSP)
  // Static asset headers below cover paths that bypass middleware
  async headers() {
    return [
      {
        source: '/:path(brand|favicon|manifest\\.json|robots\\.txt|sw\\.js)/:rest*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'same-origin' },
        ],
      },
    ]
  }
}

module.exports = withNextIntl(nextConfig)
