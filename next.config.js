/** @type {import('next').NextConfig} */
const nextConfig = {
  // Increase body size limit for TUS chunked uploads
  // TUS uploads can send chunks larger than 10MB (default Next.js limit)
  // Set to 100MB to handle large video chunks safely
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb'
    }
  },

  // SECURITY: Add comprehensive security headers
  async headers() {
    // Check if HTTPS is enabled (via environment variable)
    const isHttpsEnabled = process.env.HTTPS_ENABLED === 'true' || process.env.HTTPS_ENABLED === '1';
    const tusEndpoint = process.env.NEXT_PUBLIC_TUS_ENDPOINT
    const cspDirectives = [
      {
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
          "style-src 'self' 'unsafe-inline' https:",
          "img-src * data: blob:",
          "font-src * data:",
          `connect-src 'self' blob: ${tusEndpoint || ''} https:`,
          "media-src * blob:",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'none'",
        ]
      },
      {
        key: 'X-DNS-Prefetch-Control',
        value: 'on'
      },
      {
        key: 'X-Frame-Options',
        value: 'DENY'
      },
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff'
      },
      {
        key: 'Referrer-Policy',
        value: 'same-origin'
      },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()'
      }
    ];

    // Only upgrade to HTTPS when HTTPS is actually enabled
    if (isHttpsEnabled) {
      cspDirectives[0].value.push('upgrade-insecure-requests');
    }

    const securityHeaders = cspDirectives.map(header => {
      if (header.key === 'Content-Security-Policy') {
        return { ...header, value: header.value.join('; ') };
      }
      return header;
    });

    // Only add HSTS when HTTPS is enabled
    if (isHttpsEnabled) {
      securityHeaders.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload'
      });
    }

    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        // Share links - still deny framing for security
        source: '/share/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          }
        ]
      }
    ]
  }
}

module.exports = nextConfig
