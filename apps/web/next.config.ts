import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@teamboard/shared'],
  // Playwright builds into its own folder so an e2e run never overwrites the regular build.
  distDir: process.env['NEXT_DIST_DIR'] ?? '.next',
};

export default nextConfig;
