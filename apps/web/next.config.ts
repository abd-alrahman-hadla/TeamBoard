import type { NextConfig } from 'next';
import { resolve } from 'node:path';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@teamboard/shared'],
  // Playwright builds into its own folder so an e2e run never overwrites the regular build.
  distDir: process.env['NEXT_DIST_DIR'] ?? '.next',
  // Vercel: REST goes through this rewrite so auth cookies stay first-party (Safari blocks
  // third-party cookies). Sockets connect straight to the API (NEXT_PUBLIC_SOCKET_URL).
  rewrites() {
    const origin = process.env['API_ORIGIN']?.replace(/\/+$/, '');
    return Promise.resolve(origin ? [{ source: '/api/:path*', destination: `${origin}/:path*` }] : []);
  },
  // The Docker image runs the self-contained server (`next start` doesn't support standalone output).
  ...(process.env['NEXT_OUTPUT'] === 'standalone'
    ? { output: 'standalone' as const, outputFileTracingRoot: resolve(process.cwd(), '../..') }
    : {}),
};

export default nextConfig;
