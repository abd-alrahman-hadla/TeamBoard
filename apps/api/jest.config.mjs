/** @type {import('jest').Config} */
const common = {
  rootDir: '.',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  // The generated Prisma client uses `.js` suffixes on relative imports of `.ts` files.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
};

/** @type {import('jest').Config} */
const config = {
  projects: [
    {
      ...common,
      displayName: 'unit',
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
    },
    {
      ...common,
      displayName: 'int',
      testMatch: ['<rootDir>/src/**/*.int-spec.ts'],
      globalSetup: '<rootDir>/src/test-utils/global-setup.ts',
    },
  ],
};

export default config;
