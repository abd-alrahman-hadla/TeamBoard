import globals from 'globals';
import { baseConfig } from '../../eslint.config.base.mjs';

export default [
  { ignores: ['dist/**', 'src/generated/**', 'coverage/**'] },
  ...baseConfig,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parserOptions: {
        projectService: { allowDefaultProject: ['jest.config.mjs', 'eslint.config.mjs'] },
        tsconfigRootDir: import.meta.dirname,
        // Keeps consistent-type-imports from turning DI/DTO imports into type-only imports.
        emitDecoratorMetadata: true,
        experimentalDecorators: true,
      },
    },
  },
  {
    // Jest requires globalSetup modules to default-export a function.
    files: ['src/test-utils/global-setup.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['**/*.spec.ts', '**/*.int-spec.ts', 'src/test-utils/**'],
    rules: {
      // supertest bodies are untyped JSON; tests narrow them with the shared Zod schemas.
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
];
