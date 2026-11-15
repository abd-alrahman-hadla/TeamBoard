import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { E2E } from './e2e-env';

/** Applies migrations to the e2e database. Specs create their own uniquely named users, so no reset is needed. */
export default function globalSetup(): void {
  const name = new URL(E2E.databaseUrl).pathname.slice(1);
  if (!name.endsWith('_e2e'))
    throw new Error(`Refusing to run e2e against "${name}": the name must end in _e2e`);

  const apiRoot = join(__dirname, '..', '..', 'api');
  execFileSync(
    process.execPath,
    [join(apiRoot, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy'],
    {
      cwd: apiRoot,
      env: { ...process.env, DATABASE_URL: E2E.databaseUrl },
      stdio: 'inherit',
    },
  );
}
