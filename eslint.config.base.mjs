import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Shared flat config. Each package spreads this and adds its own globals,
 * parserOptions.tsconfigRootDir and framework plugins.
 */
export const baseConfig = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': 'allow-with-description', 'ts-ignore': true },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message: 'Use named exports. Default exports are only allowed where a framework requires them.',
        },
      ],
    },
  },
  {
    files: ['**/*.config.{js,mjs,cjs,ts,mts}', '**/*.config.base.mjs'],
    rules: { 'no-restricted-syntax': 'off' },
  },
);
