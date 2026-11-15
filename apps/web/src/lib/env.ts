import { z } from 'zod';

const publicEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url().transform((url) => url.replace(/\/+$/, '')),
});

// Each NEXT_PUBLIC_ variable must be referenced literally so Next.js can inline it at build time.
export const env = publicEnvSchema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
});
