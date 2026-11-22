import type { NextConfig } from 'next';

/**
 * One codebase, two build targets:
 *   INQUIZITIVE_TARGET=static  → `out/` static export (desktop app via Tauri, or a no-server web build)
 *   INQUIZITIVE_TARGET=server  → standalone Node server with API routes (Docker / Kubernetes)
 * Server-only route handlers are named `route.server.ts` so the static export never sees them.
 */
const target = process.env.INQUIZITIVE_TARGET === 'static' ? 'static' : 'server';

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // React needs eval() for dev tooling only; production builds never allow it.
      `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join('; '),
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  output: target === 'static' ? 'export' : 'standalone',
  pageExtensions: target === 'static' ? ['tsx', 'ts'] : ['server.ts', 'tsx', 'ts'],
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  serverExternalPackages: ['pg'],
  ...(target === 'server'
    ? { headers: async () => [{ source: '/:path*', headers: securityHeaders }] }
    : {}),
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
