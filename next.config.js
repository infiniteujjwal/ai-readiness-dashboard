/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'ALLOWALL'
          },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors *"
          },
          {
            key: 'Access-Control-Allow-Origin',
            value: '*'
          }
        ]
      }
    ]
  }
}

module.exports = nextConfig
