const webPort = 3200;
const apiPort = 4200;

export const E2E = {
  webPort,
  apiPort,
  webUrl: `http://localhost:${webPort}`,
  apiUrl: `http://localhost:${apiPort}`,
  databaseUrl:
    process.env['E2E_DATABASE_URL'] ?? 'postgresql://teamboard:teamboard@localhost:5433/teamboard_e2e',
  /** Short on purpose, so the specs can watch a silent refresh happen. */
  accessTokenTtlSeconds: 10,
} as const;
