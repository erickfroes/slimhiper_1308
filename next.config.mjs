import { imageHosts } from './image-hosts.config.mjs';

const isProductionBuild = process.env.NODE_ENV === 'production';
// The nonce-based CSP is generated per request in src/proxy.ts.
const securityHeaders = [
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
  ...(isProductionBuild
    ? [
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        },
      ]
    : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  productionBrowserSourceMaps: process.env.ENABLE_PRODUCTION_SOURCE_MAPS === 'true',
  distDir: process.env.DIST_DIR || '.next',
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: imageHosts,
    minimumCacheTTL: 60,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
  webpack(config, { dev: dev }) {
    config.module.rules.push({
      test: /\.(jsx|tsx)$/,
      exclude: [/node_modules/],
      use: [
        {
          loader: '@dhiwise/component-tagger/nextLoader',
        },
      ],
    });
    if (dev) {
      const ignoredPaths = (process.env.WATCH_IGNORED_PATHS || '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      config.watchOptions = {
        ignored: ignoredPaths.length
          ? ignoredPaths.map((p) => `**/${p.replace(/^\/+|\/+$/g, '')}/**`)
          : undefined,
      };
    }
    return config;
  },
};
export default nextConfig;
