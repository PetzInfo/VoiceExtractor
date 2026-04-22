import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: '50mb' }
  },
  // Raise the body size limit for API routes (e.g. large video uploads)
  middlewareClientMaxBodySize: '500mb',
}

export default nextConfig
