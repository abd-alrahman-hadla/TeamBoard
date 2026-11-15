import globals from 'globals';
import { baseConfig } from '../../eslint.config.base.mjs';

export default [
  { ignores: ['dist/**'] },
  ...baseConfig,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.mjs'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
