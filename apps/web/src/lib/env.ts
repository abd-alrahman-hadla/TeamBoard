import { z } from 'zod';

const trimSlash = (url: string) => url.replace(/\/+$/, '');

/** Absolute (http://localhost:4000) or same-origin path (/api, behind a proxy or Next rewrite). */
const apiUrlSchema = z.union([z.url(), z.string().regex(/^\/[\w\-/]*$/)]).transform(trimSlash);

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: apiUrlSchema,
  /** Where the Socket.io server is. Defaults to the API origin, or this page's origin when the API URL is a path. */
  NEXT_PUBLIC_SOCKET_URL: z.url().transform(trimSlash).optional(),
  /** Public demo: the login page offers one-click sign-in as the demo users. */
  NEXT_PUBLIC_DEMO_MODE: z.stringbool().default(false),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

// Each NEXT_PUBLIC_ variable must be referenced literally so Next.js can inline it at build time.
export const env: PublicEnv = publicEnvSchema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL || undefined,
  NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE || undefined,
});

/** Socket.io URL: explicit, else the API's origin, else undefined (= connect to the page's own origin). */
export function socketUrl(config: PublicEnv): string | undefined {
  if (config.NEXT_PUBLIC_SOCKET_URL) return config.NEXT_PUBLIC_SOCKET_URL;
  if (config.NEXT_PUBLIC_API_URL.startsWith('/')) return undefined;
  return new URL(config.NEXT_PUBLIC_API_URL).origin;
}
