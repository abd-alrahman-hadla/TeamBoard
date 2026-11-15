/** Cookie names shared by the API (which sets them) and the web middleware (which reads the hint). */
export const AUTH_COOKIES = {
  /** httpOnly refresh token, Path=/auth. */
  refreshToken: 'tb_rt',
  /** Non-httpOnly hint used only for UX redirects in Next middleware. Never trusted for auth. */
  sessionHint: 'tb_session',
} as const;
