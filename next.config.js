/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Allow embedding from anywhere
          {
            key: 'X-Frame-Options',
            value: 'ALLOWALL'
          },
          // Modern CSP for embedding - allows SharePoint domains
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' https://*.sharepoint.com https://*.microsoft.com https://*.office.com https://*.office365.com *"
          },
          // CORS headers
          {
            key: 'Access-Control-Allow-Origin',
            value: '*'
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, OPTIONS'
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: '*'
          }
        ]
      }
    ]
  }
}

module.exports = nextConfig
