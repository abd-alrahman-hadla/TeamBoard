import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { baseConfig } from '../../eslint.config.base.mjs';

export default [
  { ignores: ['.next/**', '.next-e2e/**', 'next-env.d.ts', 'playwright-report/**', 'test-results/**'] },
  ...baseConfig,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.mjs', 'postcss.config.mjs'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { '@next/next': nextPlugin, 'react-hooks': reactHooks },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    // Next.js requires default exports from these files.
    files: [
      'src/app/**/{page,layout,loading,error,not-found,template,default,global-error}.tsx',
      'src/middleware.ts',
      'e2e/global-setup.ts',
      'playwright.config.ts',
      'vitest.config.mts',
      'next.config.ts',
    ],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'e2e/**'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
];
