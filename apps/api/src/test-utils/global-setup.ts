import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { assertTestDatabase, TEST_DATABASE_URL } from './test-env';

/** Applies migrations to the test database once per `pnpm test:int` run. */
export default function globalSetup(): void {
  assertTestDatabase(TEST_DATABASE_URL);
  const apiRoot = join(__dirname, '..', '..');
  execFileSync(
    process.execPath,
    [join(apiRoot, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy'],
    {
      cwd: apiRoot,
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: 'inherit',
    },
  );
}
