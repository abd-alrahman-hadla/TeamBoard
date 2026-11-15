/** Named throttlers used on AuthController. Limits come from AUTH_RATE_LIMIT (see app.module.ts). */
export const THROTTLE = { auth: 'auth', refresh: 'refresh' } as const;
